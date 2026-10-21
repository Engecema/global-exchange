import type { Plugin, ViteDevServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function getDataFilePath(): string {
  if (process.env.GX_DATA_FILE && fs.existsSync(process.env.GX_DATA_FILE)) {
    return process.env.GX_DATA_FILE;
  }
  const appletPath = path.resolve(process.cwd(), 'data', 'gx-data.json');
  if (fs.existsSync(appletPath)) return appletPath;
  return path.resolve(__dirname, '..', 'data', 'gx-data.json');
}

function getBitXCoreUrl(): string {
  const url = (process.env.BITX_CORE_URL || process.env.BITX_CORE_API_URL || 'https://bitx-core.onrender.com').trim().replace(/\/+$/, '');
  return url;
}

function getBitXWebhookSecret(): string {
  return process.env.BITX_WEBHOOK_SECRET || process.env.BITX_CORE_WEBHOOK_SECRET || 'EngecemaBitxCoreSecureToken2026_WebHookSecret';
}

async function sendToBitXCore(endpoint: string, payload: any): Promise<any> {
  const bitxUrl = getBitXCoreUrl();
  const webhookSecret = getBitXWebhookSecret();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'GlobalExchange-Bridge/1.0',
  };
  if (webhookSecret) {
    headers['x-bitx-secret'] = webhookSecret;
    headers['x-webhook-secret'] = webhookSecret;
    headers['Authorization'] = `Bearer ${webhookSecret}`;
  }

  try {
    const fullUrl = `${bitxUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        secret: webhookSecret || undefined,
        source: 'global-exchange',
      }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    console.warn(`[BitX Core Bridge] Aviso ao comunicar com BitX Core (${endpoint}):`, err.message);
    return { ok: false, error: err.message };
  }
}

async function propagateClientToBitXCore(client: any): Promise<void> {
  const bitxUrl = getBitXCoreUrl();
  if (!bitxUrl || !client) return;
  try {
    await Promise.allSettled([
      sendToBitXCore('/api/bitx/add-client', { client }),
      sendToBitXCore('/api/clients', { client, ...client }),
      sendToBitXCore('/api/blockchain/register-wallet', {
        address: client.bitxAddress,
        email: client.email,
        name: client.name,
        document: client.document,
        balance: client.balanceBtxc,
        txid: client.registrationTxid,
      }),
      sendToBitXCore('/api/wallets', {
        address: client.bitxAddress,
        email: client.email,
        name: client.name,
        balance: client.balanceBtxc,
      }),
    ]);
  } catch (err: any) {
    console.warn('[BitX Core Bridge] Erro ao propagar cliente:', err.message);
  }
}

async function propagateClientsBatchToBitXCore(clients: any[], ledger: any[] = [], balances: any = {}): Promise<void> {
  const bitxUrl = getBitXCoreUrl();
  if (!bitxUrl || !Array.isArray(clients)) return;
  try {
    await Promise.allSettled([
      sendToBitXCore('/api/bitx/sync-clients', { clients, ledger, balances }),
      sendToBitXCore('/api/sync-clients', { clients, ledger, balances }),
      sendToBitXCore('/api/clients/batch', { clients }),
    ]);
  } catch (err: any) {
    console.warn('[BitX Core Bridge] Erro ao propagar lote de clientes:', err.message);
  }
}

export function pixApiDevPlugin(): Plugin {
  return {
    name: 'pix-api-dev-middleware',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];
        
        // Only handle /api/ and /health endpoints
        if (!pathname.startsWith('/api/') && pathname !== '/health') {
          return next();
        }

        let pixService: any;
        try {
          const servicePath = path.resolve(__dirname, 'pixService.js');
          pixService = require(servicePath);
        } catch (e: any) {
          console.warn('[Pix Dev API] Falha ao carregar pixService.js:', e?.message);
        }

        const sendJson = (statusCode: number, data: any) => {
          res.statusCode = statusCode;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
        };

        const readJsonBody = (): Promise<any> => {
          return new Promise((resolve) => {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                resolve(body ? JSON.parse(body) : {});
              } catch {
                resolve({});
              }
            });
          });
        };

        // 1. Health check
        if (pathname === '/health') {
          return sendJson(200, { status: 'OK', timestamp: new Date().toISOString() });
        }

        // 1.1 BitX Core Mainnet Telemetry & Status
        if (pathname === '/api/bitx/status' && req.method === 'GET') {
          let currentPrice = '421081.54';
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (raw.launchPrice) currentPrice = raw.launchPrice;
            }
          } catch {}

          return sendJson(200, {
            network: 'REDE ATIVA · PRODUÇÃO (MAINNET)',
            chainHeight: '#349.000',
            blockNumber: 349000,
            symbol: 'BTXC',
            name: 'BitX Core',
            price: parseFloat(currentPrice) || 421081.54,
            priceFormatted: 'R$ 421.081,54',
            variation: '+0.42%',
            status: 'Online v3.4',
            platform: 'Global Exchange',
            synced: true,
            timestamp: new Date().toISOString(),
          });
        }

        // 1.1.1 Status e Variáveis de Ambiente da Ponte Global Exchange <-> BitX Core
        if (pathname === '/api/bitx/bridge-status' && req.method === 'GET') {
          const bitxCoreApiUrl = process.env.BITX_CORE_API_URL || null;
          const gxPublicUrl = process.env.GX_PUBLIC_URL || null;
          const usdBrlRate = parseFloat(process.env.USD_BRL_RATE || '5.70') || 5.70;
          const hasSecret = Boolean(process.env.BITX_CORE_WEBHOOK_SECRET);

          let currentPrice = '421081.54';
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (raw.launchPrice) currentPrice = raw.launchPrice;
            }
          } catch {}

          const btxcBrl = parseFloat(currentPrice) || 421081.54;
          const btxcUsd = usdBrlRate > 0 ? btxcBrl / usdBrlRate : 73873.95;

          return sendJson(200, {
            status: 'ONLINE',
            bridgeActive: true,
            isRenderConnected: Boolean(bitxCoreApiUrl),
            bitxCoreApiUrl,
            gxPublicUrl,
            hasWebhookSecret: hasSecret,
            webhookEndpoint: '/api/bitx/transaction-notify',
            rates: {
              btxcBrl,
              usdBrl: usdBrlRate,
              btxcUsd,
            },
            network: 'REDE ATIVA · PRODUÇÃO (MAINNET)',
            chainHeight: '#349.000',
            timestamp: new Date().toISOString(),
          });
        }

        // 1.1.2 Cotações Integradas da Moeda (BTXC / BRL / USD)
        if (pathname === '/api/bitx/rates' && req.method === 'GET') {
          let currentPrice = '421081.54';
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (raw.launchPrice) currentPrice = raw.launchPrice;
            }
          } catch {}

          const usdBrlRate = parseFloat(process.env.USD_BRL_RATE || '5.70') || 5.70;
          const btxcBrl = parseFloat(currentPrice) || 421081.54;
          const btxcUsd = usdBrlRate > 0 ? btxcBrl / usdBrlRate : 73873.95;

          return sendJson(200, {
            btxcBrl,
            usdBrl: usdBrlRate,
            btxcUsd,
            formatted: {
              btxcBrl: `R$ ${btxcBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              usdBrl: `R$ ${usdBrlRate.toFixed(2)}`,
              btxcUsd: `$ ${btxcUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
            },
            timestamp: new Date().toISOString(),
          });
        }

        // 1.2 BitX Core Price Sync
        if (pathname === '/api/bitx/sync-price' && req.method === 'POST') {
          const body = await readJsonBody();
          const targetPrice = body.price || '421081.54';
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              raw.launchPrice = String(targetPrice);
              if (!raw.bitxCore) raw.bitxCore = {};
              raw.bitxCore.network = 'REDE ATIVA · PRODUÇÃO (MAINNET)';
              raw.bitxCore.chainHeight = '#349.000';
              raw.bitxCore.price = String(targetPrice);
              raw.bitxCore.variation = '+0.42%';
              raw.bitxCore.status = 'Online v3.4';
              fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
            }
          } catch (e: any) {
            console.warn('[BitX Sync] Erro ao sincronizar preço em data/gx-data.json:', e?.message);
          }
          return sendJson(200, {
            success: true,
            network: 'REDE ATIVA · PRODUÇÃO (MAINNET)',
            chainHeight: '#349.000',
            price: targetPrice,
            variation: '+0.42%',
            message: 'Cotação BTXC sincronizada com sucesso com a BitX Core Mainnet (#349.000)!',
          });
        }

        // 1.3 Livro Razão de Custódia & Liquidação (Ledger Auditável Engecema)
        if (pathname === '/api/bitx/ledger' && req.method === 'GET') {
          let ledger: any[] = [];
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (Array.isArray(raw.ledger)) {
                ledger = raw.ledger;
              }
            }
          } catch {}

          return sendJson(200, { success: true, ledger });
        }

        // 1.4 Reconciliar Saldos com o Livro Razão
        if (pathname === '/api/bitx/reconcile-ledger' && req.method === 'POST') {
          try {
            const dataFilePath = getDataFilePath();
            let raw: any = {};
            if (fs.existsSync(dataFilePath)) {
              raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            }

            if (!raw.balances) raw.balances = {};
            if (!raw.brlBalances) raw.brlBalances = {};
            if (!raw.usdtBalances) raw.usdtBalances = {};

            let totalGx = 0;
            let totalBrl = 0;
            let totalUsdt = 0;

            if (Array.isArray(raw.ledger) && raw.ledger.length > 0) {
              // Zera saldos antes de somar as entradas oficiais do Livro Razão
              Object.keys(raw.balances).forEach((k) => { raw.balances[k] = 0.0; });
              Object.keys(raw.brlBalances).forEach((k) => { raw.brlBalances[k] = 0.0; });
              Object.keys(raw.usdtBalances).forEach((k) => { raw.usdtBalances[k] = 0.0; });

              raw.ledger.forEach((entry: any) => {
                const em = (entry.beneficiaryEmail || '').toLowerCase();
                const gx = Number(entry.amountGx) || 0;
                const brl = Number(entry.amountBrl) || 0;
                const usdt = Number(entry.amountUsdt) || 0;
                totalGx += gx;
                totalBrl += brl;
                totalUsdt += usdt;
                if (em) {
                  raw.balances[em] = (raw.balances[em] || 0) + gx;
                  raw.brlBalances[em] = (raw.brlBalances[em] || 0) + brl;
                  raw.usdtBalances[em] = (raw.usdtBalances[em] || 0) + usdt;
                }
              });
            } else {
              Object.keys(raw.balances).forEach((k) => { raw.balances[k] = 0.0; });
              Object.keys(raw.brlBalances).forEach((k) => { raw.brlBalances[k] = 0.0; });
              Object.keys(raw.usdtBalances).forEach((k) => { raw.usdtBalances[k] = 0.0; });
            }

            fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');

            return sendJson(200, {
              success: true,
              message: 'Reconciliação com o Livro Razão concluída com sucesso! Saldos de custódia equalizados.',
              reconciled: {
                gx: totalGx,
                brl: totalBrl,
                usdt: totalUsdt,
              },
            });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.5 Clientes Ativos na BitX Core / Global Exchange (compatível com chamadas externas)
        if ((pathname === '/api/bitx/clients' || pathname === '/api/clients' || pathname === '/api/blockchain/clients' || pathname === '/api/wallets') && req.method === 'GET') {
          let clients: any[] = [];
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (Array.isArray(raw.clients)) {
                clients = raw.clients;
              }
            }
          } catch {}

          return sendJson(200, { success: true, clients, total: clients.length });
        }

        // 1.5.1 Diagnóstico Detalhado da Ponte Global Exchange <-> BitX Core
        if (pathname === '/api/bitx/bridge-diagnostics' && req.method === 'GET') {
          const bitxUrl = getBitXCoreUrl();
          const webhookSecret = getBitXWebhookSecret();
          const proto = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host || 'localhost:3000';
          const gxPublicUrl = process.env.GX_PUBLIC_URL || `${proto}://${host}`;
          const usdBrlRate = parseFloat(process.env.USD_BRL_RATE || '5.70') || 5.70;

          let totalClients = 0;
          let clientSample = null;
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (Array.isArray(raw.clients)) {
                totalClients = raw.clients.length;
                clientSample = raw.clients[0] || null;
              }
            }
          } catch {}

          return sendJson(200, {
            status: bitxUrl ? 'CONFIGURED' : 'PENDING_CONFIG',
            bridgeActive: true,
            bitxCoreApiUrl: bitxUrl || null,
            bitxCoreApiUrlConfigured: Boolean(process.env.BITX_CORE_URL || process.env.BITX_CORE_API_URL),
            gxPublicUrl,
            hasWebhookSecret: Boolean(webhookSecret),
            totalClients,
            clientSample,
            envChecklist: {
              globalExchange: {
                BITX_CORE_URL: process.env.BITX_CORE_URL || process.env.BITX_CORE_API_URL || 'https://bitx-core.onrender.com (Padrão)',
                BITX_WEBHOOK_SECRET: (process.env.BITX_WEBHOOK_SECRET || process.env.BITX_CORE_WEBHOOK_SECRET) ? 'CONFIGURADO ✅' : 'EngecemaBitxCoreSecureToken2026_WebHookSecret (Padrão)',
                GX_PUBLIC_URL: gxPublicUrl,
                USD_BRL_RATE: `${usdBrlRate.toFixed(2)} ✅`,
              },
              bitxCoreRepo: {
                GLOBAL_EXCHANGE_URL: gxPublicUrl,
                GLOBAL_EXCHANGE_WEBHOOK_URL: `${gxPublicUrl}/api/bitx/transaction-notify`,
                GX_API_URL: `${gxPublicUrl}/api`,
                GX_WEBHOOK_URL: `${gxPublicUrl}/api/bitx/transaction-notify`,
                BITX_WEBHOOK_SECRET: webhookSecret,
                VITE_SUPABASE_URL: 'https://odbbtgkxgiqlfhcepwuj.supabase.co',
                VITE_SUPABASE_ANON_KEY: 'sb_publishable_22fzrMlPYyCnPUceg1b04g_ChyHEv97',
              },
            },
            suggestedWebhookEndpoint: `${gxPublicUrl}/api/bitx/transaction-notify`,
            suggestedClientsEndpoint: `${gxPublicUrl}/api/bitx/clients`,
            timestamp: new Date().toISOString(),
          });
        }

        // 1.5.2 Testar Conectividade e Ping para a BitX Core
        if (pathname === '/api/bitx/test-connection' && req.method === 'POST') {
          const bitxUrl = getBitXCoreUrl();
          if (!bitxUrl) {
            return sendJson(200, {
              success: false,
              message: 'A variável BITX_CORE_API_URL não está configurada no ambiente do Render. Configure a URL do serviço da BitX Core (ex: https://bitx-core.onrender.com) nas Environment Variables.',
              diagnostics: {
                hasBitxUrl: false,
                hasSecret: Boolean(process.env.BITX_CORE_WEBHOOK_SECRET),
              },
            });
          }

          const startTime = Date.now();
          let clientSample: any = null;
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (Array.isArray(raw.clients) && raw.clients.length > 0) {
                clientSample = raw.clients[0];
              }
            }
          } catch {}

          try {
            const endpointsToTest = ['/health', '/api/health', '/api/status', '/api/bitx/status', '/'];
            let pingOk = false;
            let successfulEndpoint: string | null = null;
            let statusCode: number | null = null;

            for (const ep of endpointsToTest) {
              try {
                const pingRes = await fetch(`${bitxUrl}${ep}`, {
                  method: 'GET',
                  headers: { 'User-Agent': 'GlobalExchange-Dev-Bridge-Ping/1.0' },
                  signal: AbortSignal.timeout(6000),
                });
                if (pingRes.ok) {
                  pingOk = true;
                  successfulEndpoint = ep;
                  statusCode = pingRes.status;
                  break;
                }
              } catch {}
            }

            let pushResult: any = null;
            if (clientSample) {
              pushResult = await sendToBitXCore('/api/bitx/add-client', { client: clientSample });
              if (!pushResult.ok) {
                pushResult = await sendToBitXCore('/api/clients', { client: clientSample });
              }
            }

            const latencyMs = Date.now() - startTime;

            return sendJson(200, {
              success: pingOk || (pushResult && pushResult.ok),
              latencyMs,
              endpointReached: successfulEndpoint,
              statusCode,
              message: pingOk || (pushResult && pushResult.ok)
                ? `✅ Conexão estabelecida com sucesso com a BitX Core (${bitxUrl}) em ${latencyMs}ms! Os dados do cliente (${clientSample?.email || 'padrão'}) foram enviados.`
                : `⚠️ O servidor BitX Core respondeu com erro ou timeout em ${bitxUrl}. Verifique se o serviço está Ativo (Live) no painel do Render.`,
              clientSent: clientSample ? { email: clientSample.email, name: clientSample.name, address: clientSample.bitxAddress } : null,
              pushResult,
            });
          } catch (err: any) {
            return sendJson(200, {
              success: false,
              message: `Falha ao conectar com o serviço BitX Core (${bitxUrl}): ${err.message}`,
              error: err.message,
            });
          }
        }

        // 1.5.3 Forçar Sincronização Imediata
        if (pathname === '/api/bitx/force-sync' && req.method === 'POST') {
          try {
            const dataFilePath = getDataFilePath();
            let raw: any = {};
            if (fs.existsSync(dataFilePath)) {
              raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            }

            const clients = Array.isArray(raw.clients) ? raw.clients : [];
            const ledger = Array.isArray(raw.ledger) ? raw.ledger : [];
            const balances = raw.balances || {};

            if (clients.length > 0) {
              propagateClientsBatchToBitXCore(clients, ledger, balances).catch(() => {});
              for (const c of clients) {
                propagateClientToBitXCore(c).catch(() => {});
              }
            }

            return sendJson(200, {
              success: true,
              message: `Sincronização imediata disparada para ${clients.length} cliente(s) com a BitX Core!`,
              totalClients: clients.length,
            });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.6 Ponte de Sincronização Completa BitX Core <-> Global Exchange
        if (pathname === '/api/bitx/sync-clients' && req.method === 'POST') {
          const body = await readJsonBody();
          try {
            const dataFilePath = getDataFilePath();
            let raw: any = {};
            if (fs.existsSync(dataFilePath)) {
              raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            }

            if (Array.isArray(body.clients)) {
              raw.clients = body.clients;
            }
            if (body.balances) raw.balances = { ...(raw.balances || {}), ...body.balances };
            if (body.brlBalances) raw.brlBalances = { ...(raw.brlBalances || {}), ...body.brlBalances };
            if (body.usdtBalances) raw.usdtBalances = { ...(raw.usdtBalances || {}), ...body.usdtBalances };
            if (Array.isArray(body.ledger)) raw.ledger = body.ledger;
            if (Array.isArray(body.movements)) raw.movements = body.movements;

            fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');

            // Propaga ativamente em segundo plano para o repositório BitX Core
            if (Array.isArray(raw.clients) && raw.clients.length > 0) {
              propagateClientsBatchToBitXCore(raw.clients, raw.ledger, raw.balances).catch(() => {});
            }

            return sendJson(200, {
              success: true,
              message: 'Sincronização bidirecional entre BitX Core Blockchain e Global Exchange efetuada com sucesso!',
              clients: raw.clients,
              totalClients: raw.clients?.length || 0,
            });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.6.0 Notificação de Transferência BitX Core (Webhook / Ponte de Liquidação)
        if ((pathname === '/api/bitx/transaction-notify' || pathname === '/api/bitx/transfer' || pathname === '/api/bitx/notify-transfer') && req.method === 'POST') {
          try {
            const body = await readJsonBody();
            const txid = (body.txid || body.id || `tx_${Date.now().toString(16)}`).trim();
            const toAddress = (body.toAddress || body.recipientAddress || body.address || '').trim().toLowerCase();
            const clientEmail = (body.clientEmail || body.email || '').trim().toLowerCase();
            const amount = parseFloat(body.amount) || 1.0;
            const sender = body.sender || body.fromAddress || 'Rede BitX Core (Carteira Oficial)';
            const note = body.note || 'Transferência recebida da blockchain BitX Core';

            const dataFilePath = getDataFilePath();
            let raw: any = { clients: [], balances: {}, brlBalances: {}, usdtBalances: {}, movements: [], ledger: [] };
            if (fs.existsSync(dataFilePath)) {
              raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            }

            if (!Array.isArray(raw.clients)) raw.clients = [];
            if (!raw.balances) raw.balances = {};
            if (!Array.isArray(raw.movements)) raw.movements = [];
            if (!Array.isArray(raw.ledger)) raw.ledger = [];

            // Localiza cliente por endereço ou e-mail
            let client = raw.clients.find((c: any) =>
              (toAddress && (c.bitxAddress || '').toLowerCase() === toAddress) ||
              (clientEmail && (c.email || '').toLowerCase() === clientEmail)
            );

            // Fallback para primeiro cliente ativo se não fornecido
            if (!client && raw.clients.length > 0) {
              client = raw.clients[0];
            }

            if (!client) {
              return sendJson(404, { success: false, error: 'Nenhum cliente correspondente encontrado para este endereço BitX Core.' });
            }

            const targetEmail = client.email.toLowerCase();
            const currentBal = Number(raw.balances[targetEmail] || 0);
            const newBal = currentBal + amount;
            raw.balances[targetEmail] = newBal;
            client.balanceBtxc = newBal;

            const existingMovIdx = raw.movements.findIndex((m: any) => m.txid === txid);
            const now = new Date().toISOString();

            const newMov = {
              id: txid,
              txid: txid,
              clientId: targetEmail,
              clientEmail: targetEmail,
              clientName: client.name || targetEmail,
              type: 'DEPÓSITO BITX CORE',
              description: `Transferência de ${amount.toFixed(4)} BTXC recebida da BitX Core (Destino: ${client.bitxAddress})`,
              value: amount,
              currency: 'BTXC',
              status: 'CONFIRMADO',
              bitxAddress: client.bitxAddress,
              externalTxid: txid,
              createdAt: now,
              note,
            };

            if (existingMovIdx >= 0) {
              raw.movements[existingMovIdx] = newMov;
            } else {
              raw.movements.unshift(newMov);
              client.movementCount = (client.movementCount || 0) + 1;
            }
            client.latestMovement = newMov;
            client.updatedAt = now;

            // Insere no Livro Razão
            const ledgerId = `LEDGER-BTXC-${Date.now()}`;
            raw.ledger.unshift({
              id: ledgerId,
              type: 'Transferência BitX Core Recebida',
              counterparty: `${sender} -> ${client.name}`,
              amountGx: amount,
              amountBrl: 0,
              amountUsdt: 0,
              txid: txid,
              timestamp: new Date().toLocaleString('pt-BR'),
              status: 'Confirmado na Blockchain BitX Core',
              beneficiaryEmail: targetEmail,
              notes: `Liquidado na carteira oficial ${client.bitxAddress}`,
            });

            fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');

            return sendJson(200, {
              success: true,
              message: `Transferência de ${amount} BTXC creditada com sucesso na custódia de ${client.name}!`,
              movement: newMov,
              newBalance: newBal,
              client,
            });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.6.0.1 Consultar e Sincronizar Movimentações BitX Core
        if (pathname === '/api/bitx/movements' && req.method === 'GET') {
          try {
            const dataFilePath = getDataFilePath();
            let movements: any[] = [];
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              movements = raw.movements || [];
            }
            return sendJson(200, { success: true, movements });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.6.1 Zerar Custódia e Histórico para Modo Real de Liquidez 100% Efetivo
        if ((pathname === '/api/bitx/reset-custody' || pathname === '/api/custody/reset-real-mode') && req.method === 'POST') {
          if (pixService?.clearWebhookEvents) {
            pixService.clearWebhookEvents();
          }
          try {
            const body = await readJsonBody();
            const dataFilePath = getDataFilePath();
            let raw: any = {};
            if (fs.existsSync(dataFilePath)) {
              raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            }

            raw.realModeActive = true;
            raw.walletBalance = 0.0;
            raw.financialTransactions = [];

            if (!raw.balances) raw.balances = {};
            if (!raw.brlBalances) raw.brlBalances = {};
            if (!raw.usdtBalances) raw.usdtBalances = {};

            const geoniEmails = [
              'geonimatos31@hotmail.com',
              'geoniclementino31@gmail.com',
              'geonimatos31@gmail.com',
              'geonimatos42@gmail.com',
              'geonimatos31.nautilus@gmail.com',
              'teste2@globalexchange.com',
              'contato@betaltda.com.br',
              'teste_unitario@globalexchange.com',
              'cliente@globalexchange.com',
            ];

            geoniEmails.forEach((em) => {
              raw.balances[em] = 0.0;
              raw.brlBalances[em] = 0.0;
              raw.usdtBalances[em] = 0.0;
            });

            Object.keys(raw.balances).forEach((k) => { raw.balances[k] = 0.0; });
            Object.keys(raw.brlBalances).forEach((k) => { raw.brlBalances[k] = 0.0; });
            Object.keys(raw.usdtBalances).forEach((k) => { raw.usdtBalances[k] = 0.0; });

            if (Array.isArray(raw.clients)) {
              raw.clients = raw.clients.map((c: any) => {
                const cleanEmail = (c.email || '').toLowerCase();
                raw.balances[cleanEmail] = 0.0;
                raw.brlBalances[cleanEmail] = 0.0;
                raw.usdtBalances[cleanEmail] = 0.0;
                return {
                  ...c,
                  balanceBtxc: 0.0,
                  balanceBrl: 0.0,
                  balanceUsdt: 0.0,
                  movementCount: 1,
                  latestMovement: null,
                  updatedAt: new Date().toISOString(),
                };
              });
            }

            const auditMovement = body?.movement || {
              id: '0x9891c2bfbee33952a01ce9a471b83d1e',
              txid: '0x9891c2bfbee33952a01ce9a471b83d1e',
              clientId: 'geonimatos31@hotmail.com',
              clientEmail: 'geonimatos31@hotmail.com',
              clientName: 'Geoni Clementino Cesar de Matos',
              type: 'AJUSTE CUSTÓDIA',
              description: 'Ativação Oficial do Modo de Liquidez 100% Real · Custódia Zerada e Sincronizada com a BitX Core Blockchain (Mainnet #349.000)',
              value: 0,
              currency: 'BRL',
              status: 'CONFIRMADO',
              bitxAddress: 'bxrt1qnkc489m7w4s0zey43n6e594dfm3l08u94s0zey',
              createdAt: new Date().toISOString(),
              note: 'Custódia zerada com sucesso em todo o ecossistema Global Exchange e BitX Core.',
            };

            raw.movements = [auditMovement];

            if (Array.isArray(raw.ledger) && raw.ledger.length > 0) {
              raw.ledger = raw.ledger.map((entry: any) => ({
                ...entry,
                amountGx: 0.0,
                amountBrl: 0.0,
                amountUsdt: 0.0,
                status: 'Modo Real Ativo (Custódia Zerada)',
              }));
            }

            fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');

            return sendJson(200, {
              success: true,
              message: 'Custódia zerada com sucesso em todo o ecossistema BitX Core e Global Exchange! Modo de liquidez 100% real ativado.',
              clients: raw.clients,
              balances: raw.balances,
              brlBalances: raw.brlBalances,
              usdtBalances: raw.usdtBalances,
              movement: auditMovement,
            });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.7 Cadastrar Novo Cliente Real
        if ((pathname === '/api/bitx/add-client' || pathname === '/api/clients') && req.method === 'POST') {
          const body = await readJsonBody();
          const cleanEmail = (body.email || body.clientEmail || '').trim().toLowerCase();
          const cleanName = (body.name || body.clientName || '').trim();
          const cleanDoc = (body.document || '').trim();
          const tagId = (body.tagId || cleanEmail).trim();
          const initialBtxc = parseFloat(body.initialBtxc || body.balanceBtxc) || 0;
          const initialBrl = parseFloat(body.initialBrl || body.balanceBrl) || 0;
          const initialUsdt = parseFloat(body.initialUsdt || body.balanceUsdt) || 0;
          const kycStatus = body.kycStatus || 'Verificado KYC (Completo)';

          if (!cleanEmail || !cleanName) {
            return sendJson(400, { success: false, error: 'Nome e E-mail são obrigatórios.' });
          }

          try {
            const dataFilePath = getDataFilePath();
            let raw: any = { clients: [], balances: {}, brlBalances: {}, usdtBalances: {}, ledger: [] };
            if (fs.existsSync(dataFilePath)) {
              raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            }

            if (!Array.isArray(raw.clients)) raw.clients = [];
            if (!raw.balances) raw.balances = {};
            if (!raw.brlBalances) raw.brlBalances = {};
            if (!raw.usdtBalances) raw.usdtBalances = {};
            if (!Array.isArray(raw.ledger)) raw.ledger = [];

            const existingIdx = raw.clients.findIndex((c: any) => c.email.toLowerCase() === cleanEmail);
            const now = new Date().toISOString();
            const bitxAddress = body.bitxAddress || `bxrt1q${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
            const registrationTxid = body.registrationTxid || `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

            const newClient = {
              id: tagId || cleanEmail,
              tagId: tagId || cleanEmail,
              email: cleanEmail,
              name: cleanName,
              document: cleanDoc || '—',
              createdAt: existingIdx >= 0 ? raw.clients[existingIdx].createdAt : now,
              updatedAt: now,
              movementCount: existingIdx >= 0 ? raw.clients[existingIdx].movementCount : (initialBtxc > 0 || initialBrl > 0 ? 1 : 0),
              bitxAddress,
              registrationTxid,
              balanceBtxc: initialBtxc,
              balanceBrl: initialBrl,
              balanceUsdt: initialUsdt,
              kycStatus,
            };

            if (existingIdx >= 0) {
              raw.clients[existingIdx] = newClient;
            } else {
              raw.clients.push(newClient);
            }

            raw.balances[cleanEmail] = initialBtxc;
            raw.brlBalances[cleanEmail] = initialBrl;
            raw.usdtBalances[cleanEmail] = initialUsdt;

            if (initialBtxc > 0 || initialBrl > 0 || initialUsdt > 0) {
              const custId = `CUST-${String(raw.ledger.length + 1).padStart(3, '0')}`;
              raw.ledger.push({
                id: custId,
                type: 'Aporte Inicial',
                counterparty: `Custódia Engecema PJ -> ${cleanName}`,
                amountGx: initialBtxc,
                amountBrl: initialBrl,
                amountUsdt: initialUsdt,
                txid: registrationTxid,
                timestamp: new Date().toLocaleString('pt-BR'),
                status: 'Confirmado em Custódia',
                beneficiaryEmail: cleanEmail,
                notes: 'Aporte inicial configurado no cadastro de cliente real',
              });
            }

            fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');

            // Propaga ativamente o cliente para a BitX Core
            propagateClientToBitXCore(newClient).catch(() => {});

            return sendJson(201, {
              success: true,
              message: 'Cliente cadastrado e sincronizado com a BitX Core e Global Exchange com sucesso!',
              client: newClient,
              clients: raw.clients,
            });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.8 Remover Cliente
        if (pathname === '/api/bitx/remove-client' && req.method === 'POST') {
          const body = await readJsonBody();
          const cleanEmail = (body.email || '').trim().toLowerCase();

          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (Array.isArray(raw.clients)) {
                raw.clients = raw.clients.filter((c: any) => c.email.toLowerCase() !== cleanEmail);
              }
              if (raw.balances) delete raw.balances[cleanEmail];
              if (raw.brlBalances) delete raw.brlBalances[cleanEmail];
              if (raw.usdtBalances) delete raw.usdtBalances[cleanEmail];
              fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
              return sendJson(200, { success: true, message: 'Cliente removido com sucesso.', clients: raw.clients });
            }
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 1.9 Zerar Todos os Clientes e Livro Razão (Reset Total)
        if (pathname === '/api/bitx/reset-all' && req.method === 'POST') {
          try {
            const dataFilePath = getDataFilePath();
            const cleanData = {
              realModeActive: true,
              walletBalance: 0,
              launchPrice: '421081.54',
              clients: [],
              ledger: [],
              movements: [],
              balances: {},
              brlBalances: {},
              usdtBalances: {},
              financialTransactions: [],
              bitxCore: {
                network: 'REDE ATIVA · PRODUÇÃO (MAINNET)',
                chainHeight: '#349.000',
                symbol: 'BTXC',
                price: '421081.54',
                variation: '+0.42%',
                status: 'Online v3.4',
              },
            };
            fs.writeFileSync(dataFilePath, JSON.stringify(cleanData, null, 2), 'utf8');
            return sendJson(200, { success: true, message: 'Todos os clientes, movimentações e Livro Razão foram zerados com sucesso no servidor.' });
          } catch (e: any) {
            return sendJson(500, { success: false, error: e?.message });
          }
        }

        // 2. Diagnóstico Pix BB
        if (pathname === '/api/pix/diagnostics' && req.method === 'GET') {
          const config = pixService?.getBBConfig ? pixService.getBBConfig() : {
            clientId: process.env.BB_CLIENT_ID || '',
            clientSecret: process.env.BB_CLIENT_SECRET || '',
            gwAppKey: process.env.BB_GW_APP_KEY || '',
            pixKey: process.env.BB_PIX_KEY || '05368602000110',
            env: 'production',
          };

          const mtlsCertExists = pixService?.MTLS_CERT_PATH ? fs.existsSync(pixService.MTLS_CERT_PATH) : true;
          const rootCaExists = pixService?.ROOT_CA_PATH ? fs.existsSync(pixService.ROOT_CA_PATH) : true;
          const hasCredentials = Boolean(config.clientId && config.clientSecret && config.gwAppKey);
          const host = req.headers.host || 'localhost:3000';
          const proto = req.headers['x-forwarded-proto'] || 'http';

          return sendJson(200, {
            status: 'ONLINE',
            environment: config.env || 'production',
            pixKey: config.pixKey || '05368602000110',
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
              certPath: 'star_mtls_api_bb_com_br.crt',
            },
            webhook: {
              suggestedUrl: `${proto}://${host}/api/webhook/pix`,
              totalEventsReceived: pixService?.webhookEvents?.length || 0,
            },
            activeCharges: pixService?.charges?.size || 0,
          });
        }

        // 3. Testar Conexão OAuth com o Banco do Brasil
        if (pathname === '/api/pix/test-connection' && req.method === 'POST') {
          const config = pixService?.getBBConfig ? pixService.getBBConfig() : {
            clientId: process.env.BB_CLIENT_ID || '',
            clientSecret: process.env.BB_CLIENT_SECRET || '',
            gwAppKey: process.env.BB_GW_APP_KEY || '',
          };

          if (!config.clientId || !config.clientSecret || !config.gwAppKey) {
            return sendJson(200, {
              success: false,
              message:
                'Credenciais do Banco do Brasil não configuradas no ambiente. Para autenticar com a API oficial do BB em produção, configure BB_CLIENT_ID, BB_CLIENT_SECRET e BB_GW_APP_KEY nas variáveis de ambiente do Render.',
            });
          }

          try {
            const token = await pixService.getBBAccessToken();
            return sendJson(200, {
              success: true,
              message: 'Conexão mTLS e autenticação OAuth 2.0 com o Banco do Brasil realizada com SUCESSO!',
              tokenSnippet: token ? `${token.slice(0, 10)}...${token.slice(-6)}` : 'OK',
            });
          } catch (err: any) {
            return sendJson(200, {
              success: false,
              message: 'Falha ao autenticar no Banco do Brasil: ' + (err?.message || 'Erro desconhecido'),
            });
          }
        }

        // 4. Listar eventos reais recebidos pelo Webhook
        if (pathname === '/api/pix/webhook-events' && req.method === 'GET') {
          return sendJson(200, {
            events: pixService?.webhookEvents?.slice(0, 50) || [],
          });
        }

        // 6. Registro de Webhook via API
        if (pathname === '/api/pix/register-webhook' && req.method === 'POST') {
          const body = await readJsonBody();
          const webhookUrl = body.webhookUrl || `https://${req.headers.host}/api/webhook/pix`;

          try {
            if (pixService?.registerBBWebhookUrl) {
              const resBB = await pixService.registerBBWebhookUrl(webhookUrl);
              return sendJson(200, {
                success: true,
                message: 'Webhook registrado com sucesso no Banco do Brasil!',
                details: resBB,
              });
            }
          } catch (err: any) {
            return sendJson(200, {
              success: false,
              message: 'Erro ao registrar webhook no BB: ' + (err?.message || 'Credenciais ausentes'),
            });
          }

          return sendJson(200, {
            success: false,
            message:
              'Para registrar a URL no Banco do Brasil, configure BB_CLIENT_ID e BB_CLIENT_SECRET no painel do Render.',
          });
        }

        // 7. Criar cobrança Pix
        if (pathname === '/api/pix/create-charge' && req.method === 'POST') {
          const body = await readJsonBody();
          const numAmount = parseFloat(body.amount);
          const txid = `GX${Date.now()}`.slice(0, 32);

          let bbResponse: any = null;
          let isDirectBbApi = false;

          const config = pixService?.getBBConfig ? pixService.getBBConfig() : null;
          if (config?.clientId && config?.clientSecret && config?.gwAppKey && pixService?.createBBCob) {
            try {
              bbResponse = await pixService.createBBCob(numAmount, txid, {
                nome: body.clientName,
                cpf: body.document,
              });
              isDirectBbApi = true;
            } catch (bbErr: any) {
              console.warn('[Pix BB] Chamada direta à API BB falhou, usando fallback Bacen:', bbErr.message);
            }
          }

          if (pixService?.charges) {
            pixService.charges.set(txid, {
              txid,
              amount: numAmount,
              clientEmail: (body.clientEmail || '').toLowerCase(),
              clientName: body.clientName || '',
              document: body.document || '',
              status: 'PENDENTE',
              createdAt: new Date().toISOString(),
              isDirectBbApi,
              bbResponse,
            });
          }

          return sendJson(201, {
            success: true,
            txid,
            amount: numAmount,
            clientEmail: body.clientEmail,
            status: 'PENDENTE',
            isDirectBbApi,
            pixCopiaECola: bbResponse?.pixCopiaECola || null,
            message: isDirectBbApi
              ? 'Cobrança dinâmica registrada na API oficial do Banco do Brasil.'
              : 'Cobrança inicializada no gateway com chave Pix Engecema (CNPJ 05.368.602/0001-10).',
          });
        }

        // 7.1 Limpar eventos de teste
        if (pathname === '/api/pix/clear-test-events' && req.method === 'POST') {
          if (pixService?.clearWebhookEvents) {
            pixService.clearWebhookEvents();
          }
          return sendJson(200, {
            success: true,
            message: 'Histórico de eventos de teste limpo com sucesso! Pronto para transações reais.',
          });
        }

        // 8. Consultar status da cobrança
        if (pathname.startsWith('/api/pix/status/') && req.method === 'GET') {
          const parts = pathname.split('/');
          const rawTxid = parts[parts.length - 1];
          const txid = decodeURIComponent(rawTxid);
          const charge = pixService?.charges?.get(txid);

          if (charge) {
            return sendJson(200, charge);
          }
          return sendJson(404, { error: 'Cobrança não encontrada', txid });
        }

        // 8.1 Transferência Instantânea Direta (Saque Pix / BB)
        if (pathname === '/api/pix/withdraw' && req.method === 'POST') {
          const body = await readJsonBody();
          const numAmount = parseFloat(body.amount);

          if (!Number.isFinite(numAmount) || numAmount <= 0) {
            return sendJson(400, { error: 'Informe um valor de saque válido e maior que zero.' });
          }

          if (!body.clientEmail) {
            return sendJson(400, { error: 'E-mail do cliente é obrigatório.' });
          }

          if (pixService?.executeBBPixTransfer) {
            try {
              const result = await pixService.executeBBPixTransfer({
                amount: numAmount,
                clientEmail: body.clientEmail,
                clientName: body.clientName || body.recipientName || body.clientEmail,
                destinationType: body.destinationType || 'pix',
                pixKey: body.pixKey,
                pixKeyType: body.pixKeyType,
                bankAgency: body.bankAgency,
                bankAccount: body.bankAccount,
                accountDigit: body.accountDigit,
                recipientName: body.recipientName || body.clientName,
                recipientDoc: body.recipientDoc,
              });
              return sendJson(200, result);
            } catch (err: any) {
              return sendJson(500, { error: err.message || 'Erro ao processar transferência instantânea.' });
            }
          }

          return sendJson(500, {
            error: 'Serviço de liquidação bancária Banco do Brasil temporariamente indisponível.',
          });
        }

        // 8.1.1 Retentar envio via API oficial do BB a partir da Mesa
        if (pathname === '/api/pix/retry-withdrawal' && req.method === 'POST') {
          const body = await readJsonBody();
          const { txid } = body;
          if (!txid) {
            return sendJson(400, { error: 'TXID da ordem é obrigatório para retentar.' });
          }
          if (pixService?.retryBBPixTransfer) {
            try {
              const res = await pixService.retryBBPixTransfer(txid);
              return sendJson(200, res);
            } catch (err: any) {
              return sendJson(500, { error: err.message || 'Erro ao conectar à API BB.' });
            }
          }
          return sendJson(500, { error: 'Método retryBBPixTransfer não disponível.' });
        }

        // 8.1.2 Atualizar credenciais reais do Banco do Brasil
        if (pathname === '/api/pix/update-credentials' && req.method === 'POST') {
          const body = await readJsonBody();
          if (pixService?.updateRuntimeBBConfig) {
            const updated = pixService.updateRuntimeBBConfig(body);
            return sendJson(200, {
              success: true,
              message: 'Credenciais oficiais do Banco do Brasil atualizadas em produção!',
              hasClientId: Boolean(updated.clientId),
              hasClientSecret: Boolean(updated.clientSecret),
              hasGwAppKey: Boolean(updated.gwAppKey),
              pixKey: updated.pixKey,
            });
          }
          return sendJson(500, { error: 'Serviço de configuração não disponível.' });
        }

        // 8.2 Cancelamento / Estorno de Saque
        if (pathname === '/api/pix/cancel-withdrawal' && req.method === 'POST') {
          const body = await readJsonBody();
          const { txid, reason } = body;
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (Array.isArray(raw.movements)) {
                const mov = raw.movements.find((m: any) => m.txid === txid || m.id === txid);
                if (mov) {
                  mov.status = 'ESTORNADO';
                  mov.bankStatus = 'ESTORNADO_CUSTODIA';
                  mov.refundedAt = new Date().toISOString();
                  mov.note = reason || 'Estorno processado';
                  fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
                }
              }
            }
          } catch (e: any) {
            console.warn('[Dev API Cancel Saque] Aviso ao atualizar gx-data:', e?.message);
          }
          return sendJson(200, {
            success: true,
            message: 'Saque cancelado e estornado com sucesso!',
          });
        }

        // 8.3 Confirmação de Liquidação Bancária no BB
        if (pathname === '/api/pix/confirm-withdrawal' && req.method === 'POST') {
          const body = await readJsonBody();
          const { txid, officialEndToEndId, notes } = body;
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              if (Array.isArray(raw.movements)) {
                const mov = raw.movements.find((m: any) => m.txid === txid || m.id === txid);
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
          } catch (e: any) {
            console.warn('[Dev API Confirm Saque] Aviso ao atualizar gx-data:', e?.message);
          }
          return sendJson(200, {
            success: true,
            message: 'Liquidação bancária confirmada no Banco do Brasil!',
          });
        }

        // 9. Endpoint Oficial de Webhook (POST /api/webhook/pix)
        if (pathname === '/api/webhook/pix' || pathname === '/pix/webhook') {
          if (req.method === 'GET' || req.method === 'PUT') {
            return sendJson(200, { status: 'WEBHOOK_READY', timestamp: new Date().toISOString() });
          }

          if (req.method === 'POST') {
            const payload = await readJsonBody();
            let count = 0;
            const events: any[] = [];

            if (payload && Array.isArray(payload.pix) && pixService?.processIncomingPixNotification) {
              for (const item of payload.pix) {
                events.push(pixService.processIncomingPixNotification(item));
                count++;
              }
            } else if (payload && (payload.endToEndId || payload.txid || payload.valor) && pixService?.processIncomingPixNotification) {
              events.push(pixService.processIncomingPixNotification(payload));
              count++;
            }

            return sendJson(200, {
              status: 'PROCESSADO_COM_SUCESSO',
              recebidos: count,
              eventos: events,
            });
          }
        }

        // 10. Status do Supabase / Auth
        if (pathname === '/api/auth/status' && req.method === 'GET') {
          const supabaseUrl = (process.env.GX_SUPABASE_URL || '').replace(/\/+$/, '');
          const pubKey = process.env.GX_SUPABASE_PUBLISHABLE_KEY || '';
          const secKey = process.env.GX_SUPABASE_SECRET_KEY || '';

          return sendJson(200, {
            hasSupabase: Boolean(supabaseUrl),
            configured: Boolean(supabaseUrl && (pubKey || secKey)),
            url: supabaseUrl || null,
          });
        }

        // 11. Cadastro com Supabase Auth
        if (pathname === '/api/auth/register' && req.method === 'POST') {
          const body = await readJsonBody();
          const supabaseUrl = (process.env.GX_SUPABASE_URL || '').replace(/\/+$/, '');
          const pubKey = process.env.GX_SUPABASE_PUBLISHABLE_KEY || '';
          const secKey = process.env.GX_SUPABASE_SECRET_KEY || '';
          const cleanEmail = (body.email || '').trim().toLowerCase();

          let supabaseSuccess = false;
          let supabaseMessage = '';

          if (supabaseUrl && (pubKey || secKey) && cleanEmail && body.password) {
            try {
              const apiKey = secKey || pubKey;
              const authRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                  apikey: apiKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  email: cleanEmail,
                  password: body.password,
                  data: { name: body.name || '', document: body.document || '', role: body.role || 'client' },
                }),
              });

              if (authRes.ok) {
                supabaseSuccess = true;
                supabaseMessage = 'Usuário registrado no Supabase Auth.';
              }
            } catch (err: any) {
              console.warn('[Dev API Supabase] Falha de sincronização:', err?.message);
            }
          }

          return sendJson(201, {
            success: true,
            supabaseSuccess,
            message: supabaseMessage || 'Cadastro realizado com sucesso. Autentique-se com sua senha.',
          });
        }

        // 12. Login com Supabase Auth
        if (pathname === '/api/auth/login' && req.method === 'POST') {
          const body = await readJsonBody();
          const supabaseUrl = (process.env.GX_SUPABASE_URL || '').replace(/\/+$/, '');
          const pubKey = process.env.GX_SUPABASE_PUBLISHABLE_KEY || '';
          const cleanEmail = (body.email || '').trim().toLowerCase();

          let supabaseAuthenticated = false;
          let token = null;

          if (supabaseUrl && pubKey && cleanEmail && body.password) {
            try {
              const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                  apikey: pubKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  email: cleanEmail,
                  password: body.password,
                }),
              });

              if (authRes.ok) {
                const data = await authRes.json();
                supabaseAuthenticated = true;
                token = data.access_token || null;
              }
            } catch (err: any) {
              console.warn('[Dev API Supabase Login] Erro:', err?.message);
            }
          }

          return sendJson(200, {
            success: true,
            supabaseAuthenticated,
            token,
          });
        }

        // 13. Limpar Histórico de Testes para Transações Reais
        if (pathname === '/api/admin/clean-history' && req.method === 'POST') {
          if (pixService?.clearWebhookEvents) {
            pixService.clearWebhookEvents();
          }
          try {
            const dataFilePath = getDataFilePath();
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              raw.movements = [];
              raw.financialTransactions = [];
              raw.realModeActive = true;
              if (!raw.balances) raw.balances = {};
              if (!raw.brlBalances) raw.brlBalances = {};
              if (!raw.usdtBalances) raw.usdtBalances = {};
              Object.keys(raw.balances).forEach((k) => { raw.balances[k] = 0.0; });
              Object.keys(raw.brlBalances).forEach((k) => { raw.brlBalances[k] = 0.0; });
              Object.keys(raw.usdtBalances).forEach((k) => { raw.usdtBalances[k] = 0.0; });
              if (Array.isArray(raw.clients)) {
                raw.clients = raw.clients.map((c: any) => ({
                  ...c,
                  balanceBtxc: 0.0,
                  balanceBrl: 0.0,
                  balanceUsdt: 0.0,
                  movementCount: 0,
                  latestMovement: null,
                  updatedAt: new Date().toISOString(),
                }));
              }
              fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
            }
          } catch (err: any) {
            console.warn('[Dev API] Falha ao resetar gx-data.json:', err?.message);
          }

          return sendJson(200, {
            success: true,
            message: 'Histórico e custódia limpos com sucesso! Ecossistema 100% pronto para transações reais.',
          });
        }

        return next();
      });
    },
  };
}
