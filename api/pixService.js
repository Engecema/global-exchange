const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Caminhos dos certificados mTLS oficiais do Banco do Brasil
const CERTS_DIR = path.join(__dirname, '..', 'apps', 'api-gateway', 'certs');
const MTLS_CERT_PATH = path.join(CERTS_DIR, 'star_mtls_api_bb_com_br.crt');
const ROOT_CA_PATH = path.join(CERTS_DIR, '1 - DigiCert Global Root G2.cer');

// Variáveis de ambiente BB em modo 100% PRODUÇÃO (sem simulação ou sandbox)
let runtimeConfig = null;

function normalizeUrl(url, defaultPrefix = 'https://') {
  if (!url) return '';
  let u = String(url).trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = `${defaultPrefix}${u}`;
  }
  return u.replace(/\/+$/, '');
}

function getBBConfig() {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  // Lê credenciais suportando múltiplas variações de nomenclatura cadastradas no Render
  let clientId = (
    process.env.BB_CLIENT_ID ||
    process.env.BB_CLIENTE_ID ||
    process.env.CLIENT_ID ||
    process.env.CLIENTE_ID ||
    process.env.BB_CLIENT ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  let clientSecret = (
    process.env.BB_CLIENT_SECRET ||
    process.env.BB_CLIENTE_SECRET ||
    process.env.CLIENT_SECRET ||
    process.env.CLIENTE_SECRET ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  let gwAppKey = (
    process.env.BB_GW_APP_KEY ||
    process.env.GW_APP_KEY ||
    process.env.API_KEY ||
    process.env.BB_API_KEY ||
    process.env.DEVELOPER_API_KEY ||
    process.env.APP_KEY ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  let pixKey = (
    process.env.BB_PIX_KEY ||
    process.env.CHAVE_PIX ||
    '05368602000110'
  ).trim().replace(/\D/g, '') || '05368602000110';

  // Normalização automática: credenciais JWT do Banco do Brasil são strings Base64 que iniciam com "eyJ" ({"id":...)
  if (clientId.startsWith('EyJ')) clientId = 'e' + clientId.slice(1);
  if (clientSecret.startsWith('EyJ')) clientSecret = 'e' + clientSecret.slice(1);

  // Endpoints oficiais de produção Banco do Brasil (Pagamentos em Lote V1 e Webhooks)
  let apiUrl = normalizeUrl(process.env.BB_API_URL || 'https://api.bb.com.br');
  let ipUrl = normalizeUrl(process.env.BB_IP_API_URL || process.env.BB_PIX_API_URL || 'https://api.ip.bb.com.br');
  let pagamentosApiUrl = normalizeUrl(process.env.BB_PAGAMENTOS_API_URL || `${ipUrl}/pagamentos-lote/v1`);
  let oauthUrl = (process.env.BB_OAUTH_URL || 'https://oauth.bb.com.br/oauth/token').trim();
  if (!oauthUrl.startsWith('http')) {
    oauthUrl = `https://${oauthUrl}`;
  }
  let webhooksUrl = normalizeUrl(process.env.BB_WEBHOOKS_URL || 'https://api.webhooks.com.br');

  return {
    clientId,
    clientSecret,
    gwAppKey,
    pixKey,
    env: 'production',
    applicationType: 'PAGAMENTOS_EM_LOTE_V1',
    scope: process.env.BB_OAUTH_SCOPE || 'pagamentos-lote.requisicao',
    apiUrl,
    ipUrl,
    pagamentosApiUrl,
    oauthUrl,
    webhooksUrl,
  };
}

function updateRuntimeBBConfig(newCfg) {
  const current = getBBConfig();
  let clientId = (newCfg.clientId !== undefined ? newCfg.clientId : current.clientId).trim().replace(/^["']|["']$/g, '');
  let clientSecret = (newCfg.clientSecret !== undefined ? newCfg.clientSecret : current.clientSecret).trim().replace(/^["']|["']$/g, '');
  let gwAppKey = (newCfg.gwAppKey !== undefined ? newCfg.gwAppKey : current.gwAppKey).trim().replace(/^["']|["']$/g, '');
  let pixKey = (newCfg.pixKey !== undefined ? newCfg.pixKey : current.pixKey).trim().replace(/\D/g, '') || '05368602000110';

  let apiUrl = normalizeUrl(newCfg.apiUrl !== undefined ? newCfg.apiUrl : current.apiUrl || 'https://api.bb.com.br');
  let ipUrl = normalizeUrl(newCfg.ipUrl !== undefined ? newCfg.ipUrl : current.ipUrl || 'https://api.ip.bb.com.br');
  let pagamentosApiUrl = normalizeUrl(newCfg.pagamentosApiUrl !== undefined ? newCfg.pagamentosApiUrl : current.pagamentosApiUrl || `${ipUrl}/pagamentos-lote/v1`);
  let oauthUrl = normalizeUrl(newCfg.oauthUrl !== undefined ? newCfg.oauthUrl : current.oauthUrl || 'https://oauth.bb.com.br/oauth/token');
  let webhooksUrl = normalizeUrl(newCfg.webhooksUrl !== undefined ? newCfg.webhooksUrl : current.webhooksUrl || 'https://api.webhooks.com.br');

  if (clientId.startsWith('EyJ')) clientId = 'e' + clientId.slice(1);
  if (clientSecret.startsWith('EyJ')) clientSecret = 'e' + clientSecret.slice(1);

  runtimeConfig = {
    clientId,
    clientSecret,
    gwAppKey,
    pixKey,
    env: 'production',
    applicationType: 'PAGAMENTOS_EM_LOTE_V1',
    scope: current.scope,
    apiUrl,
    ipUrl,
    pagamentosApiUrl,
    oauthUrl,
    webhooksUrl,
  };

  // Persiste no arquivo .env se possível
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const lines = [
      `BB_CLIENT_ID=${clientId}`,
      `BB_CLIENT_SECRET=${clientSecret}`,
      `BB_GW_APP_KEY=${gwAppKey}`,
      `BB_PIX_KEY=${pixKey}`,
      `BB_ENV=production`,
      `BB_API_URL=${apiUrl}`,
      `BB_IP_API_URL=${ipUrl}`,
      `BB_PAGAMENTOS_API_URL=${pagamentosApiUrl}`,
      `BB_OAUTH_URL=${oauthUrl}`,
      `BB_WEBHOOKS_URL=${webhooksUrl}`,
      `BB_OAUTH_SCOPE=pagamentos-lote.requisicao`,
    ];
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  } catch (e) {
    console.warn('[Pix BB] Não foi possível persistir no .env:', e.message);
  }

  return runtimeConfig;
}

// Cria agente HTTPS com os certificados e CA do Banco do Brasil
function createBBAgent() {
  try {
    const certCandidates = [
      ROOT_CA_PATH,
      path.join(CERTS_DIR, 'A partir de 26.10', '1 - DigiCert Global Root G2.crt'),
      path.join(CERTS_DIR, 'A partir de 26.10', '2 - GeoTrust EV RSA CA G2.crt'),
      path.join(CERTS_DIR, 'A partir de 26.10', 'api.bb.com.br.crt'),
      path.join(CERTS_DIR, '2 - GeoTrust TLS RSA CA G1.crt'),
      MTLS_CERT_PATH,
      // Suporte a Secret Files montados no Render (/etc/secrets)
      '/etc/secrets/star_mtls_api_bb_com_br.crt',
      '/etc/secrets/api.bb.com.br.crt',
      '/etc/secrets/client.crt',
      '/etc/secrets/client.key',
    ];
    const loadedCas = [];
    for (const f of certCandidates) {
      if (fs.existsSync(f)) {
        try {
          loadedCas.push(fs.readFileSync(f));
        } catch {}
      }
    }

    // Suporte a certificado e chave privada passados diretamente via Variáveis no Render
    let envCert = process.env.BB_MTLS_CERT || process.env.BB_CLIENT_CERT || null;
    let envKey = process.env.BB_MTLS_KEY || process.env.BB_CLIENT_KEY || null;

    if (envCert && !envCert.includes('-----BEGIN')) {
      try { envCert = Buffer.from(envCert, 'base64').toString('utf8'); } catch {}
    }
    if (envKey && !envKey.includes('-----BEGIN')) {
      try { envKey = Buffer.from(envKey, 'base64').toString('utf8'); } catch {}
    }

    let clientCert = envCert || (fs.existsSync(MTLS_CERT_PATH) ? fs.readFileSync(MTLS_CERT_PATH) : undefined);
    let clientKey = envKey || undefined;

    return new https.Agent({
      ca: loadedCas.length > 0 ? loadedCas : undefined,
      cert: clientCert,
      key: clientKey,
      rejectUnauthorized: false,
    });
  } catch (err) {
    console.warn('[Pix BB] Não foi possível carregar os certificados mTLS:', err.message);
    return new https.Agent({ rejectUnauthorized: false });
  }
}

// Memória local de cobranças e eventos de webhook
const charges = new Map(); // txid -> charge object
const webhookEvents = []; // lista de eventos recebidos do BB

function clearWebhookEvents() {
  webhookEvents.length = 0;
  charges.clear();
  return true;
}

// Carrega dados salvos em gx-data.json
const DATA_FILE = path.join(__dirname, '..', 'data', 'gx-data.json');

function readGxData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Erro ao ler gx-data.json:', e);
  }
  return { clients: [], movements: [], financialTransactions: [], launchPrice: '1.50' };
}

function writeGxData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar gx-data.json:', e);
  }
}

// Obtém token de acesso OAuth 2.0 do Banco do Brasil para Pagamentos em Lote (V1)
async function getBBAccessToken(customScope) {
  const config = getBBConfig();
  if (!config.clientId || !config.clientSecret || !config.gwAppKey) {
    throw new Error('Credenciais BB_CLIENT_ID, BB_CLIENT_SECRET ou BB_GW_APP_KEY não configuradas.');
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const agent = createBBAgent();

  // Escopo oficial da aplicação Pagamentos em Lote (V1): pagamentos-lote.requisicao
  const primaryScope = customScope || process.env.BB_OAUTH_SCOPE || 'pagamentos-lote.requisicao';

  const executeTokenReq = (scopeToUse) => {
    return new Promise((resolve, reject) => {
      const postData = scopeToUse
        ? `grant_type=client_credentials&scope=${encodeURIComponent(scopeToUse)}`
        : 'grant_type=client_credentials';
      const parsedUrl = new URL(config.oauthUrl);
      const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}`;

      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          port: 443,
          path: requestPath,
          method: 'POST',
          agent,
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
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
                const data = JSON.parse(body);
                resolve(data.access_token);
              } catch (err) {
                reject(new Error('Resposta inválida do OAuth BB: ' + body));
              }
            } else {
              reject(new Error(`OAuth BB retornou HTTP ${res.statusCode}: ${body}`));
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.write(postData);
      req.end();
    });
  };

  try {
    return await executeTokenReq(primaryScope);
  } catch (err) {
    // Se o escopo composto falhar, tenta sem escopo explícito (usa as permissões concedidas pelo BB à aplicação)
    try {
      return await executeTokenReq(null);
    } catch {
      throw err;
    }
  }
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

// Registra webhook no Banco do Brasil para a chave Pix
async function registerBBWebhookUrl(webhookUrl) {
  const config = getBBConfig();
  const token = await getBBAccessToken();
  const agent = createBBAgent();

  const postData = JSON.stringify({ webhookUrl });
  const parsedUrl = new URL(`${config.pixApiUrl}/webhook/${config.pixKey}`);
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
            resolve({ success: true, statusCode: res.statusCode, body });
          } else {
            reject(new Error(`Registro de Webhook retornou HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

// Processa notificação recebida de Pix (do Webhook oficial do BB ou simulado)
function processIncomingPixNotification(pixItem) {
  const endToEndId = pixItem.endToEndId || `E${Date.now()}${crypto.randomBytes(6).toString('hex')}`;
  const txid = pixItem.txid || '';
  const amount = parseFloat(pixItem.valor);
  const paidAt = pixItem.horario || new Date().toISOString();
  const payerName = pixItem.pagador?.nome || pixItem.infoPagador || 'Cliente Banco do Brasil';
  const payerDoc = pixItem.pagador?.cpf || pixItem.pagador?.cnpj || '';

  const eventRecord = {
    id: crypto.randomUUID(),
    endToEndId,
    txid,
    amount,
    paidAt,
    payerName,
    payerDoc,
    receivedAt: new Date().toISOString(),
    status: 'LIQUIDADO_BANCO_DO_BRASIL',
  };

  webhookEvents.unshift(eventRecord);
  if (webhookEvents.length > 100) webhookEvents.pop();

  // Atualiza cobrança em memória se existir
  if (txid && charges.has(txid)) {
    const c = charges.get(txid);
    c.status = 'CONCLUIDA';
    c.paidAt = paidAt;
    c.endToEndId = endToEndId;
    c.paidAmount = amount;
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
        description: `Depósito via Webhook Banco do Brasil (EndToEnd: ${endToEndId.slice(0, 16)}...)`,
        value: amount,
        currency: 'BRL',
        status: 'CONFIRMADO',
        endToEndId,
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
        origem: 'GLOBAL_EXCHANGE',
        dataPagamento: now.toISOString().slice(0, 10).replace(/-/g, ''),
        listaPagamentos: [
          isPix
            ? {
                numeroDocumentoDebito: config.pixKey,
                valorPagamento: Number(amount).toFixed(2),
                formaPagamento: 128, // 128 = Pix no padrão Pagamentos em Lote BB
                chavePix: pixKey.trim(),
                cpfCnpjFavorecido: (recipientDoc || '').replace(/\D/g, '') || undefined,
                nomeFavorecido: recipientName || clientName || 'Cliente Global Exchange',
                identificacaoPagamento: `Saque GX ${txid.slice(0, 10)}`,
              }
            : {
                numeroDocumentoDebito: config.pixKey,
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
      const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}`;

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
            },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve({ success: true, statusCode: res.statusCode, data: JSON.parse(body) });
                } catch {
                  resolve({ success: true, statusCode: res.statusCode, data: body });
                }
              } else {
                console.warn(`[Saque BB] Retorno HTTP ${res.statusCode} da API BB:`, body);
                resolve({ success: false, statusCode: res.statusCode, error: body });
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
  getBBConfig,
  updateRuntimeBBConfig,
  getBBAccessToken,
  createBBCob,
  registerBBWebhookUrl,
  processIncomingPixNotification,
  clearWebhookEvents,
  executeBBPixTransfer,
  retryBBPixTransfer,
  charges,
  webhookEvents,
  CERTS_DIR,
  MTLS_CERT_PATH,
  ROOT_CA_PATH,
};
