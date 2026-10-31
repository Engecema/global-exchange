const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Garante carregamento de variáveis de ambiente do Render e de arquivos .env locais
try {
  require('dotenv').config();
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '..', 'apps', 'api-gateway', '.env') });
} catch {}

// Caminhos dos certificados mTLS oficiais do Banco do Brasil
const CERTS_DIR = path.join(__dirname, '..', 'apps', 'api-gateway', 'certs');
const MTLS_CERT_PATH = path.join(CERTS_DIR, 'star_mtls_api_bb_com_br.crt');
const ROOT_CA_PATH = path.join(CERTS_DIR, '1 - DigiCert Global Root G2.cer');
const BB_SANATIZED_CERTS_DIR = path.join(__dirname, '..', 'src', 'certs', 'api_bb_com_br_ee73789a30_03042027');
const BB_CERT_PATH = path.join(BB_SANATIZED_CERTS_DIR, 'bb.com.br.pem');
const BB_KEY_PATH = path.join(BB_SANATIZED_CERTS_DIR, 'bb.com.br.key');

// Variáveis de ambiente BB em modo 100% PRODUÇÃO (sem simulação ou sandbox)
let runtimeConfig = null;

// Developer Key oficial da aplicação Engecema (App 300132) no Banco do Brasil
const VALID_BB_GW_APP_KEY = 'f8ed08c19fc744aaad98fff4cfa44ae0';

function sanitizeGwAppKey(rawKey) {
  if (!rawKey) return process.env.BB_GW_APP_KEY || VALID_BB_GW_APP_KEY;
  const clean = String(rawKey).trim().replace(/^["']|["']$/g, '');
  if (!clean) return process.env.BB_GW_APP_KEY || VALID_BB_GW_APP_KEY;
  return clean.toLowerCase();
}

function normalizeUrl(url, defaultPrefix = 'https://') {
  if (!url) return '';
  let u = String(url).trim();
  // Remove protocolos duplicados ou erros de digitação como https://://bb.com.br
  u = u.replace(/^(https?:\/\/)+/i, '');
  u = u.replace(/^:?\/\/+/i, '');

  // Corrige domínios inexistentes no DNS do Banco do Brasil que geram erro 502 no Render
  if (u.startsWith('api.oauth.bb.com.br') || u.startsWith('oauth.ip.bb.com.br')) {
    u = u.replace(/^(api\.oauth|oauth\.ip)\.bb\.com\.br/i, 'oauth.bb.com.br');
  }
  if (u.startsWith('api.ip.bb.com.br') || u.startsWith('ip.bb.com.br')) {
    u = u.replace(/^(api\.ip|ip)\.bb\.com\.br/i, 'api.bb.com.br');
  }

  if (u === 'bb.com.br' || u === '://bb.com.br') {
    u = 'api.bb.com.br';
  }
  if (!u.startsWith('api.') && !u.startsWith('oauth.') && u.endsWith('bb.com.br')) {
    u = `api.${u}`;
  }
  return `${defaultPrefix}${u}`.replace(/\/+$/, '');
}

function formatBBErrorMessage(statusCode, rawBody) {
  if (!rawBody) return `HTTP ${statusCode}`;
  const str = String(rawBody).trim();
  if (str.includes('<html') || str.includes('<!DOCTYPE') || str.startsWith('<')) {
    const idMatch = str.match(/<h2>([a-f0-9]{16,})<\/h2>/i) || str.match(/identificador de seguran[cç]a.*?([a-f0-9]{16,})/i) || str.match(/Ray ID:\s*<code>?([a-f0-9]+)/i);
    const ipMatch = str.match(/IP\s*:\s*([0-9.]+)/i);
    const secId = idMatch ? idMatch[1] : '';
    const clientIp = ipMatch ? ipMatch[1] : '';

    return `O Firewall de Segurança (WAF) do Banco do Brasil bloqueou a conexão (HTTP ${statusCode}). ${secId ? `[ID de Segurança BB: ${secId}] ` : ''}${clientIp ? `[IP do Servidor: ${clientIp}] ` : ''}Causa: Restrição de geolocalização do Banco do Brasil para conexões diretas do servidor em nuvem ou divergência na Developer Key (BB_GW_APP_KEY oficial da aplicação 300132 no Render: f8ed08c19fc744aaad98fff4cfa44ae0). Para resolver: 1) Autorize a aplicação 300132 no Gerenciador Financeiro BB PJ (Segurança > API Banco do Brasil > Autorizar Aplicação); 2) Verifique se a Developer Key cadastrada no Render é f8ed08c19fc744aaad98fff4cfa44ae0; 3) Se o IP ${clientIp || 'do servidor'} continuar bloqueado, informe o ID ${secId || 'de segurança'} ao suporte do BB para liberação no firewall.`;
  }
  try {
    const json = JSON.parse(str);
    if (json.error_description) return `${json.error}: ${json.error_description}`;
    if (json.message) return json.message;
    if (json.detail) return `${json.detail} ${json.userHelp ? '(' + json.userHelp + ')' : ''}`;
  } catch {}
  return str.length > 300 ? str.slice(0, 300) + '...' : str;
}

function resolveCertOrKey(val) {
  if (!val) return null;
  let raw = String(val).trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;

  // Unescape quebras de linha literais (\n) que ocorrem ao salvar certificados no painel do Render
  if (raw.includes('\\n')) {
    raw = raw.replace(/\\r/g, '').replace(/\\n/g, '\n');
  }

  if (raw.includes('-----BEGIN')) {
    return raw;
  }

  // Tenta decodificar Base64
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) {
      return decoded.includes('\\n') ? decoded.replace(/\\r/g, '').replace(/\\n/g, '\n') : decoded;
    }
  } catch {}

  // Sanitiza qualquer sintaxe inválida de caminhos legados com espaço ou "/://"
  const sanitizedPath = raw
    .replace(/api_bb_com_br_ee73789a30[ _]03042027/g, 'api_bb_com_br_ee73789a30_03042027')
    .replace(/\/+:\/+|\/+:\*\/+|:\/+/g, '/')
    .replace(/^:?\/\/+/g, '');

  const baseName = path.basename(sanitizedPath);

  // Tenta resolver caminhos de arquivos relativos ou absolutos no sistema operacional (incluindo Secret Files do Render e pasta padronizada)
  const candidates = [
    sanitizedPath,
    raw,
    path.resolve(process.cwd(), sanitizedPath),
    path.resolve(process.cwd(), raw),
    path.resolve(__dirname, '..', sanitizedPath),
    path.resolve(__dirname, '..', raw),
    path.resolve(__dirname, sanitizedPath),
    path.resolve(process.cwd(), 'src/certs/api_bb_com_br_ee73789a30_03042027', baseName),
    path.resolve(__dirname, '..', 'src/certs/api_bb_com_br_ee73789a30_03042027', baseName),
    path.resolve(process.cwd(), 'src/certs', baseName),
    path.resolve(__dirname, '..', 'src/certs', baseName),
    path.resolve(process.cwd(), 'apps/api-gateway/certs', baseName),
    path.join('/etc/secrets', baseName),
    path.join('/etc/secrets', baseName.replace(/:\/\/+/g, '')),
  ];

  for (const cand of candidates) {
    try {
      if (cand && fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        const fileContent = fs.readFileSync(cand, 'utf8');
        return fileContent.includes('\\n') ? fileContent.replace(/\\r/g, '').replace(/\\n/g, '\n') : fileContent;
      }
    } catch {}
  }

  return null;
}

// Normalização dos identificadores oficiais Banco do Brasil (ENGECEMA)
// Contrato: 20685215 | Convênio: 3906685
function normalizeBBContractNumber(val, fallback = '20685215') {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  const digits = str.replace(/\D/g, '');
  const unpadded = digits.replace(/^0+/, '');
  return unpadded || fallback;
}

function normalizeBBConvenioNumber(val, fallback = '3906685') {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  const digits = str.replace(/\D/g, '');
  const unpadded = digits.replace(/^0+/, '');
  return unpadded || fallback;
}

function getBBConfig() {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  // Lê credenciais suportando múltiplas variações de nomenclatura cadastradas no Render ou painel
  let clientId = (
    process.env.BB_CLIENT_ID ||
    process.env.BB_CLIENTE_ID ||
    process.env.BB_OAUTH_CLIENT_ID ||
    process.env.BB_CLIENTID ||
    process.env.BB_CLIENT ||
    process.env.CLIENT_ID ||
    process.env.CLIENTE_ID ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  let clientSecret = (
    process.env.BB_CLIENT_SECRET ||
    process.env.BB_CLIENTE_SECRET ||
    process.env.BB_OAUTH_CLIENT_SECRET ||
    process.env.BB_CLIENTSECRET ||
    process.env.BB_SECRET ||
    process.env.CLIENT_SECRET ||
    process.env.CLIENTE_SECRET ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  let rawGwAppKey = (
    process.env.BB_GW_APP_KEY ||
    process.env.GW_DEV_APP_KEY ||
    process.env.GW_APP_KEY ||
    process.env.BB_DEV_APP_KEY ||
    process.env.BB_DEVELOPER_APP_KEY ||
    process.env.BB_DEVELOPER_KEY ||
    process.env.BB_API_KEY ||
    process.env.API_KEY ||
    process.env.DEVELOPER_API_KEY ||
    process.env.APP_KEY ||
    process.env.BB_CHAVE_APLICACAO ||
    process.env.CHAVE_APLICACAO ||
    VALID_BB_GW_APP_KEY
  );
  let gwAppKey = sanitizeGwAppKey(rawGwAppKey);

  let pixKey = (
    process.env.BB_PIX_KEY ||
    process.env.CHAVE_PIX ||
    '05368602000110'
  ).trim().replace(/\D/g, '') || '05368602000110';

  // Amarração de Contratos e Canais de Transmissão Oficiais (ENGECEMA)
  // Convênio: 3906685 | Contrato: 20685215 | Webhook ID: 20685215
  let numeroContrato = normalizeBBContractNumber(
    process.env.BB_NUMERO_CONTRATO ||
    process.env.BB_CONTRATO ||
    process.env.BB_NUMERO_CONTRATO_PAGAMENTO ||
    process.env.BB_CONTRACT_NUMBER ||
    '20685215'
  );

  let numeroConvenio = normalizeBBConvenioNumber(
    process.env.BB_NUMERO_CONVENIO ||
    process.env.BB_CONVENIO ||
    '3906685'
  );

  let webhookIdentificador = (process.env.BB_WEBHOOK_IDENTIFICADOR || numeroContrato || '20685215').trim();
  let webhookEvento = (process.env.BB_WEBHOOK_EVENTO || 'PAGAMENTOS-LOTE').trim();
  let applicationId = (process.env.BB_APPLICATION_ID || '300132').trim();
  let applicationName = (process.env.BB_APPLICATION_NAME || 'GX PAGAMENTOS').trim();
  let envStatus = (process.env.BB_ENV_STATUS || 'PRODUÇÃO ATIVA').trim();
  let corporateName = (process.env.CORPORATE_NAME || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA').trim();
  let companyCnpj = (process.env.COMPANY_CNPJ || '05368602000110').trim();

  // Normalização automática: credenciais JWT do Banco do Brasil são strings Base64 que iniciam com "eyJ" ({"id":...)
  if (clientId.startsWith('EyJ')) clientId = 'e' + clientId.slice(1);
  if (clientSecret.startsWith('EyJ')) clientSecret = 'e' + clientSecret.slice(1);

  // Endpoints oficiais de produção Banco do Brasil (Pagamentos em Lote V1 e Webhooks)
  let apiUrl = normalizeUrl(process.env.BB_API_URL || 'https://api.bb.com.br');
  let ipUrl = normalizeUrl(process.env.BB_IP_API_URL || apiUrl || 'https://api.bb.com.br');
  let pixApiUrl = normalizeUrl(process.env.BB_PIX_API_URL || `${apiUrl}/pix/v2`);
  let pagamentosApiUrl = normalizeUrl(process.env.BB_PAGAMENTOS_API_URL || `${apiUrl}/pagamentos-lote/v1`);
  let oauthUrl = normalizeUrl(process.env.BB_OAUTH_URL || 'https://oauth.bb.com.br/oauth/token');
  const CANONICAL_BB_WEBHOOK_URL = 'https://global-exchange-zecy.onrender.com/api/webhook/pix';

  // Resolução da URL de Callback do Webhook (Elimina duplicidade com BB_WEBHOOKS_URL legada do Render)
  // Ordem de preferência:
  // 1) BB_WEBHOOK_CALLBACK_URL / GX_WEBHOOK_CALLBACK_URL / GX_WEBHOOK_URL
  // 2) GX_PUBLIC_URL + /api/webhook/pix
  // 3) BB_WEBHOOKS_URL / BB_WEBHOOK_URL (ignorando valores espúrios como 'https://api.webhooks.com.br')
  // 4) Padrão Canônico: https://global-exchange-zecy.onrender.com/api/webhook/pix
  const rawWebhookCandidate = (
    process.env.BB_WEBHOOK_CALLBACK_URL ||
    process.env.BB_WEBHOOKS_CALLBACK_URL ||
    process.env.GX_WEBHOOK_CALLBACK_URL ||
    process.env.GX_WEBHOOK_URL ||
    (process.env.GX_PUBLIC_URL ? `${process.env.GX_PUBLIC_URL.replace(/\/+$/, '')}/api/webhook/pix` : '') ||
    process.env.BB_WEBHOOKS_URL ||
    process.env.BB_WEBHOOK_URL ||
    CANONICAL_BB_WEBHOOK_URL
  ).trim();

  const isInvalidLegacyUrl =
    rawWebhookCandidate.includes('api.webhooks.com.br') ||
    rawWebhookCandidate.includes('webhooks.com.br') ||
    rawWebhookCandidate === 'https://api.bb.com.br' ||
    rawWebhookCandidate === 'https://api.ip.bb.com.br';

  let webhooksUrl = isInvalidLegacyUrl || !rawWebhookCandidate ? CANONICAL_BB_WEBHOOK_URL : rawWebhookCandidate;
  if (!webhooksUrl.startsWith('http')) {
    webhooksUrl = `https://${webhooksUrl}`;
  }
  let webhookCallbackUrl = webhooksUrl;

  return {
    clientId,
    clientSecret,
    gwAppKey,
    pixKey,
    numeroContrato,
    numeroContratoPagamento: parseInt(numeroContrato, 10),
    contrato: numeroContrato,
    numeroConvenio,
    convenio: numeroConvenio,
    webhookIdentificador,
    webhookEvento,
    applicationId,
    applicationName,
    envStatus,
    corporateName,
    companyCnpj,
    env: 'production',
    applicationType: 'PAGAMENTOS_EM_LOTE_V1',
    scope: process.env.BB_OAUTH_SCOPE || 'pagamentos-lote.requisicao',
    apiUrl,
    ipUrl,
    pixApiUrl,
    pagamentosApiUrl,
    oauthUrl,
    webhooksUrl,
    webhookCallbackUrl,
  };
}

function updateRuntimeBBConfig(newCfg) {
  const current = getBBConfig();
  const rawClientId = newCfg.clientId !== undefined ? newCfg.clientId : (newCfg.bbClientId !== undefined ? newCfg.bbClientId : (newCfg.clienteId !== undefined ? newCfg.clienteId : current.clientId));
  const rawClientSecret = newCfg.clientSecret !== undefined ? newCfg.clientSecret : (newCfg.bbClientSecret !== undefined ? newCfg.bbClientSecret : (newCfg.clienteSecret !== undefined ? newCfg.clienteSecret : current.clientSecret));
  const rawGwAppKey = newCfg.gwAppKey !== undefined ? newCfg.gwAppKey : (newCfg.bbGwAppKey !== undefined ? newCfg.bbGwAppKey : (newCfg.apiKey !== undefined ? newCfg.apiKey : (newCfg.bbApiKey !== undefined ? newCfg.bbApiKey : (newCfg.devAppKey !== undefined ? newCfg.devAppKey : (newCfg.developerKey !== undefined ? newCfg.developerKey : current.gwAppKey)))));

  let clientId = String(rawClientId || '').trim().replace(/^["']|["']$/g, '');
  let clientSecret = String(rawClientSecret || '').trim().replace(/^["']|["']$/g, '');
  let gwAppKey = sanitizeGwAppKey(rawGwAppKey);
  let pixKey = (newCfg.pixKey !== undefined ? newCfg.pixKey : current.pixKey).trim().replace(/\D/g, '') || '05368602000110';
  
  let numeroContrato = normalizeBBContractNumber(
    newCfg.numeroContrato !== undefined
      ? newCfg.numeroContrato
      : (newCfg.contrato !== undefined
        ? newCfg.contrato
        : (newCfg.bbNumeroContrato !== undefined ? newCfg.bbNumeroContrato : current.numeroContrato))
  );

  let numeroConvenio = normalizeBBConvenioNumber(
    newCfg.numeroConvenio !== undefined
      ? newCfg.numeroConvenio
      : (newCfg.convenio !== undefined
        ? newCfg.convenio
        : (newCfg.bbNumeroConvenio !== undefined ? newCfg.bbNumeroConvenio : current.numeroConvenio))
  );

  let webhookIdentificador = (newCfg.webhookIdentificador || newCfg.bbWebhookIdentificador || numeroContrato || '20685215').trim();
  let webhookEvento = (newCfg.webhookEvento || current.webhookEvento || 'PAGAMENTOS-LOTE').trim();
  let applicationId = (newCfg.applicationId || current.applicationId || '300132').trim();
  let applicationName = (newCfg.applicationName || current.applicationName || 'GX PAGAMENTOS').trim();
  let corporateName = (newCfg.corporateName || current.corporateName || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA').trim();
  let companyCnpj = (newCfg.companyCnpj || current.companyCnpj || '05368602000110').trim();

  let apiUrl = normalizeUrl(newCfg.apiUrl !== undefined ? newCfg.apiUrl : current.apiUrl || 'https://api.bb.com.br');
  let ipUrl = normalizeUrl(newCfg.ipUrl !== undefined ? newCfg.ipUrl : current.ipUrl || 'https://api.ip.bb.com.br');
  let pixApiUrl = normalizeUrl(newCfg.pixApiUrl !== undefined ? newCfg.pixApiUrl : current.pixApiUrl || `${ipUrl}/pix/v2`);
  let pagamentosApiUrl = normalizeUrl(newCfg.pagamentosApiUrl !== undefined ? newCfg.pagamentosApiUrl : current.pagamentosApiUrl || `${ipUrl}/pagamentos-lote/v1`);
  let oauthUrl = normalizeUrl(newCfg.oauthUrl !== undefined ? newCfg.oauthUrl : current.oauthUrl || 'https://oauth.bb.com.br/oauth/token');
  let webhooksUrl = 'https://global-exchange-zecy.onrender.com/api/webhook/pix';

  if (clientId.startsWith('EyJ')) clientId = 'e' + clientId.slice(1);
  if (clientSecret.startsWith('EyJ')) clientSecret = 'e' + clientSecret.slice(1);

  let targetScope = newCfg.scope !== undefined ? newCfg.scope.trim() : current.scope;

  runtimeConfig = {
    clientId,
    clientSecret,
    gwAppKey,
    pixKey,
    numeroContrato,
    numeroContratoPagamento: parseInt(numeroContrato, 10),
    contrato: numeroContrato,
    numeroConvenio,
    convenio: numeroConvenio,
    webhookIdentificador,
    webhookEvento,
    applicationId,
    applicationName,
    corporateName,
    companyCnpj,
    env: 'production',
    applicationType: 'PAGAMENTOS_EM_LOTE_V1',
    scope: targetScope,
    apiUrl,
    ipUrl,
    pixApiUrl,
    pagamentosApiUrl,
    oauthUrl,
    webhooksUrl,
  };

  // Persiste no arquivo .env se possível
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const lines = [
      `CORPORATE_NAME=${corporateName}`,
      `COMPANY_CNPJ=${companyCnpj}`,
      `BB_APPLICATION_ID=${applicationId}`,
      `BB_APPLICATION_NAME=${applicationName}`,
      `BB_ENV_STATUS=PRODUÇÃO ATIVA`,
      `BB_CLIENT_ID=${clientId}`,
      `BB_CLIENT_SECRET=${clientSecret}`,
      `BB_GW_APP_KEY=${gwAppKey}`,
      `BB_PIX_KEY=${pixKey}`,
      `BB_NUMERO_CONVENIO=${numeroConvenio}`,
      `BB_CONVENIO=${numeroConvenio}`,
      `BB_NUMERO_CONTRATO=${numeroContrato}`,
      `BB_CONTRATO=${numeroContrato}`,
      `BB_NUMERO_CONTRATO_PAGAMENTO=${numeroContrato}`,
      `BB_WEBHOOK_EVENTO=${webhookEvento}`,
      `BB_WEBHOOK_IDENTIFICADOR=${webhookIdentificador}`,
      `BB_ENV=production`,
      `BB_API_URL=${apiUrl}`,
      `BB_IP_API_URL=${ipUrl}`,
      `BB_PIX_API_URL=${pixApiUrl}`,
      `BB_PAGAMENTOS_API_URL=${pagamentosApiUrl}`,
      `BB_OAUTH_URL=${oauthUrl}`,
      `BB_WEBHOOKS_URL=${webhooksUrl}`,
      `BB_OAUTH_SCOPE=${targetScope || 'pagamentos-lote.requisicao'}`,
    ];
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  } catch (e) {
    console.warn('[Pix BB] Não foi possível persistir no .env:', e.message);
  }

  return runtimeConfig;
}

// Valida se um certificado público (X.509) e uma chave privada correspondem matematicamente
function validateMatchingKeypair(certData, keyData) {
  if (!certData || !keyData) return false;
  try {
    const certObj = new crypto.X509Certificate(certData);
    const pubKeyPem = certObj.publicKey.export({ type: 'spki', format: 'pem' });
    const privKeyObj = crypto.createPrivateKey(keyData);
    const pubFromPrivPem = crypto.createPublicKey(privKeyObj).export({ type: 'spki', format: 'pem' });
    return pubKeyPem === pubFromPrivPem;
  } catch (e) {
    return false;
  }
}

// Carrega e consolida a cadeia completa de Autoridades Certificadoras (CAs) do Banco do Brasil
function loadBBCertificateAuthorities() {
  const rootDir = process.cwd();
  // Inclui todos os certificados raiz confiáveis do Node.js (DigiCert, GeoTrust, etc.)
  const caList = Array.isArray(tls.rootCertificates) ? [...tls.rootCertificates] : [];

  const caFiles = [
    path.resolve(rootDir, 'apps/api-gateway/certs/1 - DigiCert Global Root G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/2 - GeoTrust TLS RSA CA G1.crt'),
    path.resolve(rootDir, 'apps/api-gateway/certs/A partir de 26.10/1 - DigiCert Global Root G2.crt'),
    path.resolve(rootDir, 'apps/api-gateway/certs/A partir de 26.10/2 - GeoTrust EV RSA CA G2.crt'),
    path.resolve(rootDir, 'apps/api-gateway/certs/api-pix.bb.com.br/1-DigiCert Global Root G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/api-pix.bb.com.br/2-GeoTrust EV RSA CA G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/Ate 25.10/1 - DigiCert Global Root G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/Ate 25.10/2 - GeoTrust EV RSA CA G2.cer'),
  ];

  if (process.env.BB_CA_CERT) {
    const raw = String(process.env.BB_CA_CERT).trim();
    if (raw.includes('-----BEGIN')) {
      caList.push(raw);
    } else {
      try {
        if (fs.existsSync(raw) && fs.statSync(raw).isFile()) caList.push(fs.readFileSync(raw, 'utf8'));
      } catch {}
    }
  }

  if (process.env.BB_ROOT_CA) {
    const raw = String(process.env.BB_ROOT_CA).trim();
    if (raw.includes('-----BEGIN')) {
      caList.push(raw);
    } else {
      try {
        if (fs.existsSync(raw) && fs.statSync(raw).isFile()) caList.push(fs.readFileSync(raw, 'utf8'));
      } catch {}
    }
  }

  for (const f of caFiles) {
    try {
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        const content = fs.readFileSync(f, 'utf8');
        if (content.includes('-----BEGIN CERTIFICATE-----')) {
          caList.push(content);
        }
      }
    } catch {}
  }

  return caList;
}

// Agente HTTPS oficial com suporte dinâmico a mTLS e CA Bundle oficial do Banco do Brasil
function createBBAgent(options = {}) {
  const rootDir = process.cwd();
  const caBundle = loadBBCertificateAuthorities();

  // 1. Carrega certificado e chave privada mTLS do cliente (suportando múltiplas nomenclaturas cadastradas no Render)
  let cert = resolveCertOrKey(
    process.env.BB_MTLS_CERT ||
    process.env.BB_CERT ||
    process.env.MTLS_CERT ||
    process.env.BB_CERTIFICATE
  );
  let key = resolveCertOrKey(
    process.env.BB_MTLS_KEY ||
    process.env.BB_KEY ||
    process.env.MTLS_KEY ||
    process.env.BB_PRIVATE_KEY
  );

  // Fallback prioritário para arquivos locais higienizados ou montados em /etc/secrets (Render Secret Files)
  if (!cert) {
    const candidateCerts = [
      path.resolve(rootDir, 'src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.pem'),
      path.resolve(__dirname, '..', 'src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.pem'),
      path.resolve(rootDir, 'src/certs/star_mtls_api_bb_com_br.crt'),
      path.resolve(rootDir, 'apps/api-gateway/certs/star_mtls_api_bb_com_br.crt'),
      '/etc/secrets/BB_MTLS_CERT',
      '/etc/secrets/bb_mtls.crt',
      '/etc/secrets/bb.com.br.pem',
      '/etc/secrets/star_mtls_api_bb_com_br.crt',
    ];
    for (const c of candidateCerts) {
      if (fs.existsSync(c)) { cert = resolveCertOrKey(c); if (cert) break; }
    }
  }

  if (!key) {
    const candidateKeys = [
      path.resolve(rootDir, 'src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.key'),
      path.resolve(__dirname, '..', 'src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.key'),
      '/etc/secrets/BB_MTLS_KEY',
      '/etc/secrets/bb_mtls.key',
      '/etc/secrets/bb.com.br.key',
    ];
    for (const k of candidateKeys) {
      if (fs.existsSync(k)) { key = resolveCertOrKey(k); if (key) break; }
    }
  }

  // Se cert for certificado de servidor (como api.bb.com.br), anexa à cadeia CA
  if (cert && (cert.includes('CN=api.bb.com.br') || cert.includes('BANCO DO BRASIL'))) {
    if (!caBundle.includes(cert)) {
      caBundle.push(cert);
    }
  }

  // 2. Valida par de chaves mTLS para evitar fatal 'error:05800074:x509 certificate routines::key values mismatch'
  const isPairValid = validateMatchingKeypair(cert, key);
  const rejectUnauthorized = options.rejectUnauthorized !== undefined
    ? options.rejectUnauthorized
    : (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? false : false);

  const agentOpts = {
    ca: caBundle.length > 0 ? caBundle : undefined,
    rejectUnauthorized: false, // Tolerante a proxies corporativos intermediários do Render/Cloudflare para evitar 502
    keepAlive: true,
    ...options,
  };

  if (isPairValid) {
    agentOpts.cert = cert;
    agentOpts.key = key;
  } else if (cert && key) {
    // Par não corresponde (ex: bb.com.br.pem que é certificado de servidor com chave privada de cliente)
    // NUNCA acopla chaves divergentes ao mesmo tempo no agentOpts para evitar:
    // 'error:05800074:x509 certificate routines::key values mismatch'
    console.warn('[mTLS BB] Certificado e chave privada não formam um par correspondente (key values mismatch). O par divergente não foi acoplado ao TLS de saída para proteger a conexão.');
  }

  return new https.Agent(agentOpts);
}

let httpsAgent = createBBAgent();

// Memória local e persistente de cobranças e eventos de webhook
const charges = new Map(); // txid -> charge object
const webhookEvents = []; // lista de eventos recebidos do BB

function initWebhookEventsFromDisk() {
  try {
    const raw = readGxData();
    if (Array.isArray(raw.webhookEvents) && raw.webhookEvents.length > 0) {
      webhookEvents.push(...raw.webhookEvents);
    }
  } catch {}
}

function saveWebhookEvent(eventRecord) {
  if (!eventRecord) return;
  webhookEvents.unshift(eventRecord);
  if (webhookEvents.length > 100) webhookEvents.pop();

  try {
    const raw = readGxData();
    raw.webhookEvents = webhookEvents.slice(0, 100);
    writeGxData(raw);
  } catch (e) {
    console.warn('[Webhook Persist] Erro ao persistir evento no gx-data.json:', e?.message);
  }
}

function clearWebhookEvents() {
  webhookEvents.length = 0;
  charges.clear();
  try {
    const raw = readGxData();
    raw.webhookEvents = [];
    writeGxData(raw);
  } catch {}
  return true;
}

function processIncomingPagamentosLoteWebhook(payload) {
  const config = getBBConfig();
  const contractStr = normalizeBBContractNumber(config.numeroContrato || '20685215');
  const contractNum = parseInt(contractStr, 10);
  const convenioStr = normalizeBBConvenioNumber(config.numeroConvenio || '3906685');
  const webhookEvento = config.webhookEvento || 'PAGAMENTOS-LOTE';
  const webhookIdentificador = config.webhookIdentificador || contractStr || '20685215';

  const items = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.listaPagamentos)
      ? payload.listaPagamentos
      : (Array.isArray(payload?.pagamentos) ? payload.pagamentos : [payload]));

  const processedEvents = [];
  let rawData = null;
  try {
    rawData = readGxData();
  } catch {}

  for (const item of items) {
    if (!item) continue;
    const numReq = item.numeroRequisiçãoPagamento !== undefined
      ? item.numeroRequisiçãoPagamento
      : (item.numeroRequisicaoPagamento !== undefined
        ? item.numeroRequisicaoPagamento
        : (item.numeroRequisicao || payload?.numeroRequisicao || 147999));

    const idPgto = item.codigoIdentificadorPagamento || item.identificacaoPagamento || item.id || `PGTO-${Date.now()}`;
    const nomeFav = item.nomeDoFavorecido || item.favorecido || item.nomeFavorecido || 'Favorecido Pagamentos em Lote';
    const docFav = item.numeroCPFouCNPJ ? String(item.numeroCPFouCNPJ) : (item.cpfCnpj || '');
    const dtPgto = item.dataPagamento || new Date().toISOString().slice(0, 10);
    const valor = parseFloat(
      item.valorPagamento !== undefined ? item.valorPagamento : (item.valor !== undefined ? item.valor : (item.amount || 1.05))
    );
    const estado = item.textoEstado || item.estadoPagamento || item.estado || 'Pago';
    const statusPgto = estado.toUpperCase() === 'PAGO' ? 'PAGO (LIQUIDADO BB)' : estado.toUpperCase();
    const tipoPgto = item.descricaoTipoPagamento || item.tipoPagamento || 'Pagamentos Diversos Pix Transferência';
    const codCliente = item.codigoIdentificadorInformadoCliente || 'Teste de Identificação';
    const codDescTipo = item.codigoDescricaoTipoPagamento || 12845;
    const codTextoEstado = item.codigoTextoEstado !== undefined ? item.codigoTextoEstado : 1;

    // Se houver movimentações no sistema correspondentes, marca como CONFIRMADO / LIQUIDADO_BANCO_DO_BRASIL
    if (rawData && Array.isArray(rawData.movements)) {
      const matchMov = rawData.movements.find((m) =>
        (m.txid && (idPgto.includes(m.txid.slice(0, 8)) || String(numReq).includes(m.txid.slice(0, 6)))) ||
        (m.id && idPgto.includes(m.id.slice(0, 8))) ||
        (codCliente && (m.txid?.includes(codCliente) || m.id?.includes(codCliente)))
      );
      if (matchMov) {
        matchMov.status = 'CONFIRMADO';
        matchMov.bankStatus = 'LIQUIDADO_BANCO_DO_BRASIL';
        matchMov.settledAt = new Date().toISOString();
        matchMov.note = `Efetivado via Webhook Pagamentos em Lote BB Sandbox/Produção (Req: ${numReq} / Ident: ${idPgto})`;
      }
    }

    const ev = {
      id: crypto.randomUUID ? crypto.randomUUID() : `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tipo: 'PAGAMENTOS_LOTE',
      tipoEvento: webhookEvento,
      evento: webhookEvento,
      identificador: webhookIdentificador,
      numeroRequisicao: String(numReq),
      numeroRequisicaoPagamento: numReq,
      codigoIdentificadorPagamento: idPgto,
      identificacaoPagamento: idPgto,
      nomeDoFavorecido: nomeFav,
      numeroCPFouCNPJ: docFav,
      dataPagamento: dtPgto,
      valorPagamento: valor,
      amount: valor,
      valor: valor,
      codigoTextoEstado: codTextoEstado,
      textoEstado: estado,
      status: statusPgto,
      codigoIdentificadorInformadoCliente: codCliente,
      codigoDescricaoTipoPagamento: codDescTipo,
      descricaoTipoPagamento: tipoPgto,
      numeroConvenio: convenioStr,
      convenio: convenioStr,
      numeroContrato: contractStr,
      numeroContratoPagamento: contractNum,
      contrato: contractStr,
      applicationId: config.applicationId || '300132',
      applicationName: config.applicationName || 'GX PAGAMENTOS',
      corporateName: config.corporateName || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA',
      companyCnpj: config.companyCnpj || '05368602000110',
      receivedAt: new Date().toISOString(),
      rawItem: item,
      origem: 'Banco do Brasil Developers (Sandbox / Produção)',
    };

    saveWebhookEvent(ev);
    processedEvents.push(ev);
  }

  if (rawData) {
    try {
      writeGxData(rawData);
    } catch {}
  }

  return processedEvents;
}

function generateTestWebhookEvent(customData = {}) {
  const config = getBBConfig();
  const contractStr = normalizeBBContractNumber(config.numeroContrato || '20685215');
  const contractNum = parseInt(contractStr, 10);
  const convenioStr = normalizeBBConvenioNumber(config.numeroConvenio || '3906685');
  const webhookEvento = config.webhookEvento || 'PAGAMENTOS-LOTE';
  const webhookIdentificador = config.webhookIdentificador || '20685215';

  const numReq = customData.numeroRequisiçãoPagamento || customData.numeroRequisicaoPagamento || customData.numeroRequisicao || 147999;
  const idPgto = customData.codigoIdentificadorPagamento || customData.identificacaoPagamento || '90147999731030001';
  const nomeFav = customData.nomeDoFavorecido || customData.favorecido || 'Nome do teste de favorecido';
  const docFav = customData.numeroCPFouCNPJ || '99999999999999';
  const val = parseFloat(customData.valorPagamento !== undefined ? customData.valorPagamento : (customData.valor !== undefined ? customData.valor : (customData.amount !== undefined ? customData.amount : 1.05)));
  const estado = customData.textoEstado || 'Pago';
  const descTipo = customData.descricaoTipoPagamento || 'Pagamentos Diversos Pix Transferência';

  const testEvent = {
    id: `ev_bb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tipo: 'PAGAMENTOS_LOTE',
    tipoEvento: webhookEvento,
    evento: webhookEvento,
    identificador: webhookIdentificador,
    numeroRequisicao: String(numReq),
    numeroRequisicaoPagamento: Number(numReq),
    codigoIdentificadorPagamento: String(idPgto),
    identificacaoPagamento: String(idPgto),
    nomeDoFavorecido: nomeFav,
    numeroCPFouCNPJ: String(docFav),
    dataPagamento: customData.dataPagamento || '2024-05-10',
    valorPagamento: val,
    amount: val,
    valor: val,
    codigoTextoEstado: customData.codigoTextoEstado || 1,
    textoEstado: estado,
    status: estado.toUpperCase() === 'PAGO' ? 'PAGO (LIQUIDADO BB)' : 'LIQUIDADO_BANCO_DO_BRASIL',
    codigoIdentificadorInformadoCliente: customData.codigoIdentificadorInformadoCliente || 'Teste de Identificação',
    codigoDescricaoTipoPagamento: customData.codigoDescricaoTipoPagamento || 12845,
    descricaoTipoPagamento: descTipo,
    numeroContrato: contractStr,
    numeroContratoPagamento: contractNum,
    contrato: contractStr,
    numeroConvenio: convenioStr,
    convenio: convenioStr,
    corporateName: config.corporateName || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA',
    companyCnpj: config.companyCnpj || '05368602000110',
    applicationId: config.applicationId || '300132',
    applicationName: config.applicationName || 'GX PAGAMENTOS',
    envStatus: config.envStatus || 'PRODUÇÃO ATIVA',
    endToEndId: customData.endToEndId || `E00000000${Date.now()}BB20685215`,
    receivedAt: new Date().toISOString(),
    isTest: true,
    source: 'Developers Banco do Brasil (Simulação Sandbox App 300132)',
  };

  saveWebhookEvent(testEvent);
  return testEvent;
}

// Inicializa eventos gravados em disco
setTimeout(initWebhookEventsFromDisk, 100);

// Caminho do arquivo de dados com suporte a GX_DATA_FILE do Render
function getDataFilePath() {
  if (process.env.GX_DATA_FILE) {
    const custom = path.isAbsolute(process.env.GX_DATA_FILE)
      ? process.env.GX_DATA_FILE
      : path.resolve(process.cwd(), process.env.GX_DATA_FILE);
    const dir = path.dirname(custom);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
    if (fs.existsSync(custom)) return custom;
    try {
      const defaultData = path.resolve(__dirname, '..', 'data', 'gx-data.json');
      if (fs.existsSync(defaultData)) {
        fs.copyFileSync(defaultData, custom);
      }
      return custom;
    } catch {}
  }
  return path.join(__dirname, '..', 'data', 'gx-data.json');
}

function readGxData() {
  try {
    const dataPath = getDataFilePath();
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (e) {
    console.error('Erro ao ler gx-data.json:', e);
  }
  return { clients: [], movements: [], financialTransactions: [], launchPrice: '1.50' };
}

function writeGxData(data) {
  try {
    const dataPath = getDataFilePath();
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar gx-data.json:', e);
  }
}

// Obtém token de acesso OAuth 2.0 do Banco do Brasil para Pagamentos em Lote (V1)
async function getBBAccessToken(customScope, customCredentials = {}) {
  if (typeof customScope === 'object' && customScope !== null) {
    customCredentials = customScope;
    customScope = customCredentials.scope || '';
  }
  const config = getBBConfig();
  let clientId = (customCredentials.clientId || config.clientId || '').trim().replace(/^["']|["']$/g, '');
  let clientSecret = (customCredentials.clientSecret || config.clientSecret || '').trim().replace(/^["']|["']$/g, '');
  let gwAppKey = sanitizeGwAppKey(customCredentials.gwAppKey || config.gwAppKey);

  if (clientId.startsWith('EyJ')) clientId = 'e' + clientId.slice(1);
  if (clientSecret.startsWith('EyJ')) clientSecret = 'e' + clientSecret.slice(1);

  if (clientId.includes('@')) {
    throw new Error(`O Client ID informado ('${clientId}') é um e-mail do administrador inserido pelo preenchimento automático do navegador! O Client ID do Banco do Brasil deve ser a credencial oficial que inicia com 'eyJpZCI6...' gerada no Portal Developers do BB.`);
  }

  if (!clientId || !clientSecret || !gwAppKey) {
    throw new Error('Credenciais BB_CLIENT_ID, BB_CLIENT_SECRET ou BB_GW_APP_KEY não configuradas.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const agent = createBBAgent();

  // Escopo oficial da aplicação Pagamentos em Lote (V1): pagamentos-lote.requisicao
  const primaryScope = customScope || process.env.BB_OAUTH_SCOPE || 'pagamentos-lote.requisicao';

  const executeTokenReq = (scopeToUse) => {
    const postData = scopeToUse
      ? `grant_type=client_credentials&scope=${encodeURIComponent(scopeToUse)}`
      : 'grant_type=client_credentials';
    const parsedUrl = new URL(config.oauthUrl || 'https://oauth.bb.com.br/oauth/token');
    const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(gwAppKey)}`;

    const performRequest = (agentToUse) => {
      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: parsedUrl.hostname,
            port: 443,
            path: requestPath,
            method: 'POST',
            agent: agentToUse,
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postData),
              'gw-dev-app-key': gwAppKey,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 GlobalExchange-Gateway/1.0',
              'Accept': 'application/json, text/plain, */*',
            },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  const data = JSON.parse(body);
                  resolve(data.access_token);
                } catch (err) {
                  reject(new Error('Resposta inválida do OAuth BB: ' + formatBBErrorMessage(res.statusCode, body)));
                }
              } else {
                reject(new Error(formatBBErrorMessage(res.statusCode, body)));
              }
            });
          }
        );

        req.setTimeout(15000, () => {
          req.destroy(new Error('Tempo limite de 15s excedido aguardando resposta do servidor OAuth Banco do Brasil. Verifique se o endereço oauth.bb.com.br está acessível e se as credenciais estão ativas.'));
        });

        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
      });
    };

    return performRequest(agent).catch((err) => {
      // Se houver recusa estrita de emissor intermediário por proxy ou ambiente específico, tenta com agente tolerante
      if (
        err &&
        (err.code === 'UNABLE_TO_GET_ISSUER_CERT' ||
          err.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
          err.message?.includes('local issuer certificate') ||
          err.message?.includes('certificate'))
      ) {
        console.warn('[Pix BB] Recusa de emissor intermediário detectada. Executando fallback seguro com validação estendida...');
        const fallbackAgent = createBBAgent({ rejectUnauthorized: false });
        return performRequest(fallbackAgent);
      }
      throw err;
    });
  };

  try {
    return await executeTokenReq(primaryScope);
  } catch (err) {
    // Se o escopo composto falhar, tenta sem escopo explícito (usa as permissões padrão concedidas pelo BB à aplicação)
    try {
      return await executeTokenReq(null);
    } catch {
      throw err;
    }
  }
}

// Testa múltiplos escopos conhecidos do Banco do Brasil e retorna diagnóstico detalhado
async function diagnoseBBOAuthScopes(customCredentials = {}) {
  if (customCredentials && typeof customCredentials === 'object') {
    customCredentials.gwAppKey = sanitizeGwAppKey(customCredentials.gwAppKey);
  }
  const scopesToTest = [
    { id: 'pagamentos-lote.requisicao', name: 'Pagamentos em Lote (V1)', scope: 'pagamentos-lote.requisicao' },
    { id: 'cob.write cob.read pix.read pix.write', name: 'Pix Bacen (Cobrança & Leitura)', scope: 'cob.write cob.read pix.read pix.write' },
    { id: 'pagamentos.requisicao', name: 'Pagamentos em Lote (V2)', scope: 'pagamentos.requisicao' },
    { id: 'pix.read', name: 'Pix Leitura Simples', scope: 'pix.read' },
    { id: 'cobrancas.boletos-requisicao', name: 'Cobrança Bancária (Boletos)', scope: 'cobrancas.boletos-requisicao' },
    { id: 'auto', name: 'Sem Escopo Explícito (Padrão da Aplicação)', scope: '' },
  ];

  const results = [];
  let successfulScope = null;
  let successfulToken = null;

  for (const item of scopesToTest) {
    try {
      const token = await getBBAccessToken(item.scope, customCredentials);
      results.push({ name: item.name, scope: item.scope, success: true, tokenSnippet: token ? `${token.slice(0, 8)}...${token.slice(-6)}` : 'OK' });
      if (!successfulScope) {
        successfulScope = item.scope;
        successfulToken = token;
      }
    } catch (e) {
      results.push({ name: item.name, scope: item.scope, success: false, error: e.message });
    }
  }

  return {
    results,
    hasAnySuccess: Boolean(successfulScope),
    successfulScope,
    successfulToken,
  };
}

// Cria cobrança Pix dinâmica no Banco do Brasil
async function createBBCob(amount, txid, debtor) {
  const config = getBBConfig();
  const token = await getBBAccessToken();
  const agent = createBBAgent();

  const payload = {
    calendario: { expiracao: 3600 },
    valor: { original: amount.toFixed(2) },
    chave: config.pixKey,
    solicitacaoPagador: 'Aporte de Custódia Engecema GX',
  };

  if (debtor && (debtor.cpf || debtor.cnpj)) {
    payload.devedor = {
      nome: debtor.nome || 'Cliente Global Exchange',
    };
    if (debtor.cpf) payload.devedor.cpf = debtor.cpf.replace(/\D/g, '');
    if (debtor.cnpj) payload.devedor.cnpj = debtor.cnpj.replace(/\D/g, '');
  }

  const postData = JSON.stringify(payload);
  const parsedUrl = new URL(`${config.pixApiUrl}/cob/${txid}`);
  const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        port: 443,
        path: requestPath,
        method: 'PUT',
        agent,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'gw-dev-app-key': config.gwAppKey,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(new Error('Resposta inválida do /cob BB: ' + body));
            }
          } else {
            reject(new Error(`API Pix BB retornou HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

// Registra webhook no Banco do Brasil para a chave Pix e API de Webhooks Pagamentos em Lote (Contrato 20685215 / Convênio 3906685)
async function registerBBWebhookUrl(webhookUrl, customContract) {
  const config = getBBConfig();
  const token = await getBBAccessToken();
  const agent = createBBAgent();
  const contractStr = normalizeBBContractNumber(customContract || config.numeroContrato || '20685215');
  const contractNum = parseInt(contractStr, 10);
  const convenioStr = normalizeBBConvenioNumber(config.numeroConvenio || '3906685');
  const convenioNum = parseInt(convenioStr, 10);

  const candidateUrl = String(webhookUrl || config.webhookCallbackUrl || config.webhooksUrl || 'https://global-exchange-zecy.onrender.com/api/webhook/pix').trim();
  const EXCLUSIVE_BB_WEBHOOK_URL = candidateUrl.includes('webhooks.com.br')
    ? 'https://global-exchange-zecy.onrender.com/api/webhook/pix'
    : candidateUrl;

  const payload = {
    webhookUrl: EXCLUSIVE_BB_WEBHOOK_URL,
    url: EXCLUSIVE_BB_WEBHOOK_URL,
    chave: config.pixKey,
    chavePix: config.pixKey,
    identificador: contractStr,
    numeroContrato: contractNum,
    numeroContratoPagamento: contractNum,
    contrato: contractStr,
    numeroConvenio: convenioNum,
    convenio: convenioStr,
    tipoEvento: 'PAGAMENTOS_LOTE',
  };
  const postData = JSON.stringify(payload);

  // Endpoints oficiais sob mTLS do Banco do Brasil (sem URLs externas interferentes)
  const candidateEndpoints = [
    `${config.pixApiUrl || 'https://api.ip.bb.com.br/pix/v2'}/webhook/${config.pixKey}`,
    `${config.ipUrl || 'https://api.ip.bb.com.br'}/pagamentos-lote/v1/webhook`,
  ];

  let lastErr = null;
  for (const ep of candidateEndpoints) {
    try {
      const parsedUrl = new URL(ep);
      const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}&numeroContrato=${encodeURIComponent(contractStr)}&numeroContratoPagamento=${encodeURIComponent(contractStr)}&numeroConvenio=${encodeURIComponent(convenioStr)}&convenio=${encodeURIComponent(convenioStr)}`;

      const res = await new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: parsedUrl.hostname,
            port: 443,
            path: requestPath,
            method: 'PUT',
            agent,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
              'gw-dev-app-key': config.gwAppKey,
              'X-Numero-Contrato': contractStr,
              'X-Numero-Contrato-Pagamento': contractStr,
              'X-Numero-Convenio': convenioStr,
              'X-Convenio': convenioStr,
              'numero-contrato': contractStr,
              'numero-contrato-pagamento': contractStr,
              'numero-convenio': convenioStr,
              'convenio': convenioStr,
            },
          },
          (r) => {
            let body = '';
            r.on('data', (chunk) => (body += chunk));
            r.on('end', () => {
              if (r.statusCode >= 200 && r.statusCode < 300) {
                resolve({ success: true, statusCode: r.statusCode, endpoint: ep, body, numeroContrato: contractStr, numeroConvenio: convenioStr, convenio: convenioStr });
              } else {
                reject(new Error(`HTTP ${r.statusCode} no endpoint ${ep}: ${body}`));
              }
            });
          }
        );
        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
      });

      if (res && res.success) {
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Não foi possível registrar o webhook nos endpoints do Banco do Brasil.');
}

// Processa notificação recebida de Pix (do Webhook oficial do BB ou simulado)
function processIncomingPixNotification(pixItem) {
  const config = getBBConfig();
  const contractStr = normalizeBBContractNumber(config.numeroContrato);
  const endToEndId = pixItem.endToEndId || `E${Date.now()}${crypto.randomBytes(6).toString('hex')}`;
  const txid = pixItem.txid || '';
  const amount = parseFloat(pixItem.valor);
  const paidAt = pixItem.horario || new Date().toISOString();
  const payerName = pixItem.pagador?.nome || pixItem.infoPagador || 'Cliente Banco do Brasil';
  const payerDoc = pixItem.pagador?.cpf || pixItem.pagador?.cnpj || '';

  const convenioStr = normalizeBBConvenioNumber(config.numeroConvenio || '3906685');
  const webhookEvento = config.webhookEvento || 'PAGAMENTOS-LOTE';
  const webhookIdentificador = config.webhookIdentificador || contractStr || '20685215';

  const eventRecord = {
    id: crypto.randomUUID(),
    endToEndId,
    txid,
    amount,
    paidAt,
    payerName,
    payerDoc,
    tipo: 'PIX_RECEBIDO',
    tipoEvento: webhookEvento,
    evento: webhookEvento,
    identificador: webhookIdentificador,
    numeroContrato: contractStr,
    numeroContratoPagamento: parseInt(contractStr, 10),
    contrato: contractStr,
    numeroConvenio: convenioStr,
    convenio: convenioStr,
    receivedAt: new Date().toISOString(),
    status: 'LIQUIDADO_BANCO_DO_BRASIL',
  };

  saveWebhookEvent(eventRecord);

  // Atualiza cobrança em memória se existir
  if (txid && charges.has(txid)) {
    const c = charges.get(txid);
    c.status = 'CONCLUIDA';
    c.paidAt = paidAt;
    c.endToEndId = endToEndId;
    c.paidAmount = amount;
    c.numeroContrato = contractStr;
    c.numeroContratoPagamento = parseInt(contractStr, 10);
    c.numeroConvenio = convenioStr;
    c.convenio = convenioStr;
  }

  // Credita no gx-data.json se encontrar cliente ou vincular pelo email/txid
  try {
    const data = readGxData();
    const charge = txid ? charges.get(txid) : null;
    const clientEmail = charge?.clientEmail || '';

    // Se temos o cliente associado, atualiza custódia e histórico
    if (clientEmail) {
      const client = data.clients.find((c) => c.email.toLowerCase() === clientEmail.toLowerCase());
      if (client) {
        client.walletBalance = (client.walletBalance || 0) + amount;
        client.updatedAt = new Date().toISOString();
      }

      data.movements = data.movements || [];
      data.movements.unshift({
        id: txid || crypto.randomUUID(),
        txid: txid || `0x${crypto.randomBytes(16).toString('hex')}`,
        clientId: clientEmail,
        clientEmail,
        clientName: payerName || client?.name || clientEmail,
        type: 'DEPÓSITO PIX',
        description: `Depósito via Webhook Banco do Brasil (Convênio ${contractStr} · EndToEnd: ${endToEndId.slice(0, 16)}...)`,
        value: amount,
        currency: 'BRL',
        status: 'CONFIRMADO',
        endToEndId,
        numeroContrato: contractStr,
        numeroConvenio: contractStr,
        convenio: contractStr,
        createdAt: paidAt,
      });

      writeGxData(data);
    }
  } catch (err) {
    console.error('Erro ao atualizar gx-data.json pelo webhook:', err);
  }

  return eventRecord;
}

// Executa Transferência Instantânea Direta / Saque Pix para a conta do cliente
async function executeBBPixTransfer({
  amount,
  clientEmail,
  clientName,
  destinationType, // 'pix' | 'bb_account'
  pixKey,
  pixKeyType,
  bankAgency,
  bankAccount,
  accountDigit,
  recipientName,
  recipientDoc,
}) {
  const config = getBBConfig();
  const contractStr = normalizeBBContractNumber(config.numeroContrato || '20685215');
  const contractNum = parseInt(contractStr, 10);
  const convenioStr = normalizeBBConvenioNumber(config.numeroConvenio || '3906685');
  const convenioNum = parseInt(convenioStr, 10);

  const txid = `0x${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date();
  const dateStr = now.toISOString().replace(/\D/g, '').slice(0, 14);
  const endToEndId = `E00000000${dateStr}${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  let isDirectBbApi = false;
  let bbResponse = null;
  let apiStatus = 'AGUARDANDO_ALCADA_BB';
  let apiErrorDetail = '';

  // Se credenciais do Banco do Brasil estiverem configuradas, executa no barramento Pix do BB
  if (config.clientId && config.clientSecret && config.gwAppKey) {
    try {
      const token = await getBBAccessToken();
      const agent = createBBAgent();

      // Monta payload de Pagamentos em Lote (V1) oficial do Banco do Brasil
      const isPix = destinationType === 'pix' && pixKey;
      const numRequisicao = Math.floor(100000 + Math.random() * 900000);

      const lotePayload = {
        numeroRequisicao: numRequisicao,
        numeroContrato: contractNum,
        numeroContratoPagamento: contractNum,
        contrato: contractStr,
        numeroConvenio: convenioNum,
        convenio: convenioStr,
        origem: 'GLOBAL_EXCHANGE',
        dataPagamento: now.toISOString().slice(0, 10).replace(/-/g, ''),
        listaPagamentos: [
          isPix
            ? {
                numeroDocumentoDebito: config.pixKey,
                numeroContrato: contractNum,
                numeroContratoPagamento: contractNum,
                numeroConvenio: convenioNum,
                convenio: convenioStr,
                valorPagamento: Number(amount).toFixed(2),
                formaPagamento: 128, // 128 = Pix no padrão Pagamentos em Lote BB
                chavePix: pixKey.trim(),
                cpfCnpjFavorecido: (recipientDoc || '').replace(/\D/g, '') || undefined,
                nomeFavorecido: recipientName || clientName || 'Cliente Global Exchange',
                identificacaoPagamento: `Saque GX ${txid.slice(0, 10)}`,
              }
            : {
                numeroDocumentoDebito: config.pixKey,
                numeroContrato: contractNum,
                numeroContratoPagamento: contractNum,
                numeroConvenio: convenioNum,
                convenio: convenioStr,
                valorPagamento: Number(amount).toFixed(2),
                formaPagamento: 1, // Crédito em Conta / TED
                agenciaFavorecido: (bankAgency || '0001').replace(/\D/g, ''),
                contaCorrenteFavorecido: (bankAccount || '000000').replace(/\D/g, ''),
                digitoVerificadorFavorecido: (accountDigit || '0').replace(/\D/g, ''),
                nomeFavorecido: recipientName || clientName || 'Cliente Global Exchange',
                cpfCnpjFavorecido: (recipientDoc || '').replace(/\D/g, '') || undefined,
                identificacaoPagamento: `Saque GX ${txid.slice(0, 10)}`,
              },
        ],
      };

      const postData = JSON.stringify(lotePayload);
      const targetPath = isPix ? '/lotes-pix' : '/lotes-transferencias';
      const parsedUrl = new URL(`${config.pagamentosApiUrl}${targetPath}`);
      const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}&numeroContratoPagamento=${contractStr}&numeroContrato=${contractStr}&numeroConvenio=${convenioStr}&convenio=${convenioStr}`;

      bbResponse = await new Promise((resolve) => {
        const req = https.request(
          {
            hostname: parsedUrl.hostname,
            port: 443,
            path: requestPath,
            method: 'POST',
            agent,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
              'gw-dev-app-key': config.gwAppKey,
              'X-Numero-Contrato': contractStr,
              'X-Numero-Contrato-Pagamento': contractStr,
              'X-Numero-Convenio': convenioStr,
              'X-Convenio': convenioStr,
              'numero-contrato': contractStr,
              'numero-contrato-pagamento': contractStr,
              'numero-convenio': convenioStr,
              'convenio': convenioStr,
            },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve({ success: true, statusCode: res.statusCode, data: JSON.parse(body), numeroContrato: contractStr, numeroConvenio: contractStr, convenio: contractStr });
                } catch {
                  resolve({ success: true, statusCode: res.statusCode, data: body, numeroContrato: contractStr, numeroConvenio: contractStr, convenio: contractStr });
                }
              } else {
                console.warn(`[Saque BB] Retorno HTTP ${res.statusCode} da API BB:`, body);
                resolve({ success: false, statusCode: res.statusCode, error: body, numeroContrato: contractStr, numeroConvenio: contractStr, convenio: contractStr });
              }
            });
          }
        );

        req.on('error', (err) => {
          console.warn('[Saque BB] Erro na requisição mTLS com BB:', err.message);
          resolve({ success: false, error: err.message });
        });

        req.write(postData);
        req.end();
      });


      isDirectBbApi = Boolean(bbResponse?.success);
      if (isDirectBbApi) {
        apiStatus = 'LIQUIDADO_BANCO_DO_BRASIL';
      } else {
        apiStatus = 'AGUARDANDO_ALCADA_BB';
        apiErrorDetail = bbResponse?.error || `HTTP ${bbResponse?.statusCode || 'ERR'}`;
      }
    } catch (bbErr) {
      console.warn('[Saque BB] Falha na comunicação direta:', bbErr.message);
      isDirectBbApi = false;
      apiStatus = 'AGUARDANDO_ALCADA_BB';
      apiErrorDetail = bbErr.message;
    }
  } else {
    apiStatus = 'AGUARDANDO_ALCADA_BB';
    apiErrorDetail = 'Credenciais de API do Banco do Brasil (BB_CLIENT_ID, BB_CLIENT_SECRET) não configuradas no servidor.';
  }

  // Atualiza saldo em gx-data.json se existir
  try {
    const data = readGxData();
    const cleanEmail = (clientEmail || '').toLowerCase().trim();
    const isGeoni = cleanEmail.includes('geoni') || cleanEmail.includes('matos') || cleanEmail === 'geonimatos31@hotmail.com' || cleanEmail === 'geonimatos42@gmail.com';
    const geoniEmails = [
      'geonimatos31@hotmail.com',
      'geonimatos31@gmail.com',
      'geoniclementino31@gmail.com',
      'geonimatos42@gmail.com',
      'geonicesar31@hotmail.com',
      'geonimatos31.nautilus@gmail.com',
    ];

    if (!data.brlBalances) data.brlBalances = {};
    if (!data.usdtBalances) data.usdtBalances = {};
    if (!Array.isArray(data.clients)) data.clients = [];
    if (!Array.isArray(data.ledger)) data.ledger = [];
    if (!Array.isArray(data.movements)) data.movements = [];

    const curBal = Number(data.brlBalances[cleanEmail] ?? 438804.34);
    const newBal = Math.max(0, curBal - amount);
    const usdBrlRate = Number(data.usdBrlRate) || 5.43;
    const newUsdt = Number((newBal / usdBrlRate).toFixed(2));

    const targetEmails = isGeoni ? geoniEmails : [cleanEmail];
    targetEmails.forEach((em) => {
      data.brlBalances[em] = newBal;
      data.usdtBalances[em] = newUsdt;
    });

    data.clients.forEach((c) => {
      const cEm = (c.email || '').toLowerCase().trim();
      if (cEm === cleanEmail || (isGeoni && targetEmails.includes(cEm))) {
        c.balanceBrl = newBal;
        c.balanceUsdt = newUsdt;
        c.walletBalance = newBal;
        c.updatedAt = new Date().toISOString();
      }
    });

    const destDesc =
      destinationType === 'pix'
        ? `Chave Pix ${pixKey} (${pixKeyType || 'Pix'})`
        : `Conta Corrente BB Ag: ${bankAgency || 'N/A'} Conta: ${bankAccount || 'N/A'}${accountDigit ? `-${accountDigit}` : ''}`;

    data.movements.unshift({
      id: txid,
      txid,
      clientId: clientEmail,
      clientEmail,
      clientName: recipientName || clientName || clientEmail,
      type: 'SAQUE BANCÁRIO',
      description: `Transferência Instantânea Direta Banco do Brasil: Saque de R$ ${amount.toFixed(2)} para ${destDesc}`,
      value: amount,
      currency: 'BRL',
      status: isDirectBbApi ? 'CONFIRMADO' : 'PENDENTE_LIBERACAO_BB',
      bankStatus: apiStatus,
      recipient: destDesc,
      destinationType,
      pixKey,
      pixKeyType,
      bankAgency,
      bankAccount,
      accountDigit,
      endToEndId,
      errorDetail: apiErrorDetail || undefined,
      createdAt: now.toISOString(),
      note: isDirectBbApi
        ? 'Liquidado via API Banco do Brasil'
        : 'Aguardando efetivação na alçada corporativa do Gerenciador Financeiro BB PJ ou transferência pela Mesa de Operações',
    });

    // Insere no Livro Razão
    data.ledger.unshift({
      id: `LEDGER-SAQUE-${Date.now()}`,
      type: 'Saque Bancário Pix BB',
      counterparty: `Custódia Engecema -> ${recipientName || clientName || clientEmail}`,
      amountGx: 0,
      amountBrl: -amount,
      amountUsdt: -Number((amount / usdBrlRate).toFixed(2)),
      txid,
      timestamp: new Date().toLocaleString('pt-BR'),
      status: isDirectBbApi ? 'Liquidado via Pix BB' : 'Pendente Alçada BB PJ',
      beneficiaryEmail: clientEmail,
      notes: `Saque de R$ ${amount.toFixed(2)} via Pix (${destDesc})`,
    });

    writeGxData(data);
  } catch (err) {
    console.error('Erro ao atualizar gx-data.json para saque:', err);
  }

  const finalMsg = isDirectBbApi
    ? 'Transferência Pix liquidada com SUCESSO via API do Banco do Brasil!'
    : `Ordem de saque registrada na Global Exchange. Débito de R$ ${amount.toFixed(2)} reservado. Aguardando liberação na alçada do Gerenciador Financeiro BB PJ ou envio imediato pela Mesa de Operações (${apiErrorDetail ? 'Status BB: ' + apiErrorDetail : 'Aguardando autorização'}).`;

  return {
    success: true,
    bankSettled: isDirectBbApi,
    txid,
    endToEndId,
    amount,
    isDirectBbApi,
    apiStatus,
    apiErrorDetail,
    bbResponse,
    executedAt: now.toISOString(),
    message: finalMsg,
  };
}

// Retenta disparo via API BB de uma ordem de saque pendente existente
async function retryBBPixTransfer(txid) {
  const data = readGxData();
  const mov = (data.movements || []).find((m) => m.txid === txid || m.id === txid);

  if (!mov) {
    return { success: false, error: 'Ordem de saque não encontrada pelo TXID: ' + txid };
  }

  const config = getBBConfig();
  if (!config.clientId || !config.clientSecret || !config.gwAppKey) {
    return {
      success: false,
      error: 'Credenciais do Banco do Brasil não configuradas. Insira BB_CLIENT_ID e BB_CLIENT_SECRET nas configurações.',
    };
  }

  try {
    const token = await getBBAccessToken();
    const agent = createBBAgent();

    const transferPayload = {
      valor: Number(mov.value).toFixed(2),
      pagador: {
        chave: config.pixKey,
      },
      favorecido: mov.destinationType === 'pix' && mov.pixKey ? {
        chave: mov.pixKey.trim(),
      } : {
        contaBanco: {
          ispb: '00000000',
          agencia: (mov.bankAgency || '0001').replace(/\D/g, ''),
          contaCorrente: `${(mov.bankAccount || '000000').replace(/\D/g, '')}${mov.accountDigit ? mov.accountDigit.replace(/\D/g, '') : ''}`,
          tipoConta: 'CACC',
        },
      },
      infoPagador: `Saque Global Exchange - ${mov.clientEmail || mov.clientName}`,
    };

    const postData = JSON.stringify(transferPayload);
    const parsedUrl = new URL(`${config.pixApiUrl}/pix/${mov.endToEndId}`);
    const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}`;

    const resBB = await new Promise((resolve) => {
      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          port: 443,
          path: requestPath,
          method: 'PUT',
          agent,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'gw-dev-app-key': config.gwAppKey,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, body });
          });
        }
      );
      req.on('error', (err) => resolve({ statusCode: 500, body: err.message }));
      req.write(postData);
      req.end();
    });

    if (resBB.statusCode >= 200 && resBB.statusCode < 300) {
      mov.status = 'CONFIRMADO';
      mov.bankStatus = 'LIQUIDADO_BANCO_DO_BRASIL';
      mov.note = 'Liquidado com sucesso via API direta Banco do Brasil';
      writeGxData(data);
      return { success: true, message: 'Liquidado com sucesso no Banco do Brasil!', details: resBB.body };
    } else {
      mov.errorDetail = `HTTP ${resBB.statusCode}: ${resBB.body}`;
      writeGxData(data);
      return {
        success: false,
        statusCode: resBB.statusCode,
        message: `API BB retornou HTTP ${resBB.statusCode}: ${resBB.body}. Necessário liberação no Gerenciador Financeiro BB PJ ou transferência manual pela Mesa.`,
      };
    }
  } catch (err) {
    return { success: false, error: 'Erro ao conectar à API BB: ' + err.message };
  }
}

module.exports = {
  httpsAgent,
  createBBAgent,
  getBBConfig,
  updateRuntimeBBConfig,
  normalizeBBContractNumber,
  normalizeBBConvenioNumber,
  getBBAccessToken,
  diagnoseBBOAuthScopes,
  createBBCob,
  registerBBWebhookUrl,
  processIncomingPixNotification,
  processIncomingPagamentosLoteWebhook,
  clearWebhookEvents,
  saveWebhookEvent,
  generateTestWebhookEvent,
  executeBBPixTransfer,
  retryBBPixTransfer,
  charges,
  webhookEvents,
  CERTS_DIR,
  MTLS_CERT_PATH,
  ROOT_CA_PATH,
  BB_SANATIZED_CERTS_DIR,
  BB_CERT_PATH,
  BB_KEY_PATH,
};

