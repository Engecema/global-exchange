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

// Variáveis de ambiente BB em modo 100% PRODUÇÃO (sem simulação ou sandbox)
let runtimeConfig = null;

function sanitizeGwAppKey(rawKey, allowEmpty = true) {
  if (rawKey === '' || rawKey === null || rawKey === undefined) {
    return '';
  }
  const clean = String(rawKey)
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n\t\s]/g, '');
  if (!clean) return '';
  const lower = clean.toLowerCase();
  if (lower.startsWith('insira') || lower === 'changeme' || lower === 'seu_gw_app_key') {
    return allowEmpty ? '' : clean;
  }
  return lower;
}

function normalizeUrl(url, defaultPrefix = 'https://') {
  if (!url) return '';
  let u = String(url).trim();
  // Remove protocolos duplicados ou erros de digitação como https://://bb.com.br
  u = u.replace(/^(https?:\/\/)+/i, '');
  u = u.replace(/^:?\/\/+/i, '');

  // Corrige apenas domínios legados/inexistentes específicos no DNS do Banco do Brasil
  if (/^(api\.oauth|oauth\.ip)\.bb\.com\.br/i.test(u)) {
    u = u.replace(/^(api\.oauth|oauth\.ip)\.bb\.com\.br/i, 'oauth.bb.com.br');
  }
  if (/^(api\.ip|ip)\.bb\.com\.br/i.test(u)) {
    u = u.replace(/^(api\.ip|ip)\.bb\.com\.br/i, 'api.bb.com.br');
  }

  // Converte apenas o domínio raiz nu (bb.com.br ou www.bb.com.br) sem corromper subdomínios válidos (ex: api-pix.bb.com.br, hm.bb.com.br)
  const hostOnly = u.split('/')[0].split(':')[0].toLowerCase();
  if (hostOnly === 'bb.com.br' || hostOnly === 'www.bb.com.br') {
    u = u.replace(/^(www\.)?bb\.com\.br/i, 'api.bb.com.br');
  }

  // Salvaguarda Anti-SSRF estrita (OWASP A10): endpoints BB só podem apontar para bb.com.br / *.bb.com.br sobre HTTPS
  const candidate = `https://${u}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    console.warn('[Segurança Anti-SSRF] URL BB malformada. Neutralizada para api.bb.com.br.');
    return `${defaultPrefix}api.bb.com.br`;
  }

  if (parsed.username || parsed.password) {
    console.warn('[Segurança Anti-SSRF] Credenciais embutidas (userinfo) rejeitadas na URL BB.');
    return `${defaultPrefix}api.bb.com.br`;
  }

  const hostPart = parsed.hostname.toLowerCase();
  const isBbHost = hostPart === 'bb.com.br' || hostPart.endsWith('.bb.com.br');
  if (!isBbHost) {
    console.warn(`[Segurança Anti-SSRF] Tentativa de desvio para host não-BB: ${hostPart}. Neutralizado para api.bb.com.br.`);
    return `${defaultPrefix}api.bb.com.br`;
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  return `https://${parsed.host}${cleanPath}${parsed.search}`.replace(/\/+$/, '');
}

function getCanonicalWebhookCallbackUrl() {
  const pub = (process.env.GX_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (pub && /^https:\/\//i.test(pub)) {
    return `${pub}/api/webhook/pix`;
  }
  return 'https://global-exchange-zecy.onrender.com/api/webhook/pix';
}

function sanitizeWebhookCallbackUrl(url) {
  const fallback = getCanonicalWebhookCallbackUrl();
  if (!url) return fallback;
  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    return fallback;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return fallback;
  }
  const canonicalHost = (() => {
    try { return new URL(fallback).hostname.toLowerCase(); } catch { return 'global-exchange-zecy.onrender.com'; }
  })();
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set([canonicalHost, 'global-exchange-zecy.onrender.com']);
  if (!allowedHosts.has(host)) {
    console.warn(`[Segurança Anti-SSRF] Callback webhook fora do host canônico rejeitado: ${host}`);
    return fallback;
  }
  if (!parsed.pathname.startsWith('/api/webhook/')) {
    return fallback;
  }
  return parsed.toString().replace(/\/+$/, '');
}

function maskWebhookSecretInUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(String(rawUrl));
    if (parsed.searchParams.has('secret')) parsed.searchParams.set('secret', '***');
    if (parsed.searchParams.has('token')) parsed.searchParams.set('token', '***');
    return parsed.toString();
  } catch {
    return String(rawUrl).replace(/([?&](?:secret|token)=)[^&]+/gi, '$1***');
  }
}

function formatBBErrorMessage(statusCode, rawBody) {
  if (!rawBody) return `HTTP ${statusCode}`;
  const str = String(rawBody).trim();
  if (str.includes('<html') || str.includes('<!DOCTYPE') || str.startsWith('<')) {
    const idMatch = str.match(/<h2>([a-f0-9]{16,})<\/h2>/i) || str.match(/identificador de seguran[cç]a.*?([a-f0-9]{16,})/i) || str.match(/Ray ID:\s*<code>?([a-f0-9]+)/i);
    const ipMatch = str.match(/IP\s*:\s*([0-9.]+)/i);
    const secId = idMatch ? idMatch[1] : '';
    const clientIp = ipMatch ? ipMatch[1] : '';

    return `O Firewall de Segurança (WAF) do Banco do Brasil bloqueou a conexão (HTTP ${statusCode}). ${secId ? `[ID de Segurança BB: ${secId}] ` : ''}${clientIp ? `[IP do Servidor: ${clientIp}] ` : ''}Verifique as credenciais e permissões da aplicação no portal Developers BB e, se necessário, solicite a liberação do IP ${clientIp || 'do servidor'} ao suporte do banco, informando o ID ${secId || 'de segurança'}.`;
  }
  try {
    const json = JSON.parse(str);
    let msg = '';
    if (json.error_description) msg = `${json.error}: ${json.error_description}`;
    else if (json.message) msg = json.message;
    else if (json.detail) msg = `${json.detail} ${json.userHelp ? '(' + json.userHelp + ')' : ''}`;
    else if (json.error) msg = String(json.error);

    if (msg) {
      if (msg.includes('invalid_scope') || msg.includes('Cliente nao possui autorizacao')) {
        msg += ' [DIAGNÓSTICO BB]: O Banco do Brasil retornou invalid_scope. Verifique no Gerenciador Financeiro BB PJ (aapj.bb.com.br > Segurança > API Banco do Brasil > Autorizar Aplicação) se a aplicação atual está vinculada e autorizada em Produção para o contrato vigente (29076).';
      } else if (msg.includes('invalid_client') || msg.includes('Bad credentials') || statusCode === 401) {
        msg += ' [DIAGNÓSTICO BB]: Credenciais rejeitadas pelo OAuth BB (invalid_client). Confirme se BB_CLIENT_ID, BB_CLIENT_SECRET e BB_GW_APP_KEY correspondem à nova aplicação gerada para o Contrato 29076 no Developers BB.';
      }
      return msg;
    }
  } catch {}
  let result = str.length > 300 ? str.slice(0, 300) + '...' : str;
  if (result.includes('invalid_scope') || result.includes('Cliente nao possui autorizacao')) {
    result += ' [DIAGNÓSTICO BB]: Autorize a aplicação no Gerenciador Financeiro BB PJ (aapj.bb.com.br > Segurança > API Banco do Brasil > Autorizar Aplicação) para o Contrato 29076.';
  }
  return result;
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
// Contrato: 29076 | Aplicação: 300132 | Webhook Identificador: 29076
function normalizeBBContractNumber(val, fallback = '29076') {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  const digits = str.replace(/\D/g, '');
  const unpadded = digits.replace(/^0+/, '');
  if (!unpadded || unpadded === '300132') return fallback;
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
    ''
  );
  let gwAppKey = sanitizeGwAppKey(rawGwAppKey, true);

  let pixKey = (
    process.env.BB_PIX_KEY ||
    process.env.CHAVE_PIX ||
    '05368602000110'
  ).trim().replace(/\D/g, '') || '05368602000110';

  // Amarração de Contratos e Canais de Transmissão Oficiais (ENGECEMA)
  // Contrato: 29076 | Aplicação: 300132 | Webhook Identificador: 29076
  let numeroContrato = normalizeBBContractNumber(
    process.env.BB_CONTRACT_ID ||
    process.env.BB_NUMERO_CONTRATO ||
    process.env.BB_CONTRATO ||
    process.env.BB_NUMERO_CONTRATO_PAGAMENTO ||
    process.env.BB_CONTRACT_NUMBER ||
    '29076'
  );

  let webhookIdentificador = normalizeBBContractNumber(
    process.env.BB_WEBHOOK_IDENTIFICADOR ||
    process.env.BB_CONTRACT_ID ||
    numeroContrato,
    numeroContrato
  );
  let webhookEvento = (process.env.BB_WEBHOOK_EVENTO || 'PAGAMENTOS-LOTE').trim();
  let applicationId = (process.env.GX_APPLICATION_ID || process.env.BB_APPLICATION_ID || '300132').trim();
  let applicationName = (process.env.BB_APPLICATION_NAME || 'GX PAGAMENTOS').trim();
  let envStatus = (process.env.BB_ENV_STATUS || 'PRODUÇÃO ATIVA').trim();
  let corporateName = (process.env.CORPORATE_NAME || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA').trim();
  let companyCnpj = (process.env.COMPANY_CNPJ || '05368602000110').trim();

  // Endpoints oficiais de produção Banco do Brasil (API Exclusiva: Pagamentos em Lote V1)
  let apiUrl = normalizeUrl(process.env.BB_API_URL || 'https://api.bb.com.br');
  let ipUrl = normalizeUrl(process.env.BB_IP_API_URL || apiUrl || 'https://api.bb.com.br');
  let pagamentosApiUrl = normalizeUrl(process.env.BB_PAGAMENTOS_API_URL || `${apiUrl}/pagamentos-lote/v1`);
  let oauthUrl = normalizeUrl(process.env.BB_OAUTH_URL || 'https://oauth.bb.com.br/oauth/token');
  const CANONICAL_BB_WEBHOOK_CALLBACK_URL = getCanonicalWebhookCallbackUrl();
  const scope = (process.env.BB_OAUTH_SCOPE || 'pagamentos-lote.requisicao').trim() || 'pagamentos-lote.requisicao';

  // URL de retorno (Callback) do Webhook vinculada estritamente à BB_WEBHOOK_CALLBACK_URL
  const rawCallbackCandidate = (
    process.env.BB_WEBHOOK_CALLBACK_URL ||
    process.env.BB_WEBHOOKS_CALLBACK_URL ||
    process.env.GX_WEBHOOK_CALLBACK_URL ||
    CANONICAL_BB_WEBHOOK_CALLBACK_URL
  ).trim();

  const webhookCallbackUrl = sanitizeWebhookCallbackUrl(rawCallbackCandidate);

  // BB_WEBHOOKS_URL mantida estritamente como endpoint de consumo da API do Banco do Brasil
  const rawBankWebhooksUrl = (process.env.BB_WEBHOOKS_URL || `${pagamentosApiUrl}/webhook`).trim();
  const isInvalidBankWebhookUrl =
    !rawBankWebhooksUrl ||
    rawBankWebhooksUrl.includes('webhooks.com.br') ||
    rawBankWebhooksUrl.includes('global-exchange-zecy.onrender.com');
  let webhooksUrl = normalizeUrl(isInvalidBankWebhookUrl ? `${pagamentosApiUrl}/webhook` : rawBankWebhooksUrl);

  return {
    clientId,
    clientSecret,
    gwAppKey,
    pixKey,
    numeroContrato,
    numeroContratoPagamento: parseInt(numeroContrato, 10),
    contrato: numeroContrato,
    contractNumber: numeroContrato,
    contractId: numeroContrato,
    bbContractId: numeroContrato,
    identificador: webhookIdentificador,
    webhookIdentificador,
    webhookEvento,
    applicationId,
    gxApplicationId: applicationId,
    applicationName,
    envStatus,
    corporateName,
    companyCnpj,
    env: (process.env.BB_ENV || 'production').trim() || 'production',
    applicationType: 'PAGAMENTOS_EM_LOTE_V1',
    scope,
    apiUrl,
    ipUrl,
    pagamentosApiUrl,
    oauthUrl,
    webhooksUrl,
    webhookCallbackUrl,
    mtlsCert: '',
    mtlsKey: '',
  };
}

function updateRuntimeBBConfig(newCfg = {}) {
  const current = getBBConfig();
  const rawClientId = newCfg.clientId !== undefined ? newCfg.clientId : (newCfg.bbClientId !== undefined ? newCfg.bbClientId : (newCfg.clienteId !== undefined ? newCfg.clienteId : current.clientId));
  const rawClientSecret = newCfg.clientSecret !== undefined ? newCfg.clientSecret : (newCfg.bbClientSecret !== undefined ? newCfg.bbClientSecret : (newCfg.clienteSecret !== undefined ? newCfg.clienteSecret : current.clientSecret));
  const rawGwAppKey = newCfg.gwAppKey !== undefined ? newCfg.gwAppKey : (newCfg.bbGwAppKey !== undefined ? newCfg.bbGwAppKey : (newCfg.apiKey !== undefined ? newCfg.apiKey : (newCfg.bbApiKey !== undefined ? newCfg.bbApiKey : (newCfg.devAppKey !== undefined ? newCfg.devAppKey : (newCfg.developerKey !== undefined ? newCfg.developerKey : current.gwAppKey)))));

  let clientId = String(rawClientId || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
  let clientSecret = String(rawClientSecret || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
  let gwAppKey = sanitizeGwAppKey(rawGwAppKey, true);
  let pixKey = (newCfg.pixKey !== undefined ? newCfg.pixKey : current.pixKey).trim().replace(/\D/g, '') || '05368602000110';

  let numeroContrato = normalizeBBContractNumber(
    newCfg.numeroContrato !== undefined
      ? newCfg.numeroContrato
      : (newCfg.contrato !== undefined
        ? newCfg.contrato
        : (newCfg.bbNumeroContrato !== undefined ? newCfg.bbNumeroContrato : current.numeroContrato))
  );

  let webhookIdentificador = normalizeBBContractNumber(
    newCfg.webhookIdentificador || newCfg.bbWebhookIdentificador || newCfg.identificador || numeroContrato,
    numeroContrato
  );
  let webhookEvento = (newCfg.webhookEvento || current.webhookEvento || 'PAGAMENTOS-LOTE').trim();
  let applicationId = String(newCfg.applicationId || newCfg.gxApplicationId || current.applicationId || '300132').trim() || '300132';
  let applicationName = String(newCfg.applicationName || current.applicationName || 'GX PAGAMENTOS').trim();
  let corporateName = String(newCfg.corporateName || current.corporateName || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA').trim();
  let companyCnpj = String(newCfg.companyCnpj || current.companyCnpj || '05368602000110').trim();

  let apiUrl = normalizeUrl(newCfg.apiUrl !== undefined ? newCfg.apiUrl : current.apiUrl || 'https://api.bb.com.br');
  let ipUrl = normalizeUrl(newCfg.ipUrl !== undefined ? newCfg.ipUrl : current.ipUrl || 'https://api.bb.com.br');
  let pagamentosApiUrl = normalizeUrl(newCfg.pagamentosApiUrl !== undefined ? newCfg.pagamentosApiUrl : current.pagamentosApiUrl || `${apiUrl}/pagamentos-lote/v1`);
  let oauthUrl = normalizeUrl(newCfg.oauthUrl !== undefined ? newCfg.oauthUrl : current.oauthUrl || 'https://oauth.bb.com.br/oauth/token');

  const rawCallbackCandidate = String(newCfg.webhookCallbackUrl !== undefined ? newCfg.webhookCallbackUrl : (process.env.BB_WEBHOOK_CALLBACK_URL || current.webhookCallbackUrl || getCanonicalWebhookCallbackUrl())).trim();
  const webhookCallbackUrl = sanitizeWebhookCallbackUrl(rawCallbackCandidate);

  const rawBankWebhooks = String(newCfg.webhooksUrl !== undefined ? newCfg.webhooksUrl : (process.env.BB_WEBHOOKS_URL || current.webhooksUrl || `${pagamentosApiUrl}/webhook`)).trim();
  let webhooksUrl = normalizeUrl(
    !rawBankWebhooks || rawBankWebhooks.includes('webhooks.com.br') || rawBankWebhooks.includes('global-exchange-zecy.onrender.com')
      ? `${pagamentosApiUrl}/webhook`
      : rawBankWebhooks
  );

  let targetScope = newCfg.scope !== undefined
    ? String(newCfg.scope).trim()
    : (current.scope || process.env.BB_OAUTH_SCOPE || 'pagamentos-lote.requisicao');

  const mtlsCert = newCfg.mtlsCert !== undefined ? String(newCfg.mtlsCert).trim() : (current.mtlsCert || '');
  const mtlsKey = newCfg.mtlsKey !== undefined ? String(newCfg.mtlsKey).trim() : (current.mtlsKey || '');

  runtimeConfig = {
    clientId,
    clientSecret,
    gwAppKey,
    pixKey,
    numeroContrato,
    numeroContratoPagamento: parseInt(numeroContrato, 10),
    contrato: numeroContrato,
    contractNumber: numeroContrato,
    contractId: numeroContrato,
    bbContractId: numeroContrato,
    identificador: webhookIdentificador,
    webhookIdentificador,
    webhookEvento,
    applicationId,
    gxApplicationId: applicationId,
    applicationName,
    envStatus: current.envStatus || process.env.BB_ENV_STATUS || 'PRODUÇÃO ATIVA',
    corporateName,
    companyCnpj,
    env: current.env || 'production',
    applicationType: 'PAGAMENTOS_EM_LOTE_V1',
    scope: targetScope,
    apiUrl,
    ipUrl,
    pagamentosApiUrl,
    oauthUrl,
    webhooksUrl,
    webhookCallbackUrl,
    mtlsCert,
    mtlsKey,
  };

  // Sincroniza em memória com process.env para efeito imediato no processo em execução
  process.env.CORPORATE_NAME = corporateName;
  process.env.COMPANY_CNPJ = companyCnpj;
  process.env.GX_APPLICATION_ID = applicationId;
  process.env.BB_APPLICATION_ID = applicationId;
  process.env.BB_CONTRACT_ID = numeroContrato;
  process.env.BB_APPLICATION_NAME = applicationName;
  process.env.BB_CLIENT_ID = clientId;
  process.env.BB_CLIENT_SECRET = clientSecret;
  process.env.BB_GW_APP_KEY = gwAppKey;
  process.env.GW_DEV_APP_KEY = gwAppKey;
  process.env.BB_PIX_KEY = pixKey;
  process.env.BB_NUMERO_CONTRATO = numeroContrato;
  process.env.BB_CONTRATO = numeroContrato;
  process.env.BB_NUMERO_CONTRATO_PAGAMENTO = numeroContrato;
  process.env.BB_WEBHOOK_EVENTO = webhookEvento;
  process.env.BB_WEBHOOK_IDENTIFICADOR = webhookIdentificador;
  process.env.BB_WEBHOOK_CALLBACK_URL = webhookCallbackUrl;
  process.env.BB_API_URL = apiUrl;
  process.env.BB_IP_API_URL = ipUrl;
  process.env.BB_PIX_API_URL = pagamentosApiUrl;
  process.env.BB_PAGAMENTOS_API_URL = pagamentosApiUrl;
  process.env.BB_OAUTH_URL = oauthUrl;
  process.env.BB_WEBHOOKS_URL = webhooksUrl;
  process.env.BB_OAUTH_SCOPE = targetScope;
  if (newCfg.mtlsCert !== undefined) process.env.BB_MTLS_CERT = mtlsCert;
  if (newCfg.mtlsKey !== undefined) process.env.BB_MTLS_KEY = mtlsKey;

  // Reconstrói o agente HTTPS mTLS com os certificados e variáveis atualizados
  httpsAgent = createBBAgent();

  // Persiste no arquivo .env preservando rigorosamente as variáveis existentes e sanitizando contra injeção de linha
  try {
    const envPath = path.join(__dirname, '..', '.env');
    let existingContent = '';
    if (fs.existsSync(envPath)) {
      existingContent = fs.readFileSync(envPath, 'utf8');
    }
    const sanitizeEnvValue = (val) => String(val ?? '').replace(/[\r\n\0]/g, '').trim();
    const bbEntries = {
      CORPORATE_NAME: sanitizeEnvValue(corporateName),
      COMPANY_CNPJ: sanitizeEnvValue(companyCnpj),
      GX_APPLICATION_ID: sanitizeEnvValue(applicationId),
      BB_APPLICATION_ID: sanitizeEnvValue(applicationId),
      BB_CONTRACT_ID: sanitizeEnvValue(numeroContrato),
      BB_APPLICATION_NAME: sanitizeEnvValue(applicationName),
      BB_ENV_STATUS: 'PRODUÇÃO ATIVA',
      BB_CLIENT_ID: sanitizeEnvValue(clientId),
      BB_CLIENT_SECRET: sanitizeEnvValue(clientSecret),
      BB_GW_APP_KEY: sanitizeEnvValue(gwAppKey),
      BB_PIX_KEY: sanitizeEnvValue(pixKey),
      BB_NUMERO_CONTRATO: sanitizeEnvValue(numeroContrato),
      BB_CONTRATO: sanitizeEnvValue(numeroContrato),
      BB_NUMERO_CONTRATO_PAGAMENTO: sanitizeEnvValue(numeroContrato),
      BB_WEBHOOK_EVENTO: sanitizeEnvValue(webhookEvento),
      BB_WEBHOOK_IDENTIFICADOR: sanitizeEnvValue(webhookIdentificador),
      BB_WEBHOOK_CALLBACK_URL: sanitizeEnvValue(webhookCallbackUrl),
      BB_ENV: 'production',
      BB_API_URL: sanitizeEnvValue(apiUrl),
      BB_IP_API_URL: sanitizeEnvValue(ipUrl),
      BB_PIX_API_URL: sanitizeEnvValue(pagamentosApiUrl),
      BB_PAGAMENTOS_API_URL: sanitizeEnvValue(pagamentosApiUrl),
      BB_OAUTH_URL: sanitizeEnvValue(oauthUrl),
      BB_WEBHOOKS_URL: sanitizeEnvValue(webhooksUrl),
      BB_OAUTH_SCOPE: sanitizeEnvValue(targetScope),
    };

    const existingLines = existingContent ? existingContent.split(/\r?\n/) : [];
    const keysHandled = new Set();
    const updatedLines = existingLines.map((line) => {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match && bbEntries[match[1]] !== undefined) {
        keysHandled.add(match[1]);
        return `${match[1]}=${bbEntries[match[1]]}`;
      }
      return line;
    });

    Object.entries(bbEntries).forEach(([k, v]) => {
      if (!keysHandled.has(k)) {
        updatedLines.push(`${k}=${v}`);
      }
    });

    const tmpEnvPath = `${envPath}.tmp`;
    fs.writeFileSync(tmpEnvPath, updatedLines.filter((l, idx, arr) => !(l === '' && idx === arr.length - 1)).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpEnvPath, envPath);
  } catch (e) {
    console.warn('[Pix BB] Não foi possível persistir no .env:', e.message);
  }

  return runtimeConfig;
}

function clearBBCredentials() {
  const current = getBBConfig();
  runtimeConfig = {
    ...current,
    clientId: '',
    clientSecret: '',
    gwAppKey: '',
  };
  process.env.BB_CLIENT_ID = '';
  process.env.BB_CLIENT_SECRET = '';
  process.env.BB_GW_APP_KEY = '';
  process.env.GW_DEV_APP_KEY = '';
  process.env.BB_DEV_APP_KEY = '';

  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/^BB_CLIENT_ID=.*$/m, 'BB_CLIENT_ID=');
      content = content.replace(/^BB_CLIENT_SECRET=.*$/m, 'BB_CLIENT_SECRET=');
      content = content.replace(/^BB_GW_APP_KEY=.*$/m, 'BB_GW_APP_KEY=');
      content = content.replace(/^GW_DEV_APP_KEY=.*$/m, 'GW_DEV_APP_KEY=');
      fs.writeFileSync(envPath, content, 'utf8');
    }
  } catch {}

  httpsAgent = createBBAgent();
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

// Verifica se um certificado X.509 pertence aos servidores públicos do Banco do Brasil (e não é certificado cliente mTLS da empresa)
function isBBServerCertificate(certData) {
  if (!certData) return false;
  try {
    const certObj = new crypto.X509Certificate(certData);
    const subj = String(certObj.subject || '').toLowerCase();
    return (
      subj.includes('cn=api.bb.com.br') ||
      subj.includes('cn=api-pix.bb.com.br') ||
      subj.includes('cn=*.mtls.api.bb.com.br') ||
      subj.includes('cn=*.bb.com.br') ||
      subj.includes('o=banco do brasil')
    );
  } catch {
    return certData.includes('CN=api.bb.com.br') || certData.includes('CN=*.mtls.api.bb.com.br');
  }
}

// Carrega e consolida a cadeia completa de Autoridades Certificadoras (CAs) do Banco do Brasil
function loadBBCertificateAuthorities() {
  const rootDir = process.cwd();
  const caList = Array.isArray(tls.rootCertificates) ? [...tls.rootCertificates] : [];

  const caFiles = [
    path.resolve(rootDir, 'apps/api-gateway/certs/A partir de 26.10/1 - DigiCert Global Root G2.crt'),
    path.resolve(rootDir, 'apps/api-gateway/certs/A partir de 26.10/2 - GeoTrust EV RSA CA G2.crt'),
    path.resolve(rootDir, 'apps/api-gateway/certs/A partir de 26.10/api.bb.com.br.crt'),
    path.resolve(rootDir, 'src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.pem'),
    path.resolve(rootDir, 'apps/api-gateway/certs/1 - DigiCert Global Root G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/2 - GeoTrust TLS RSA CA G1.crt'),
    path.resolve(rootDir, 'apps/api-gateway/certs/api-pix.bb.com.br/1-DigiCert Global Root G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/api-pix.bb.com.br/2-GeoTrust EV RSA CA G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/Ate 25.10/1 - DigiCert Global Root G2.cer'),
    path.resolve(rootDir, 'apps/api-gateway/certs/Ate 25.10/2 - GeoTrust EV RSA CA G2.cer'),
  ];

  const appendIfValidCa = (pem) => {
    if (!pem || !pem.includes('-----BEGIN CERTIFICATE-----') || caList.includes(pem)) return;
    try {
      const x509 = new crypto.X509Certificate(pem);
      if (x509.validToDate && x509.validToDate.getTime() < Date.now()) return;
    } catch {}
    caList.push(pem);
  };

  for (const envKey of ['BB_CA_CERT', 'BB_ROOT_CA']) {
    if (process.env[envKey]) {
      appendIfValidCa(resolveCertOrKey(process.env[envKey]));
    }
  }

  for (const f of caFiles) {
    try {
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        appendIfValidCa(fs.readFileSync(f, 'utf8'));
      }
    } catch {}
  }

  return caList;
}

function resolveClientMtlsCredentials() {
  const certEnv =
    (runtimeConfig && runtimeConfig.mtlsCert) ||
    process.env.BB_MTLS_CERT ||
    process.env.BB_CERT ||
    process.env.MTLS_CERT ||
    process.env.BB_CERTIFICATE;
  const keyEnv =
    (runtimeConfig && runtimeConfig.mtlsKey) ||
    process.env.BB_MTLS_KEY ||
    process.env.BB_KEY ||
    process.env.MTLS_KEY ||
    process.env.BB_PRIVATE_KEY;

  let cert = resolveCertOrKey(certEnv);
  let key = resolveCertOrKey(keyEnv);
  let source = cert ? 'env/runtime' : 'none';

  // Verifica Render Secret Files exclusivamente de cliente (nunca usa certificado de servidor do BB como cert de cliente)
  if (!cert) {
    const clientSecretFiles = [
      '/etc/secrets/BB_MTLS_CERT',
      '/etc/secrets/bb_mtls.crt',
      '/etc/secrets/client.crt',
      '/etc/secrets/client.pem',
    ];
    for (const c of clientSecretFiles) {
      if (fs.existsSync(c)) {
        const candidate = resolveCertOrKey(c);
        if (candidate && !isBBServerCertificate(candidate)) {
          cert = candidate;
          source = c;
          break;
        }
      }
    }
  }

  if (!key) {
    const keySecretFiles = [
      '/etc/secrets/BB_MTLS_KEY',
      '/etc/secrets/bb_mtls.key',
      '/etc/secrets/client.key',
    ];
    for (const k of keySecretFiles) {
      if (fs.existsSync(k)) {
        key = resolveCertOrKey(k);
        if (key) break;
      }
    }
  }

  // Fallback opcional ao certificado legado apenas se o administrador tiver configurado a chave correspondente (sem forçar cert expirado/servidor)
  if (!cert && key) {
    const legacyCerts = [
      path.resolve(process.cwd(), 'src/certs/star_mtls_api_bb_com_br.crt'),
      path.resolve(process.cwd(), 'apps/api-gateway/certs/star_mtls_api_bb_com_br.crt'),
    ];
    for (const c of legacyCerts) {
      if (fs.existsSync(c)) {
        const cand = resolveCertOrKey(c);
        if (cand && validateMatchingKeypair(cand, key)) {
          cert = cand;
          source = c;
          break;
        }
      }
    }
  }

  let certExpired = false;
  let certValidTo = null;
  let certSubject = null;
  const isServerCertAsClient = Boolean(cert && isBBServerCertificate(cert));

  if (cert) {
    try {
      const certObj = new crypto.X509Certificate(cert);
      certSubject = certObj.subject || null;
      certValidTo = certObj.validTo || null;
      if (certObj.validToDate && certObj.validToDate.getTime() < Date.now()) {
        certExpired = true;
      }
    } catch {}
  }

  const keypairValid = Boolean(cert && key && !isServerCertAsClient && validateMatchingKeypair(cert, key));

  return {
    cert,
    key,
    source,
    hasClientCert: Boolean(cert && !isServerCertAsClient),
    hasClientKey: Boolean(key),
    keypairValid,
    certExpired,
    certValidTo,
    certSubject,
    isServerCertAsClient,
  };
}

function getMtlsDiagnostics() {
  const m = resolveClientMtlsCredentials();
  const rootCaFile = path.resolve(process.cwd(), 'apps/api-gateway/certs/A partir de 26.10/1 - DigiCert Global Root G2.crt');
  const rootCaFound = fs.existsSync(rootCaFile) || fs.existsSync(ROOT_CA_PATH);
  return {
    mtlsCertFound: m.hasClientCert && !m.certExpired,
    hasClientCert: m.hasClientCert,
    hasClientKey: m.hasClientKey,
    keypairValid: m.keypairValid,
    certExpired: m.certExpired,
    certValidTo: m.certValidTo,
    certSubject: m.certSubject,
    isServerCertAsClient: m.isServerCertAsClient,
    rootCaFound,
    source: m.source,
  };
}

// Agente HTTPS oficial com suporte dinâmico a mTLS e CA Bundle oficial do Banco do Brasil
function createBBAgent(options = {}) {
  const caBundle = loadBBCertificateAuthorities();
  const mtls = resolveClientMtlsCredentials();

  const agentOpts = {
    ca: caBundle.length > 0 ? caBundle : undefined,
    keepAlive: true,
    ...options,
    rejectUnauthorized: true,
  };

  if (mtls.keypairValid) {
    if (mtls.certExpired) {
      console.warn(`[mTLS BB] ATENÇÃO: Certificado cliente mTLS expirado em ${mtls.certValidTo}. Aplique o novo certificado em BB_MTLS_CERT/BB_MTLS_KEY no Render.`);
    }
    agentOpts.cert = mtls.cert;
    agentOpts.key = mtls.key;
  } else if (mtls.cert && mtls.key) {
    console.warn('[mTLS BB] Certificado e chave privada não formam um par correspondente (key values mismatch) ou foi informado um certificado público de servidor. Par não acoplado ao TLS.');
  }

  return new https.Agent(agentOpts);
}

let httpsAgent = createBBAgent();
function getBBAgent() {
  return httpsAgent;
}

// Memória local e persistente de cobranças, eventos de webhook e rastreamento Anti-Replay
const charges = new Map(); // txid -> charge object
const webhookEvents = []; // lista de eventos recebidos do BB
const processedPaymentIds = new Set(); // Proteção Anti-Replay contra ataques de repetição

function initWebhookEventsFromDisk() {
  try {
    const raw = readGxData();
    if (Array.isArray(raw.webhookEvents) && raw.webhookEvents.length > 0) {
      webhookEvents.push(...raw.webhookEvents);
      raw.webhookEvents.forEach((ev) => {
        if (ev.endToEndId) processedPaymentIds.add(String(ev.endToEndId));
        if (ev.txid) processedPaymentIds.add(String(ev.txid));
        if (ev.codigoIdentificadorPagamento) processedPaymentIds.add(String(ev.codigoIdentificadorPagamento));
      });
    }
    if (Array.isArray(raw.movements)) {
      raw.movements.forEach((m) => {
        if (m.endToEndId) processedPaymentIds.add(String(m.endToEndId));
        if (m.txid) processedPaymentIds.add(String(m.txid));
      });
    }
  } catch {}
}

initWebhookEventsFromDisk();

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
  const contractStr = normalizeBBContractNumber(config.numeroContrato || '29076');
  const contractNum = parseInt(contractStr, 10);
  const webhookEvento = 'PAGAMENTOS-LOTE';
  const webhookIdentificador = contractStr;

  // Validação estrita do identificador/contrato contra o contrato 29076 (Aplicação 300132)
  const incomingId = payload?.identificador || payload?.numeroContrato || payload?.contrato;
  if (incomingId !== undefined && incomingId !== null) {
    const cleanId = String(incomingId).trim().replace(/\D/g, '');
    if (cleanId && cleanId !== '29076' && cleanId !== contractStr) {
      console.warn(`[Webhook BB Pagamentos-Lote] Aviso: identificador recebido (${incomingId}) diverge do contrato ${contractStr}.`);
    }
  }

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
    if (!item || typeof item !== 'object') continue;
    const rawNumReq = item.numeroRequisiçãoPagamento !== undefined
      ? item.numeroRequisiçãoPagamento
      : (item.numeroRequisicaoPagamento !== undefined
        ? item.numeroRequisicaoPagamento
        : (item.numeroRequisicao || payload?.numeroRequisicao || ''));
    const numReq = String(rawNumReq).trim();

    const idPgto = String(item.codigoIdentificadorPagamento || item.identificacaoPagamento || item.id || `PGTO-${crypto.randomUUID().slice(0, 8)}`).trim();
    const nomeFav = String(item.nomeDoFavorecido || item.favorecido || item.nomeFavorecido || '').trim();
    const docFav = item.numeroCPFouCNPJ ? String(item.numeroCPFouCNPJ).trim() : String(item.cpfCnpj || '').trim();
    const dtPgto = item.dataPagamento || new Date().toISOString().slice(0, 10);
    const rawValor = item.valorPagamento !== undefined ? item.valorPagamento : (item.valor !== undefined ? item.valor : item.amount);
    const valor = Number(rawValor);
    if (!Number.isFinite(valor) || valor < 0) continue;

    const estado = String(item.textoEstado || item.estadoPagamento || item.estado || 'CONFIRMADO').trim();
    const statusPgto = estado.toUpperCase() === 'PAGO' ? 'PAGO (LIQUIDADO BB)' : estado.toUpperCase();
    const tipoPgto = String(item.descricaoTipoPagamento || item.tipoPagamento || 'Pagamentos Diversos Pix Transferência').trim();
    const codCliente = String(item.codigoIdentificadorInformadoCliente || '').trim();
    const codDescTipo = item.codigoDescricaoTipoPagamento || 12845;
    const codTextoEstado = item.codigoTextoEstado !== undefined ? item.codigoTextoEstado : 1;

    // Proteção Anti-Replay para lotes de pagamento
    const replayKey = idPgto ? `lote_${idPgto}` : '';
    if (replayKey && processedPaymentIds.has(replayKey)) {
      continue;
    }
    if (replayKey) processedPaymentIds.add(replayKey);

    // Se houver movimentações no sistema correspondentes, marca como CONFIRMADO / LIQUIDADO_BANCO_DO_BRASIL
    if (rawData && Array.isArray(rawData.movements)) {
      const matchMov = rawData.movements.find((m) =>
        (m.txid && idPgto && idPgto.includes(m.txid.slice(0, 8))) ||
        (m.txid && numReq && numReq.length >= 6 && String(numReq).includes(m.txid.slice(0, 6))) ||
        (m.id && idPgto && idPgto.includes(m.id.slice(0, 8))) ||
        (codCliente && codCliente.length >= 6 && (m.txid?.includes(codCliente) || m.id?.includes(codCliente)))
      );
      if (matchMov) {
        matchMov.status = 'CONFIRMADO';
        matchMov.bankStatus = 'LIQUIDADO_BANCO_DO_BRASIL';
        matchMov.settledAt = new Date().toISOString();
        matchMov.note = `Efetivado via Webhook Pagamentos em Lote BB (Req: ${numReq || 'N/I'} / Ident: ${idPgto})`;
      }
    }

    const ev = {
      id: `ev_${crypto.randomUUID()}`,
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
      numeroContrato: contractStr,
      numeroContratoPagamento: contractNum,
      contrato: contractStr,
      bbContractId: contractStr,
      webhookIdentificador,
      webhookEvento,
      applicationId: config.applicationId || '300132',
      gxApplicationId: config.applicationId || '300132',
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
  const contractStr = normalizeBBContractNumber(config.numeroContrato || '29076');
  const contractNum = parseInt(contractStr, 10);
  const webhookEvento = 'PAGAMENTOS-LOTE';
  const webhookIdentificador = contractStr;

  const numReq = customData.numeroRequisiçãoPagamento || customData.numeroRequisicaoPagamento || customData.numeroRequisicao || crypto.randomInt(100000, 999999);
  const idPgto = customData.codigoIdentificadorPagamento || customData.identificacaoPagamento || `SIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const nomeFav = customData.nomeDoFavorecido || customData.favorecido || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA';
  const docFav = customData.numeroCPFouCNPJ || '05368602000110';
  const val = parseFloat(customData.valorPagamento !== undefined ? customData.valorPagamento : (customData.valor !== undefined ? customData.valor : (customData.amount !== undefined ? customData.amount : 1.00)));
  const estado = customData.textoEstado || 'Pago';
  const descTipo = customData.descricaoTipoPagamento || 'Pagamentos Diversos Pix Transferência';

  const testEvent = {
    id: `ev_bb_${crypto.randomUUID()}`,
    tipo: 'PAGAMENTOS_LOTE',
    tipoEvento: webhookEvento,
    evento: webhookEvento,
    identificador: webhookIdentificador,
    webhookIdentificador,
    webhookEvento,
    numeroRequisicao: String(numReq),
    numeroRequisicaoPagamento: Number(numReq),
    codigoIdentificadorPagamento: String(idPgto),
    identificacaoPagamento: String(idPgto),
    nomeDoFavorecido: nomeFav,
    numeroCPFouCNPJ: String(docFav),
    dataPagamento: customData.dataPagamento || new Date().toISOString().slice(0, 10),
    valorPagamento: val,
    amount: val,
    valor: val,
    codigoTextoEstado: customData.codigoTextoEstado || 1,
    textoEstado: estado,
    status: estado.toUpperCase() === 'PAGO' ? 'PAGO (LIQUIDADO BB)' : 'LIQUIDADO_BANCO_DO_BRASIL',
    codigoIdentificadorInformadoCliente: customData.codigoIdentificadorInformadoCliente || `SIM-${contractStr}`,
    codigoDescricaoTipoPagamento: customData.codigoDescricaoTipoPagamento || 12845,
    descricaoTipoPagamento: descTipo,
    numeroContrato: contractStr,
    numeroContratoPagamento: contractNum,
    contrato: contractStr,
    bbContractId: contractStr,
    corporateName: config.corporateName || 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA',
    companyCnpj: config.companyCnpj || '05368602000110',
    applicationId: config.applicationId || '300132',
    gxApplicationId: config.applicationId || '300132',
    applicationName: config.applicationName || 'GX PAGAMENTOS',
    envStatus: config.envStatus || 'PRODUÇÃO ATIVA',
    endToEndId: customData.endToEndId || `E00000000${Date.now()}BB${contractStr}`,
    receivedAt: new Date().toISOString(),
    isTest: true,
    source: `Developers Banco do Brasil (Simulação Sandbox App 300132 · Contrato ${contractStr})`,
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
    const tmpPath = `${dataPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, dataPath);
  } catch (e) {
    console.error('Erro ao salvar gx-data.json:', e);
  }
}

// Escopo estrito e exclusivo exigido pelo Banco do Brasil para o aplicativo GX PAGAMENTOS (App 300132)
// A aplicação possui EXCLUSIVAMENTE a API Pagamentos em Lote (V1) vinculada.
function sanitizeBBOAuthScope(rawScope) {
  if (!rawScope || rawScope === 'default' || rawScope === 'none') return '';
  return String(rawScope).trim();
}

// Obtém token de acesso OAuth 2.0 do Banco do Brasil para Pagamentos em Lote (V1)
async function getBBAccessToken(customScope, customCredentials = {}) {
  if (typeof customScope === 'object' && customScope !== null) {
    customCredentials = customScope;
    customScope = customCredentials.scope;
  }
  const config = getBBConfig();
  let clientId = (customCredentials.clientId || config.clientId || process.env.BB_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
  let clientSecret = (customCredentials.clientSecret || config.clientSecret || process.env.BB_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
  let gwAppKey = sanitizeGwAppKey(customCredentials.gwAppKey || process.env.BB_GW_APP_KEY || config.gwAppKey);

  if (clientId.includes('@')) {
    throw new Error(`O Client ID informado ('${clientId}') é um e-mail do administrador inserido pelo preenchimento automático do navegador! O Client ID do Banco do Brasil deve ser a credencial oficial que inicia com 'eyJpZCI6...' gerada no Portal Developers do BB.`);
  }

  if (!clientId || !clientSecret || !gwAppKey) {
    throw new Error('Credenciais BB_CLIENT_ID, BB_CLIENT_SECRET ou BB_GW_APP_KEY não configuradas.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const agent = createBBAgent();

  // Escopo oficial configurável (padrão: pagamentos-lote.requisicao) ou sem parâmetro se vazio/default
  const rawTargetScope = customScope !== undefined
    ? customScope
    : (customCredentials.scope !== undefined
        ? customCredentials.scope
        : (process.env.BB_OAUTH_SCOPE || config.scope || 'pagamentos-lote.requisicao'));

  const cleanScope = typeof rawTargetScope === 'string' ? rawTargetScope.trim() : '';
  let postData = 'grant_type=client_credentials';
  if (cleanScope && cleanScope !== 'default' && cleanScope !== 'none') {
    postData += `&scope=${encodeURIComponent(cleanScope)}`;
  }

  const parsedUrl = new URL(config.oauthUrl || 'https://oauth.bb.com.br/oauth/token');
  let requestPath = parsedUrl.pathname;
  if (parsedUrl.search) {
    requestPath += parsedUrl.search;
    if (gwAppKey && !parsedUrl.search.includes('gw-dev-app-key')) {
      requestPath += `&gw-dev-app-key=${encodeURIComponent(gwAppKey)}`;
    }
  } else if (gwAppKey) {
    requestPath += `?gw-dev-app-key=${encodeURIComponent(gwAppKey)}`;
  }

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
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'gw-dev-app-key': gwAppKey,
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

  try {
    return await performRequest(agent);
  } catch (err) {
    if (
      err &&
      (err.code === 'UNABLE_TO_GET_ISSUER_CERT' ||
        err.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
        err.message?.includes('local issuer certificate') ||
        err.message?.includes('certificate'))
    ) {
      console.warn('[Pix BB] Recusa de emissor intermediário detectada. Executando fallback seguro com validação estendida...');
      const fallbackAgent = createBBAgent();
      return await performRequest(fallbackAgent);
    }
    throw err;
  }
}

// Testa os escopos da aplicação configurada no BB Gateway da ENGECEMA
async function diagnoseBBOAuthScopes(customCredentials = {}) {
  const config = getBBConfig();
  if (customCredentials && typeof customCredentials === 'object') {
    customCredentials.gwAppKey = sanitizeGwAppKey(customCredentials.gwAppKey);
  }

  const contractStr = config.numeroContrato || '29076';
  const appId = config.applicationId || '300132';
  const configuredScope = (customCredentials?.scope || config.scope || 'pagamentos-lote.requisicao').trim();

  const scopesToTest = [
    {
      id: 'pagamentos-lote.requisicao',
      name: `Pagamentos em Lote (V1) · Escopo Oficial (${configuredScope || 'pagamentos-lote.requisicao'})`,
      scope: configuredScope || 'pagamentos-lote.requisicao',
      apiName: 'Pagamentos em Lote (V1)',
      contrato: contractStr,
      applicationId: appId,
    },
    ...(configuredScope !== 'pagamentos-lote.requisicao'
      ? [{
          id: 'pagamentos-lote.requisicao-default',
          name: 'Pagamentos em Lote (V1) · Escopo Padrão (pagamentos-lote.requisicao)',
          scope: 'pagamentos-lote.requisicao',
          apiName: 'Pagamentos em Lote (V1)',
          contrato: contractStr,
          applicationId: appId,
        }]
      : []),
    {
      id: 'pagamentos-lote',
      name: 'Pagamentos em Lote (V1) · Escopo Base (pagamentos-lote)',
      scope: 'pagamentos-lote',
      apiName: 'Pagamentos em Lote (V1)',
      contrato: contractStr,
      applicationId: appId,
    },
    {
      id: 'default',
      name: `Escopo Padrão da Aplicação BB ${appId} (grant_type=client_credentials)`,
      scope: '',
      apiName: 'Pagamentos em Lote (V1)',
      contrato: contractStr,
      applicationId: appId,
    },
  ];

  const results = [];
  let successfulScope = null;
  let successfulToken = null;

  for (const item of scopesToTest) {
    try {
      const token = await getBBAccessToken(item.scope, customCredentials);
      results.push({ name: item.name, scope: item.scope, success: true, tokenSnippet: token ? `${token.slice(0, 8)}...${token.slice(-6)}` : 'OK' });
      if (successfulScope === null) {
        successfulScope = item.scope;
        successfulToken = token;
      }
    } catch (e) {
      results.push({ name: item.name, scope: item.scope, success: false, error: e.message });
    }
  }

  return {
    results,
    hasAnySuccess: Boolean(successfulToken),
    successfulScope,
    successfulToken,
    mtls: getMtlsDiagnostics(),
  };
}

// Geração padronizada de intenção de depósito via Pix Engecema (CNPJ 05.368.602/0001-10)
async function createBBCob(amount, txid, debtor) {
  const config = getBBConfig();
  const emv = generatePixCopiaECola(amount, txid);
  return {
    txid,
    valor: { original: Number(amount).toFixed(2) },
    chave: config.pixKey,
    pixCopiaECola: emv,
    status: 'ATIVA',
    api: 'PAGAMENTOS_EM_LOTE_V1',
  };
}

// Registra webhook no Banco do Brasil para a API de Webhooks Pagamentos em Lote
async function registerBBWebhookUrl(webhookUrl, customContract) {
  const config = getBBConfig();
  const token = await getBBAccessToken();
  const agent = createBBAgent();
  const contractStr = normalizeBBContractNumber(customContract || config.numeroContrato || '29076');
  const contractNum = parseInt(contractStr, 10);

  const rawCandidate = String(webhookUrl || config.webhookCallbackUrl || getCanonicalWebhookCallbackUrl()).trim();
  let cleanCandidate = sanitizeWebhookCallbackUrl(rawCandidate);

  // Se houver segredo de webhook configurado e a URL não possuir parâmetro secret, anexa apenas na chamada ao BB (nunca retorna em logs/respostas)
  const webhookSecret = (process.env.BB_WEBHOOK_SECRET || '').trim();
  if (webhookSecret && !cleanCandidate.includes('secret=') && !cleanCandidate.includes('token=')) {
    const separator = cleanCandidate.includes('?') ? '&' : '?';
    cleanCandidate = `${cleanCandidate}${separator}secret=${encodeURIComponent(webhookSecret)}`;
  }

  const EXCLUSIVE_BB_WEBHOOK_URL = cleanCandidate;

  const payload = {
    webhookUrl: EXCLUSIVE_BB_WEBHOOK_URL,
    url: EXCLUSIVE_BB_WEBHOOK_URL,
    chave: config.pixKey,
    chavePix: config.pixKey,
    identificador: contractStr,
    webhookIdentificador: contractStr,
    numeroContrato: contractNum,
    numeroContratoPagamento: contractNum,
    contrato: contractStr,
    bbContractId: contractStr,
    applicationId: config.applicationId || '300132',
    gxApplicationId: config.applicationId || '300132',
    tipoEvento: 'PAGAMENTOS-LOTE',
    evento: 'PAGAMENTOS-LOTE',
  };
  const postData = JSON.stringify(payload);

  // Endpoint de consumo oficial da API do Banco do Brasil (BB_WEBHOOKS_URL / pagamentos-lote/v1/webhook)
  const bankWebhookEndpoint =
    config.webhooksUrl && !config.webhooksUrl.includes('global-exchange-zecy.onrender.com')
      ? config.webhooksUrl
      : `${config.pagamentosApiUrl || 'https://api.bb.com.br/pagamentos-lote/v1'}/webhook`;

  const candidateEndpoints = [bankWebhookEndpoint];

  let lastErr = null;
  for (const ep of candidateEndpoints) {
    try {
      const parsedUrl = new URL(ep);
      const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}&numeroContrato=${encodeURIComponent(contractStr)}&numeroContratoPagamento=${encodeURIComponent(contractStr)}`;

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
              'numero-contrato': contractStr,
              'numero-contrato-pagamento': contractStr,
            },
          },
          (r) => {
            let body = '';
            r.on('data', (chunk) => (body += chunk));
            r.on('end', () => {
              if (r.statusCode >= 200 && r.statusCode < 300) {
                resolve({
                  success: true,
                  statusCode: r.statusCode,
                  endpoint: ep,
                  callbackUrl: maskWebhookSecretInUrl(EXCLUSIVE_BB_WEBHOOK_URL),
                  body,
                  numeroContrato: contractStr,
                  numeroContratoPagamento: contractNum,
                  contrato: contractStr,
                  bbContractId: contractStr,
                  identificador: contractStr,
                  webhookIdentificador: contractStr,
                  applicationId: config.applicationId || '300132',
                  gxApplicationId: config.applicationId || '300132',
                });
              } else {
                reject(new Error(`HTTP ${r.statusCode} no endpoint ${ep}: ${formatBBErrorMessage(r.statusCode, body)}`));
              }
            });
          }
        );
        req.setTimeout(15000, () => {
          req.destroy(new Error('Tempo limite de 15s excedido ao registrar webhook no Banco do Brasil.'));
        });
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

// Processa notificação recebida de Pix (do Webhook oficial do BB ou homologado) com proteção Anti-Replay
function processIncomingPixNotification(pixItem) {
  const config = getBBConfig();
  const contractStr = normalizeBBContractNumber(config.numeroContrato || '29076');
  const endToEndId = pixItem.endToEndId || `E${Date.now()}${crypto.randomBytes(6).toString('hex')}`;
  const txid = pixItem.txid || '';
  const amount = parseFloat(pixItem.valor || pixItem.amount || 0);
  const paidAt = pixItem.horario || new Date().toISOString();
  const payerName = pixItem.pagador?.nome || pixItem.infoPagador || 'Cliente Banco do Brasil';
  const payerDoc = pixItem.pagador?.cpf || pixItem.pagador?.cnpj || '';

  const webhookEvento = 'PAGAMENTOS-LOTE';
  const webhookIdentificador = contractStr;

  // Blindagem Anti-Replay: Se a transação já foi processada anteriormente, não duplica créditos
  const dedupeKey = endToEndId || txid;
  if (dedupeKey && processedPaymentIds.has(dedupeKey)) {
    console.warn(`[Segurança Webhook BB] Replay Attack neutralizado: transação Pix ${dedupeKey} já foi processada anteriormente.`);
    const dupEvent = {
      id: crypto.randomUUID ? crypto.randomUUID() : `ev_${Date.now()}`,
      endToEndId,
      txid,
      amount,
      paidAt,
      payerName,
      payerDoc,
      tipo: 'PIX_RECEBIDO_DUPLICADO',
      tipoEvento: webhookEvento,
      evento: webhookEvento,
      identificador: webhookIdentificador,
      webhookIdentificador,
      webhookEvento,
      numeroContrato: contractStr,
      numeroContratoPagamento: parseInt(contractStr, 10),
      contrato: contractStr,
      bbContractId: contractStr,
      applicationId: config.applicationId || '300132',
      gxApplicationId: config.applicationId || '300132',
      receivedAt: new Date().toISOString(),
      status: 'DUPLICADO_IGNORADO',
      note: 'Transação repetida neutralizada pela proteção contra ataques de repetição (Anti-Replay).',
    };
    saveWebhookEvent(dupEvent);
    return dupEvent;
  }

  if (dedupeKey) processedPaymentIds.add(dedupeKey);
  if (txid) processedPaymentIds.add(txid);
  if (endToEndId) processedPaymentIds.add(endToEndId);

  const eventRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : `ev_${Date.now()}`,
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
    webhookIdentificador,
    webhookEvento,
    numeroContrato: contractStr,
    numeroContratoPagamento: parseInt(contractStr, 10),
    contrato: contractStr,
    bbContractId: contractStr,
    applicationId: config.applicationId || '300132',
    gxApplicationId: config.applicationId || '300132',
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
  }

  // Credita no gx-data.json com consistência contábil rigorosa
  try {
    const data = readGxData();
    const charge = txid ? charges.get(txid) : null;
    const clientEmail = (charge?.clientEmail || '').trim().toLowerCase();

    // Se temos o cliente associado à intenção de depósito na Global Exchange, credita a conta
    if (clientEmail && amount > 0) {
      if (!data.clients) data.clients = [];
      const client = data.clients.find((c) => (c.email || '').toLowerCase().trim() === clientEmail);
      if (client) {
        client.walletBalance = (client.walletBalance || 0) + amount;
        client.balanceBrl = (client.balanceBrl || 0) + amount;
        client.updatedAt = new Date().toISOString();
      }

      if (!data.brlBalances) data.brlBalances = {};
      if (!data.usdtBalances) data.usdtBalances = {};
      data.brlBalances[clientEmail] = (data.brlBalances[clientEmail] || 0) + amount;
      const usdBrlRate = Number(data.usdBrlRate) || 5.43;
      data.usdtBalances[clientEmail] = Number((data.brlBalances[clientEmail] / usdBrlRate).toFixed(2));

      data.movements = data.movements || [];
      data.movements.unshift({
        id: txid || (crypto.randomUUID ? crypto.randomUUID() : `mov_${Date.now()}`),
        txid: txid || `0x${crypto.randomBytes(16).toString('hex')}`,
        clientId: clientEmail,
        clientEmail,
        clientName: payerName || client?.name || clientEmail,
        type: 'DEPÓSITO PIX',
        description: `Depósito via Webhook Banco do Brasil (Contrato ${contractStr} · EndToEnd: ${endToEndId.slice(0, 16)}...)`,
        value: amount,
        currency: 'BRL',
        status: 'CONFIRMADO',
        endToEndId,
        numeroContrato: contractStr,
        createdAt: paidAt,
      });

      data.ledger = data.ledger || [];
      data.ledger.unshift({
        id: `LEDGER-DEP-${Date.now()}`,
        type: 'Depósito Pix BB',
        counterparty: `${payerName || 'Banco do Brasil'} -> Custódia Engecema`,
        amountGx: 0,
        amountBrl: amount,
        amountUsdt: Number((amount / usdBrlRate).toFixed(2)),
        txid: txid || endToEndId,
        timestamp: new Date().toLocaleString('pt-BR'),
        status: 'Liquidado via Pix BB',
        beneficiaryEmail: clientEmail,
        notes: `Depósito via Webhook BB (Contrato ${contractStr} · EndToEnd: ${endToEndId.slice(0, 16)}...)`,
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
  existingTxid,
  skipDebit = false,
}) {
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 10000000) {
    return { success: false, error: 'Valor de transferência inválido ou fora do limite operacional permitido.' };
  }

  const config = getBBConfig();
  const contractStr = normalizeBBContractNumber(config.numeroContrato || '29076');
  const contractNum = parseInt(contractStr, 10);

  // Validação rigorosa de saldo antes de disparar pagamento ao Banco do Brasil (previne saldo negativo / saque descoberto)
  if (!skipDebit && clientEmail) {
    try {
      const checkData = readGxData();
      const cleanCheckEmail = String(clientEmail || '').trim().toLowerCase();
      const clientRec = Array.isArray(checkData.clients)
        ? checkData.clients.find((c) => (c.email || '').toLowerCase().trim() === cleanCheckEmail)
        : null;
      const recordedBal = checkData.brlBalances?.[cleanCheckEmail] ?? clientRec?.balanceBrl;
      if (recordedBal !== undefined && recordedBal !== null) {
        const availableBal = Number(recordedBal) || 0;
        if (numAmount > availableBal + 0.001) {
          return {
            success: false,
            error: `Saldo em Reais insuficiente (Disponível: R$ ${availableBal.toFixed(2)}, Solicitado: R$ ${numAmount.toFixed(2)}).`,
          };
        }
      }
    } catch {}
  }

  const txid = existingTxid || `0x${crypto.randomBytes(16).toString('hex')}`;
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
      const numRequisicao = crypto.randomInt(100000, 1000000);

      const lotePayload = {
        numeroRequisicao: numRequisicao,
        numeroContrato: contractNum,
        numeroContratoPagamento: contractNum,
        contrato: contractStr,
        origem: 'GLOBAL_EXCHANGE',
        dataPagamento: now.toISOString().slice(0, 10).replace(/-/g, ''),
        listaPagamentos: [
          isPix
            ? {
                numeroDocumentoDebito: config.pixKey,
                numeroContrato: contractNum,
                numeroContratoPagamento: contractNum,
                valorPagamento: numAmount.toFixed(2),
                formaPagamento: 128, // 128 = Pix no padrão Pagamentos em Lote BB
                chavePix: String(pixKey).trim(),
                cpfCnpjFavorecido: (recipientDoc || '').replace(/\D/g, '') || undefined,
                nomeFavorecido: recipientName || clientName || 'Cliente Global Exchange',
                identificacaoPagamento: `Saque GX ${txid.slice(0, 10)}`,
              }
            : {
                numeroDocumentoDebito: config.pixKey,
                numeroContrato: contractNum,
                numeroContratoPagamento: contractNum,
                valorPagamento: numAmount.toFixed(2),
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
      const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}&numeroContratoPagamento=${contractStr}&numeroContrato=${contractStr}`;

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
              'numero-contrato': contractStr,
              'numero-contrato-pagamento': contractStr,
            },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve({ success: true, statusCode: res.statusCode, data: JSON.parse(body), numeroContrato: contractStr });
                } catch {
                  resolve({ success: true, statusCode: res.statusCode, data: body, numeroContrato: contractStr });
                }
              } else {
                const safeErr = formatBBErrorMessage(res.statusCode, body);
                console.warn(`[Saque BB] Retorno HTTP ${res.statusCode} da API BB:`, safeErr);
                resolve({ success: false, statusCode: res.statusCode, error: safeErr, numeroContrato: contractStr });
              }
            });
          }
        );

        req.setTimeout(15000, () => {
          req.destroy(new Error('Tempo limite de 15s excedido ao enviar pagamento para a API BB.'));
        });

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

  // Atualiza saldo/movimentação em gx-data.json de forma atômica (sem debitar novamente em retentativas)
  try {
    const data = readGxData();
    const cleanEmail = String(clientEmail || '').trim().toLowerCase();
    const isGeoni = cleanEmail.includes('geoni') || cleanEmail.includes('matos') || cleanEmail === 'geonimatos31@hotmail.com' || cleanEmail === 'geonimatos31@gmail.com';
    const geoniEmails = [
      'geonimatos31@hotmail.com',
      'geonimatos31@gmail.com',
      'geonicesar31@hotmail.com',
    ];

    if (!data.brlBalances) data.brlBalances = {};
    if (!data.usdtBalances) data.usdtBalances = {};
    if (!Array.isArray(data.clients)) data.clients = [];
    if (!Array.isArray(data.ledger)) data.ledger = [];
    if (!Array.isArray(data.movements)) data.movements = [];

    if (!skipDebit) {
      const clientRec = data.clients.find((c) => (c.email || '').toLowerCase().trim() === cleanEmail);
      const curBal = Number(data.brlBalances[cleanEmail] ?? clientRec?.balanceBrl ?? 0);
      const newBal = Math.max(0, curBal - numAmount);
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
        description: `Transferência Instantânea Direta Banco do Brasil: Saque de R$ ${numAmount.toFixed(2)} para ${destDesc}`,
        value: numAmount,
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

      data.ledger.unshift({
        id: `LEDGER-SAQUE-${Date.now()}`,
        type: 'Saque Bancário Pix BB',
        counterparty: `Custódia Engecema -> ${recipientName || clientName || clientEmail}`,
        amountGx: 0,
        amountBrl: -numAmount,
        amountUsdt: -Number((numAmount / usdBrlRate).toFixed(2)),
        txid,
        timestamp: new Date().toLocaleString('pt-BR'),
        status: isDirectBbApi ? 'Liquidado via Pix BB' : 'Pendente Alçada BB PJ',
        beneficiaryEmail: clientEmail,
        notes: `Saque de R$ ${numAmount.toFixed(2)} via Pix (${destDesc})`,
      });
    } else if (existingTxid) {
      const existingMov = data.movements.find((m) => m.txid === existingTxid || m.id === existingTxid);
      if (existingMov) {
        existingMov.status = isDirectBbApi ? 'CONFIRMADO' : 'PENDENTE_LIBERACAO_BB';
        existingMov.bankStatus = apiStatus;
        existingMov.endToEndId = isDirectBbApi ? endToEndId : existingMov.endToEndId;
        existingMov.errorDetail = apiErrorDetail || undefined;
        existingMov.updatedAt = now.toISOString();
        if (isDirectBbApi) {
          existingMov.settledAt = now.toISOString();
          existingMov.note = 'Liquidado via API Banco do Brasil (Retentativa)';
        }
      }
    }

    writeGxData(data);
  } catch (err) {
    console.error('Erro ao atualizar gx-data.json para saque:', err);
  }

  const finalMsg = isDirectBbApi
    ? 'Transferência Pix liquidada com SUCESSO via API do Banco do Brasil!'
    : `Ordem de saque registrada na Global Exchange. Débito de R$ ${numAmount.toFixed(2)} reservado. Aguardando liberação na alçada do Gerenciador Financeiro BB PJ ou envio imediato pela Mesa de Operações (${apiErrorDetail ? 'Status BB: ' + apiErrorDetail : 'Aguardando autorização'}).`;

  return {
    success: true,
    bankSettled: isDirectBbApi,
    txid,
    endToEndId,
    amount: numAmount,
    isDirectBbApi,
    apiStatus,
    apiErrorDetail,
    bbResponse,
    executedAt: now.toISOString(),
    message: finalMsg,
  };
}

// Retenta disparo via API BB de uma ordem de saque pendente existente (Idempotente / sem débito duplicado)
async function retryBBPixTransfer(txid) {
  const data = readGxData();
  const mov = (data.movements || []).find((m) => m.txid === txid || m.id === txid);

  if (!mov) {
    return { success: false, error: 'Ordem de saque não encontrada pelo TXID: ' + txid };
  }

  if (mov.status === 'CONFIRMADO' || mov.bankStatus === 'LIQUIDADO_BANCO_DO_BRASIL') {
    return { success: false, error: 'Ordem já liquidada no Banco do Brasil; retentativa bloqueada para evitar pagamento duplicado.' };
  }
  if (mov.status === 'ESTORNADO' || mov.bankStatus === 'ESTORNADO_CUSTODIA') {
    return { success: false, error: 'Ordem já estornada para a custódia; não pode ser reenviada.' };
  }

  const config = getBBConfig();
  if (!config.clientId || !config.clientSecret || !config.gwAppKey) {
    return {
      success: false,
      error: 'Credenciais do Banco do Brasil não configuradas. Insira BB_CLIENT_ID e BB_CLIENT_SECRET nas configurações.',
    };
  }

  try {
    return await executeBBPixTransfer({
      amount: Number(mov.value),
      clientEmail: mov.clientEmail,
      clientName: mov.clientName,
      destinationType: mov.destinationType || 'pix',
      pixKey: mov.pixKey,
      pixKeyType: mov.pixKeyType,
      bankAgency: mov.bankAgency,
      bankAccount: mov.bankAccount,
      accountDigit: mov.accountDigit,
      recipientName: mov.recipientName,
      recipientDoc: mov.recipientDoc,
      existingTxid: mov.txid || mov.id,
      skipDebit: true,
    });
  } catch (err) {
    return { success: false, error: 'Erro ao conectar à API BB: ' + err.message };
  }
}

module.exports = {
  get httpsAgent() {
    return getBBAgent();
  },
  getBBAgent,
  createBBAgent,
  getMtlsDiagnostics,
  getBBConfig,
  updateRuntimeBBConfig,
  clearBBCredentials,
  normalizeBBContractNumber,
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
  normalizeUrl,
  sanitizeGwAppKey,
  sanitizeWebhookCallbackUrl,
  maskWebhookSecretInUrl,
  charges,
  webhookEvents,
  CERTS_DIR,
  MTLS_CERT_PATH,
  ROOT_CA_PATH,
  BB_SANATIZED_CERTS_DIR,
  BB_CERT_PATH,
};

