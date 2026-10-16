const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const {
  getBBConfig,
  getBBAccessToken,
  createBBCob,
  registerBBWebhookUrl,
  processIncomingPixNotification,
  clearWebhookEvents,
  charges,
  webhookEvents,
  MTLS_CERT_PATH,
  ROOT_CA_PATH,
} = require('./api/pixService');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const DIST_DIR = path.join(__dirname, 'dist');

// Middlewares
app.use(cors());
app.use(express.json());

// Health check para Render
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// =========================================================================
// 1. ENDPOINT OFICIAL DE WEBHOOK DO BANCO DO BRASIL
// =========================================================================
// O Banco do Brasil envia requisições POST para esta rota quando um Pix é pago
app.all(['/api/webhook/pix', '/pix/webhook'], (req, res) => {
  // Para validação inicial de handshake (alguns gateways mandam GET/PUT)
  if (req.method === 'GET' || req.method === 'PUT') {
    return res.status(200).json({ status: 'WEBHOOK_READY', timestamp: new Date().toISOString() });
  }

  try {
    const payload = req.body;
    console.log('[Webhook BB] Notificação recebida do Banco do Brasil:', JSON.stringify(payload, null, 2));

    let processedCount = 0;
    const processedEvents = [];

    // O padrão Bacen v2 envia um array sob o campo "pix"
    if (payload && Array.isArray(payload.pix)) {
      for (const item of payload.pix) {
        const event = processIncomingPixNotification(item);
        processedEvents.push(event);
        processedCount++;
      }
    } else if (payload && (payload.endToEndId || payload.txid || payload.valor)) {
      // Evento único direto
      const event = processIncomingPixNotification(payload);
      processedEvents.push(event);
      processedCount++;
    }

    console.log(`[Webhook BB] ${processedCount} pagamento(s) liquidado(s) com sucesso na custódia!`);
    return res.status(200).json({
      status: 'PROCESSADO_COM_SUCESSO',
      recebidos: processedCount,
      eventos: processedEvents,
    });
  } catch (err) {
    console.error('[Webhook BB] Erro ao processar notificação:', err);
    // Sempre responde 200 para evitar que o BB entre em loop de reenvio
    return res.status(200).json({ status: 'ERRO_INTERNO_PROCESSAMENTO', erro: err.message });
  }
});

// =========================================================================
// 2. CRIAÇÃO DE COBRANÇA PIX COM VÍNCULO AO CLIENTE
// =========================================================================
app.post('/api/pix/create-charge', async (req, res) => {
  try {
    const { amount, clientEmail, clientName, document } = req.body;
    const numAmount = parseFloat(amount);

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'O valor da cobrança deve ser maior que zero.' });
    }

    // Gera TXID alfanumérico limpo (padrão Bacen: até 35 caracteres alfanuméricos)
    const txid = `GX${Date.now()}${crypto.randomBytes(4).toString('hex')}`.slice(0, 32);

    const config = getBBConfig();
    let bbResponse = null;
    let isDirectBbApi = false;

    // Se as credenciais do BB estiverem preenchidas, tenta criar na API oficial
    if (config.clientId && config.clientSecret && config.gwAppKey) {
      try {
        bbResponse = await createBBCob(numAmount, txid, {
          nome: clientName,
          cpf: document,
        });
        isDirectBbApi = true;
      } catch (bbErr) {
        console.warn('[Pix BB] Chamada direta à API BB falhou, usando fallback EMV Bacen:', bbErr.message);
      }
    }

    // Registra a cobrança ativa em memória
    charges.set(txid, {
      txid,
      amount: numAmount,
      clientEmail: (clientEmail || '').toLowerCase(),
      clientName: clientName || '',
      document: document || '',
      status: 'PENDENTE',
      createdAt: new Date().toISOString(),
      isDirectBbApi,
      bbResponse,
    });

    return res.status(201).json({
      success: true,
      txid,
      amount: numAmount,
      clientEmail,
      status: 'PENDENTE',
      isDirectBbApi,
      pixCopiaECola: bbResponse?.pixCopiaECola || null,
      message: isDirectBbApi
        ? 'Cobrança dinâmica registrada na API oficial do Banco do Brasil.'
        : 'Cobrança inicializada. Aguardando pagamento via chave Pix Engecema (CNPJ).',
    });
  } catch (err) {
    console.error('Erro ao criar cobrança:', err);
    return res.status(500).json({ error: err.message || 'Erro ao inicializar cobrança Pix.' });
  }
});

// =========================================================================
// 3. CONSULTA DE STATUS DO PIX EM TEMPO REAL
// =========================================================================
app.get('/api/pix/status/:txid', (req, res) => {
  const { txid } = req.params;
  const charge = charges.get(txid);

  if (!charge) {
    return res.status(404).json({ error: 'Cobrança não encontrada.', txid });
  }

  return res.json({
    txid: charge.txid,
    status: charge.status,
    amount: charge.amount,
    paidAmount: charge.paidAmount || null,
    paidAt: charge.paidAt || null,
    endToEndId: charge.endToEndId || null,
    clientEmail: charge.clientEmail,
  });
});

// =========================================================================
// 4. DIAGNÓSTICO DE CONECTIVIDADE COM O BANCO DO BRASIL
// =========================================================================
app.get('/api/pix/diagnostics', async (_req, res) => {
  const config = getBBConfig();
  const mtlsCertExists = fs.existsSync(MTLS_CERT_PATH);
  const rootCaExists = fs.existsSync(ROOT_CA_PATH);

  const hasCredentials = Boolean(config.clientId && config.clientSecret && config.gwAppKey);

  return res.json({
    status: 'ONLINE',
    environment: config.env,
    pixKey: config.pixKey,
    beneficiary: 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA',
    cnpj: '05.368.602/0001-10',
    credentials: {
      hasClientId: Boolean(config.clientId),
      hasClientSecret: Boolean(config.clientSecret),
      hasGwAppKey: Boolean(config.gwAppKey),
      isConfigured: hasCredentials,
    },
    certificates: {
      mtlsCertFound: mtlsCertExists,
      rootCaFound: rootCaExists,
      certPath: MTLS_CERT_PATH,
    },
    webhook: {
      suggestedUrl: `${_req.protocol}://${_req.get('host')}/api/webhook/pix`,
      totalEventsReceived: webhookEvents.length,
    },
    activeCharges: charges.size,
  });
});

// =========================================================================
// 5. TESTAR CONEXÃO OAUTH COM O BANCO DO BRASIL
// =========================================================================
app.post('/api/pix/test-connection', async (_req, res) => {
  const config = getBBConfig();
  if (!config.clientId || !config.clientSecret || !config.gwAppKey) {
    return res.status(200).json({
      success: false,
      message:
        'Credenciais do Banco do Brasil não configuradas no ambiente. Configure BB_CLIENT_ID, BB_CLIENT_SECRET e BB_GW_APP_KEY nas variáveis de ambiente do Render para conexão em produção.',
    });
  }

  try {
    const token = await getBBAccessToken();
    return res.status(200).json({
      success: true,
      message: 'Conexão mTLS e autenticação OAuth 2.0 com o Banco do Brasil realizada com SUCESSO!',
      tokenSnippet: token ? `${token.slice(0, 10)}...${token.slice(-6)}` : 'OK',
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      message: 'Falha ao autenticar no Banco do Brasil: ' + err.message,
    });
  }
});

// =========================================================================
// 6. REGISTRAR URL DE WEBHOOK NO BANCO DO BRASIL
// =========================================================================
app.post('/api/pix/register-webhook', async (req, res) => {
  try {
    const webhookUrl = req.body.webhookUrl || `${req.protocol}://${req.get('host')}/api/webhook/pix`;
    const result = await registerBBWebhookUrl(webhookUrl);
    return res.status(200).json({
      success: true,
      message: `Webhook registrado com sucesso no Banco do Brasil para a chave ${getBBConfig().pixKey}`,
      details: result,
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      message: 'Erro ao registrar webhook no Banco do Brasil: ' + err.message,
    });
  }
});

// =========================================================================
// 7. SIMULAR NOTIFICAÇÃO DE WEBHOOK (PARA TESTES E HOMOLOGAÇÃO)
// =========================================================================
app.post('/api/pix/simulate-webhook', (req, res) => {
  const { txid, amount, clientEmail, payerName } = req.body;

  const simulated = {
    endToEndId: `E00000000${Date.now()}SIMULADO`,
    txid: txid || `GX${Date.now()}`,
    valor: (amount || 100.0).toFixed(2),
    horario: new Date().toISOString(),
    chave: '05368602000110',
    infoPagador: 'Simulação de Pagamento Pix BB',
    pagador: {
      nome: payerName || 'Pagador Teste BB',
      cpf: '00000000000',
    },
  };

  // Se passou txid e ele não existia no mapa de charges, cria para poder vincular
  if (simulated.txid && !charges.has(simulated.txid)) {
    charges.set(simulated.txid, {
      txid: simulated.txid,
      amount: parseFloat(simulated.valor),
      clientEmail: (clientEmail || '').toLowerCase(),
      status: 'PENDENTE',
      createdAt: new Date().toISOString(),
    });
  }

  const processed = processIncomingPixNotification(simulated);
  return res.json({
    success: true,
    message: 'Notificação Pix simulada e processada com sucesso!',
    event: processed,
  });
});

// =========================================================================
// 8. LISTA DE EVENTOS RECEBIDOS PELO WEBHOOK
// =========================================================================
app.get('/api/pix/webhook-events', (_req, res) => {
  return res.json({ events: webhookEvents.slice(0, 50) });
});

app.post('/api/pix/clear-test-events', (_req, res) => {
  clearWebhookEvents();
  return res.json({ success: true, message: 'Eventos de teste limpos com sucesso! Pronto para transações reais.' });
});

// =========================================================================
// SERVIR FRONTEND ESTÁTICO (SPA FALLBACK)
// =========================================================================
app.use(
  express.static(DIST_DIR, {
    maxAge: '1d',
    index: false,
  })
);

app.get('*', (_req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send(
      'Aplicação compilando ou pasta "dist" não encontrada. Execute "npm run build" antes de "npm start".'
    );
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Global Exchange API & Frontend rodando em http://${HOST}:${PORT}`);
  console.log(`Endpoint Webhook Pix BB: http://${HOST}:${PORT}/api/webhook/pix`);
});
