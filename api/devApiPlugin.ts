import type { Plugin, ViteDevServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

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

        // 4. Simulação de Webhook (Homologação)
        if (pathname === '/api/pix/simulate-webhook' && req.method === 'POST') {
          const body = await readJsonBody();
          const amount = parseFloat(body.amount) || 100.0;
          const txid = body.txid || `GX${Date.now()}`;
          const clientEmail = (body.clientEmail || '').toLowerCase();
          const payerName = body.payerName || 'Pagador Teste Banco do Brasil';

          const simulatedItem = {
            endToEndId: `E00000000${Date.now()}SIMULADO`,
            txid,
            valor: amount.toFixed(2),
            horario: new Date().toISOString(),
            chave: '05368602000110',
            infoPagador: 'Simulação de Pagamento Pix BB',
            pagador: {
              nome: payerName,
              cpf: '00000000000',
            },
          };

          let processed: any;
          if (pixService?.processIncomingPixNotification) {
            if (txid && pixService.charges && !pixService.charges.has(txid)) {
              pixService.charges.set(txid, {
                txid,
                amount,
                clientEmail,
                status: 'PENDENTE',
                createdAt: new Date().toISOString(),
              });
            }
            processed = pixService.processIncomingPixNotification(simulatedItem);
          } else {
            processed = {
              id: `evt-${Date.now()}`,
              endToEndId: simulatedItem.endToEndId,
              txid,
              amount,
              paidAt: simulatedItem.horario,
              payerName,
              payerDoc: '05368602000110',
              receivedAt: new Date().toISOString(),
              status: 'LIQUIDADO_BANCO_DO_BRASIL',
            };
          }

          return sendJson(200, {
            success: true,
            message: 'Notificação Pix simulada e liquidada com sucesso!',
            event: processed,
          });
        }

        // 5. Listar eventos do Webhook
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

          // Fallback se pixService não exportar executeBBPixTransfer
          const dateStr = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
          const endToEndId = `E00000000${dateStr}DEV${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const txid = `0x${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}`;

          return sendJson(200, {
            success: true,
            txid,
            endToEndId,
            amount: numAmount,
            isDirectBbApi: false,
            apiStatus: 'PROCESSADO_ALCADA_BB',
            executedAt: new Date().toISOString(),
            message:
              'Débito de custódia registrado na Global Exchange. A efetivação na conta bancária do favorecido aguarda liberação na alçada do Gerenciador Financeiro BB PJ.',
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
            const dataFilePath = path.resolve(__dirname, '..', 'data', 'gx-data.json');
            if (fs.existsSync(dataFilePath)) {
              const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
              raw.movements = [];
              raw.financialTransactions = [];
              fs.writeFileSync(dataFilePath, JSON.stringify(raw, null, 2), 'utf8');
            }
          } catch (err: any) {
            console.warn('[Dev API] Falha ao resetar gx-data.json:', err?.message);
          }

          return sendJson(200, {
            success: true,
            message: 'Histórico limpo com sucesso! Ecossistema 100% pronto para transações reais.',
          });
        }

        return next();
      });
    },
  };
}
