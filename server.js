const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const {
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
// 3.1. TRANSFERÊNCIA INSTANTÂNEA DIRETA (SAQUE BANCÁRIO / PIX BB)
// =========================================================================
app.post('/api/pix/withdraw', async (req, res) => {
  try {
    const {
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
    } = req.body;

    const numAmount = parseFloat(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Informe um valor de saque válido e maior que zero.' });
    }

    if (!clientEmail) {
      return res.status(400).json({ error: 'E-mail do cliente é obrigatório.' });
    }

    if (destinationType === 'pix' && !pixKey) {
      return res.status(400).json({ error: 'Informe a Chave Pix de destino.' });
    }

    if (destinationType === 'bb_account' && (!bankAgency || !bankAccount)) {
      return res.status(400).json({ error: 'Informe a Agência e Conta Corrente do Banco do Brasil.' });
    }

    const result = await executeBBPixTransfer({
      amount: numAmount,
      clientEmail,
      clientName: clientName || recipientName || clientEmail,
      destinationType: destinationType || 'pix',
      pixKey,
      pixKeyType,
      bankAgency,
      bankAccount,
      accountDigit,
      recipientName: recipientName || clientName,
      recipientDoc,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[Saque BB] Erro na rota /api/pix/withdraw:', err);
    return res.status(500).json({ error: err.message || 'Erro ao processar transferência instantânea.' });
  }
});

// 3.1.1. RETENTAR ENVIO VIA API OFICIAL BANCO DO BRASIL PELA MESA
app.post('/api/pix/retry-withdrawal', async (req, res) => {
  try {
    const { txid } = req.body;
    if (!txid) {
      return res.status(400).json({ error: 'TXID da ordem é obrigatório.' });
    }
    const result = await retryBBPixTransfer(txid);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3.1.2. ATUALIZAR CREDENCIAIS REAIS DO BANCO DO BRASIL
app.post('/api/pix/update-credentials', (req, res) => {
  try {
    const updated = updateRuntimeBBConfig(req.body);
    return res.status(200).json({
      success: true,
      message: 'Credenciais oficiais do Banco do Brasil atualizadas em produção!',
      hasClientId: Boolean(updated.clientId),
      hasClientSecret: Boolean(updated.clientSecret),
      hasGwAppKey: Boolean(updated.gwAppKey),
      pixKey: updated.pixKey,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3.2. CANCELAMENTO / ESTORNO DE SAQUE PENDENTE
app.post('/api/pix/cancel-withdrawal', (req, res) => {
  const { txid, reason } = req.body;
  try {
    const dataFilePath = path.join(__dirname, 'data', 'gx-data.json');
    if (fs.existsSync(dataFilePath)) {
      const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      if (Array.isArray(raw.movements)) {
        const mov = raw.movements.find((m) => m.txid === txid || m.id === txid);
        if (mov) {
          mov.status = 'ESTORNADO';
          mov.bankStatus = 'ESTORNADO_CUSTODIA';
          mov.refundedAt = new Date().toISOString();
          mov.note = reason || 'Estorno processado';
          fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
        }
      }
    }
    return res.json({ success: true, message: 'Saque cancelado e estornado com sucesso!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3.3. CONFIRMAÇÃO DE LIQUIDAÇÃO NO BANCO DO BRASIL
app.post('/api/pix/confirm-withdrawal', (req, res) => {
  const { txid, officialEndToEndId, notes } = req.body;
  try {
    const dataFilePath = path.join(__dirname, 'data', 'gx-data.json');
    if (fs.existsSync(dataFilePath)) {
      const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      if (Array.isArray(raw.movements)) {
        const mov = raw.movements.find((m) => m.txid === txid || m.id === txid);
        if (mov) {
          mov.status = 'CONFIRMADO';
          mov.bankStatus = 'LIQUIDADO_BANCO_DO_BRASIL';
          if (officialEndToEndId) mov.endToEndId = officialEndToEndId;
          mov.settledAt = new Date().toISOString();
          mov.note = notes || 'Liquidado via Banco do Brasil';
          fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
        }
      }
    }
    return res.json({ success: true, message: 'Liquidação bancária confirmada no Banco do Brasil!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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
// 7. LISTA DE EVENTOS RECEBIDOS PELO WEBHOOK OFICIAL DO BANCO DO BRASIL
// =========================================================================
app.get('/api/pix/webhook-events', (_req, res) => {
  return res.json({ events: webhookEvents.slice(0, 50) });
});

app.post('/api/pix/clear-test-events', (_req, res) => {
  clearWebhookEvents();
  return res.json({ success: true, message: 'Eventos de teste limpos com sucesso! Pronto para transações reais.' });
});

// =========================================================================
// 9. ENDPOINTS DE AUTENTICAÇÃO E SUPABASE
// =========================================================================
const SUPABASE_URL = (process.env.GX_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.GX_SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SECRET_KEY = process.env.GX_SUPABASE_SECRET_KEY || process.env.GX_SUPABASE_SERVICE_ROLE_KEY || '';

app.get('/api/auth/status', (_req, res) => {
  return res.json({
    hasSupabase: Boolean(SUPABASE_URL),
    configured: Boolean(SUPABASE_URL && (SUPABASE_PUBLISHABLE_KEY || SUPABASE_SECRET_KEY)),
    url: SUPABASE_URL || null,
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, document, password, role } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  let supabaseSuccess = false;
  let supabaseMessage = '';

  // Se Supabase estiver configurado no ambiente, sincroniza o cadastro
  if (SUPABASE_URL && (SUPABASE_PUBLISHABLE_KEY || SUPABASE_SECRET_KEY)) {
    try {
      const apiKey = SUPABASE_SECRET_KEY || SUPABASE_PUBLISHABLE_KEY;
      // 1. Cadastra no Supabase Auth
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          data: { name: name || '', document: document || '', role: role || 'client' },
        }),
      });

      if (authRes.ok) {
        supabaseSuccess = true;
        supabaseMessage = 'Usuário registrado no Supabase Auth.';
      }

      // 2. Registra na tabela clients do Supabase se secret key disponível
      if (SUPABASE_SECRET_KEY) {
        await fetch(`${SUPABASE_URL}/rest/v1/clients?on_conflict=id`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            id: cleanEmail,
            email: cleanEmail,
            name: name || '',
            document: document || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
      }
    } catch (err) {
      console.warn('[Supabase Sync] Aviso ao sincronizar com Supabase:', err.message);
    }
  }

  return res.status(201).json({
    success: true,
    supabaseSuccess,
    message: supabaseMessage || 'Cadastro realizado com sucesso. Autentique-se com sua senha.',
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  let supabaseAuthenticated = false;
  let tokenData = null;

  if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
    try {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });

      if (authRes.ok) {
        tokenData = await authRes.json();
        supabaseAuthenticated = true;
      }
    } catch (err) {
      console.warn('[Supabase Login] Falha na validação Supabase:', err.message);
    }
  }

  return res.json({
    success: true,
    supabaseAuthenticated,
    token: tokenData?.access_token || null,
  });
});

// Limpeza de histórico para transações reais
app.post('/api/admin/clean-history', (_req, res) => {
  try {
    clearWebhookEvents();
    const dataFilePath = path.join(__dirname, 'data', 'gx-data.json');
    if (fs.existsSync(dataFilePath)) {
      const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      raw.movements = [];
      raw.financialTransactions = [];
      fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
    }
    return res.json({
      success: true,
      message: 'Histórico limpo com sucesso! Ecossistema 100% pronto para transações reais.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// SERVIR FRONTEND ESTÁTICO (SPA FALLBACK ULTRA-RÁPIDO)
// =========================================================================
app.use(
  express.static(DIST_DIR, {
    maxAge: '1h',
    index: 'index.html',
    etag: true,
  })
);

app.get('*', (_req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
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
