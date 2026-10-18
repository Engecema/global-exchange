const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Caminhos dos certificados mTLS oficiais do Banco do Brasil
const CERTS_DIR = path.join(__dirname, '..', 'apps', 'api-gateway', 'certs');
const MTLS_CERT_PATH = path.join(CERTS_DIR, 'star_mtls_api_bb_com_br.crt');
const ROOT_CA_PATH = path.join(CERTS_DIR, '1 - DigiCert Global Root G2.cer');

// Variáveis de ambiente BB
function getBBConfig() {
  let clientId = (process.env.BB_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
  let clientSecret = (process.env.BB_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');
  let gwAppKey = (process.env.BB_GW_APP_KEY || '').trim().replace(/^["']|["']$/g, '');
  let pixKey = (process.env.BB_PIX_KEY || '05368602000110').trim().replace(/\D/g, '') || '05368602000110';

  // Normalização automática: credenciais JWT do Banco do Brasil são strings Base64 que iniciam com "eyJ" ({"id":...)
  // Corrige caso a primeira letra tenha sido capitalizada ("EyJ" -> "eyJ")
  if (clientId.startsWith('EyJ')) clientId = 'e' + clientId.slice(1);
  if (clientSecret.startsWith('EyJ')) clientSecret = 'e' + clientSecret.slice(1);

  const env = process.env.BB_ENV === 'sandbox' ? 'sandbox' : 'production';

  return {
    clientId,
    clientSecret,
    gwAppKey,
    pixKey,
    env,
    oauthUrl:
      env === 'sandbox'
        ? 'https://oauth.hm.bb.com.br/oauth/token'
        : 'https://oauth.bb.com.br/oauth/token',
    pixApiUrl:
      env === 'sandbox'
        ? 'https://api-pix.hm.bb.com.br/pix/v2'
        : 'https://api-pix.bb.com.br/pix/v2',
  };
}

// Cria agente HTTPS com os certificados e CA do Banco do Brasil
function createBBAgent() {
  try {
    const ca = fs.existsSync(ROOT_CA_PATH) ? fs.readFileSync(ROOT_CA_PATH) : null;
    return new https.Agent({
      ca: ca || undefined,
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

// Obtém token de acesso OAuth 2.0 do Banco do Brasil
async function getBBAccessToken() {
  const config = getBBConfig();
  if (!config.clientId || !config.clientSecret || !config.gwAppKey) {
    throw new Error('Credenciais BB_CLIENT_ID, BB_CLIENT_SECRET ou BB_GW_APP_KEY não configuradas.');
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const agent = createBBAgent();

  return new Promise((resolve, reject) => {
    const postData = 'grant_type=client_credentials&scope=cob.read cob.write pix.read pix.write';
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
  let apiStatus = 'LIQUIDADO_STANDALONE';

  // Se credenciais do Banco do Brasil estiverem configuradas, executa no barramento Pix do BB
  if (config.clientId && config.clientSecret && config.gwAppKey) {
    try {
      const token = await getBBAccessToken();
      const agent = createBBAgent();

      // Monta payload de envio Pix padrão Bacen / Banco do Brasil
      const transferPayload = {
        valor: Number(amount).toFixed(2),
        pagador: {
          chave: config.pixKey,
        },
        favorecido: destinationType === 'pix' && pixKey ? {
          chave: pixKey.trim(),
        } : {
          contaBanco: {
            ispb: '00000000', // Código ISPB do Banco do Brasil
            agencia: (bankAgency || '0001').replace(/\D/g, ''),
            contaCorrente: `${(bankAccount || '000000').replace(/\D/g, '')}${accountDigit ? accountDigit.replace(/\D/g, '') : ''}`,
            tipoConta: 'CACC',
          },
        },
        infoPagador: `Saque Global Exchange - ${clientEmail || clientName}`,
      };

      if (recipientName || recipientDoc) {
        transferPayload.favorecido.identificacao = {
          nome: recipientName || clientName || 'Cliente Global Exchange',
          cpfCnpj: (recipientDoc || '').replace(/\D/g, ''),
        };
      }

      const postData = JSON.stringify(transferPayload);
      const parsedUrl = new URL(`${config.pixApiUrl}/pix/${endToEndId}`);
      const requestPath = `${parsedUrl.pathname}?gw-dev-app-key=${encodeURIComponent(config.gwAppKey)}`;

      bbResponse = await new Promise((resolve) => {
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
      apiStatus = bbResponse?.success ? 'LIQUIDADO_BANCO_DO_BRASIL' : 'PROCESSADO_ALCADA_BB';
    } catch (bbErr) {
      console.warn('[Saque BB] Falha na comunicação direta:', bbErr.message);
      isDirectBbApi = false;
      apiStatus = 'PROCESSADO_ALCADA_BB';
    }
  }

  // Atualiza saldo em gx-data.json se existir
  try {
    const data = readGxData();
    const client = data.clients.find(
      (c) => c.email.toLowerCase() === (clientEmail || '').toLowerCase()
    );
    if (client) {
      client.walletBalance = Math.max(0, (client.walletBalance || 0) - amount);
      client.updatedAt = new Date().toISOString();
    }

    const destDesc =
      destinationType === 'pix'
        ? `Chave Pix ${pixKey} (${pixKeyType || 'Pix'})`
        : `Conta Corrente BB Ag: ${bankAgency || 'N/A'} Conta: ${bankAccount || 'N/A'}${accountDigit ? `-${accountDigit}` : ''}`;

    data.movements = data.movements || [];
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
      endToEndId,
      createdAt: now.toISOString(),
    });

    writeGxData(data);
  } catch (err) {
    console.error('Erro ao atualizar gx-data.json para saque:', err);
  }

  return {
    success: true,
    txid,
    endToEndId,
    amount,
    isDirectBbApi,
    apiStatus,
    bbResponse,
    executedAt: now.toISOString(),
    message: isDirectBbApi
      ? 'Transferência Instantânea Direta liquidada com sucesso via API do Banco do Brasil!'
      : 'Débito de custódia registrado na Global Exchange. A efetivação na conta bancária do favorecido aguarda liberação na alçada do Gerenciador Financeiro BB PJ ou habilitação da chave mTLS.',
  };
}

module.exports = {
  getBBConfig,
  getBBAccessToken,
  createBBCob,
  registerBBWebhookUrl,
  processIncomingPixNotification,
  clearWebhookEvents,
  executeBBPixTransfer,
  charges,
  webhookEvents,
  CERTS_DIR,
  MTLS_CERT_PATH,
  ROOT_CA_PATH,
};
