/**
 * Ponte de Comunicação e Sincronização Supabase
 * Compartilhada entre Global Exchange e BitX Core Blockchain
 * Com Fila de Reprocessamento Automática (Retry Queue) contra falhas de rede intermitentes
 */

export interface SupabaseClientRow {
  id: string;
  email: string;
  name: string;
  document: string;
  secondary_addresses?: string[];
  btxc_balance?: number;
  gx_balance?: number;
  brl_balance?: number;
  usdt_balance?: number;
  bitx_address?: string;
  status?: string;
  title_badge?: string;
  custody_txid?: string;
  estimated_market_value?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseMovementRow {
  id: string;
  client_id: string;
  type: string;
  description: string;
  value: number;
  created_at?: string;
}

export interface SupabaseFinancialTransactionRow {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  description: string;
  value: number;
  transaction_date: string;
  created_at?: string;
}

export interface RetryQueueTask {
  id: string;
  type: 'clients' | 'movements' | 'financial_transactions';
  endpoint: string;
  body: any[];
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: string;
}

export interface RetryQueueStatus {
  pendingCount: number;
  isProcessing: boolean;
  tasks: RetryQueueTask[];
  lastProcessedAt?: string;
}

export const SUPABASE_CONFIG = {
  url: 'https://odbbtgkxgiqlfhcepwuj.supabase.co',
  anonKey: 'sb_publishable_22fzrMlPYyCnPUceg1b04g_ChyHEv97',
};

const RETRY_QUEUE_STORAGE_KEY = 'gx_supabase_retry_queue_v2';
const CANONICAL_MAINNET_PRICE = 438819.34;

function getHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json',
  };
}

let isProcessingQueue = false;

function loadStoredQueue(): RetryQueueTask[] {
  try {
    const raw = localStorage.getItem(RETRY_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveStoredQueue(tasks: RetryQueueTask[]): void {
  try {
    localStorage.setItem(RETRY_QUEUE_STORAGE_KEY, JSON.stringify(tasks));
    notifyQueueUpdated(tasks.length);
  } catch (e) {
    console.warn('[Supabase Bridge] Erro ao salvar fila de retry:', e);
  }
}

function notifyQueueUpdated(pendingCount: number): void {
  try {
    window.dispatchEvent(
      new CustomEvent('gx_supabase_queue_updated', {
        detail: {
          pendingCount,
          isProcessing: isProcessingQueue,
          timestamp: new Date().toISOString(),
        },
      })
    );
  } catch {}
}

export const SupabaseBridge = {
  /**
   * Consulta o estado atual da Fila de Reprocessamento (Retry Queue)
   */
  getRetryQueueStatus(): RetryQueueStatus {
    const tasks = loadStoredQueue();
    return {
      pendingCount: tasks.length,
      isProcessing: isProcessingQueue,
      tasks,
      lastProcessedAt: new Date().toISOString(),
    };
  },

  /**
   * Enfileira uma tarefa de sincronização para reprocessamento automático
   */
  enqueueRetry(task: Omit<RetryQueueTask, 'id' | 'attempts' | 'nextRetryAt' | 'createdAt'>): void {
    try {
      const queue = loadStoredQueue();
      // Evita duplicar se o mesmo endpoint com mesmo id de item já estiver na fila
      const incomingIds = new Set(task.body.map((b) => b.id).filter(Boolean));
      const filteredQueue = queue.filter((t) => {
        if (t.type !== task.type) return true;
        const existingIds = new Set(t.body.map((b) => b.id).filter(Boolean));
        // Se houver sobreposição total, remove a tarefa anterior para priorizar o payload mais recente
        for (const id of incomingIds) {
          if (existingIds.has(id)) return false;
        }
        return true;
      });

      const newTask: RetryQueueTask = {
        id: `retry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: task.type,
        endpoint: task.endpoint,
        body: task.body,
        attempts: 0,
        maxAttempts: task.maxAttempts || 6,
        nextRetryAt: Date.now() + 2000, // Primeira tentativa em 2 segundos
        lastError: task.lastError,
        createdAt: new Date().toISOString(),
      };

      filteredQueue.push(newTask);
      saveStoredQueue(filteredQueue);
      console.info(`[Supabase Retry Queue] Tarefa enfileirada: ${task.type} (${task.body.length} itens). Pendentes: ${filteredQueue.length}`);
    } catch (e: any) {
      console.warn('[Supabase Retry Queue] Falha ao enfileirar:', e?.message);
    }
  },

  /**
   * Processador da Fila de Retry com Backoff Exponencial e Jitter
   */
  async processRetryQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (isProcessingQueue) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const queue = loadStoredQueue();
    if (queue.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const now = Date.now();
    // Filtra tarefas elegíveis para execução agora
    const readyTasks = queue.filter((t) => t.nextRetryAt <= now);
    if (readyTasks.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    isProcessingQueue = true;
    notifyQueueUpdated(queue.length);

    let succeeded = 0;
    let failed = 0;
    const remainingQueue: RetryQueueTask[] = [];

    const headers = getHeaders();

    for (const task of queue) {
      if (task.nextRetryAt > now) {
        remainingQueue.push(task);
        continue;
      }

      try {
        const response = await fetch(`${task.endpoint}?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(task.body),
          signal: AbortSignal.timeout(7000),
        });

        if (response.ok) {
          succeeded++;
          console.info(`[Supabase Retry Queue] ✅ Tarefa ${task.id} (${task.type}) reprocessada com sucesso!`);
        } else {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
      } catch (err: any) {
        failed++;
        const nextAttempts = task.attempts + 1;
        if (nextAttempts < task.maxAttempts) {
          // Exponential backoff: 2s, 4s, 8s, 16s, 32s com jitter aleatório de até 1.5s
          const backoffDelay = Math.min(60000, Math.pow(2, nextAttempts) * 1000 + Math.floor(Math.random() * 1500));
          remainingQueue.push({
            ...task,
            attempts: nextAttempts,
            nextRetryAt: Date.now() + backoffDelay,
            lastError: err?.message || 'Erro de rede ou timeout',
          });
          console.warn(`[Supabase Retry Queue] ⏳ Reprocessamento ${task.id} falhou (tentativa ${nextAttempts}/${task.maxAttempts}). Próxima em ${Math.round(backoffDelay / 1000)}s: ${err?.message}`);
        } else {
          console.error(`[Supabase Retry Queue] ❌ Tarefa ${task.id} excedeu o limite máximo de ${task.maxAttempts} tentativas. Descartando.`);
        }
      }
    }

    isProcessingQueue = false;
    saveStoredQueue(remainingQueue);

    return {
      processed: readyTasks.length,
      succeeded,
      failed,
    };
  },

  /**
   * Força o reprocessamento imediato de todas as tarefas da fila
   */
  async retryNow(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const queue = loadStoredQueue();
    // Força nextRetryAt para agora em todas
    const forced = queue.map((t) => ({ ...t, nextRetryAt: Date.now() }));
    saveStoredQueue(forced);
    return this.processRetryQueue();
  },

  /**
   * Limpa todas as pendências da fila de reprocessamento
   */
  clearRetryQueue(): void {
    saveStoredQueue([]);
  },

  /**
   * Sincroniza clientes com a tabela public.clients no Supabase (Push e Pull)
   * Com integração automática com a Retry Queue
   */
  async syncClients(
    clients: any[],
    balances: Record<string, number> = {},
    brlBalances: Record<string, number> = {},
    usdtBalances: Record<string, number> = {}
  ): Promise<{
    success: boolean;
    pulledClients?: SupabaseClientRow[];
    queuedForRetry?: boolean;
    error?: string;
  }> {
    const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/clients`;
    let rowsToPush: SupabaseClientRow[] = [];

    try {
      const headers = getHeaders();

      // 1. PUSH: Prepara dados para upsert em Supabase
      if (Array.isArray(clients) && clients.length > 0) {
        rowsToPush = clients.map((c) => {
          const email = (c.email || '').toLowerCase().trim();
          const cleanDoc = (c.document || '').replace(/\D/g, '');
          const isGeoni =
            cleanDoc === '70781338387' ||
            email.includes('geonimatos') ||
            email.includes('geoni') ||
            (c.id && String(c.id).startsWith('GX-CLI-0001'));

          const btxc = balances[email] !== undefined ? Number(balances[email]) : (Number(c.balanceBtxc) || 0);
          const brl = brlBalances[email] !== undefined ? Number(brlBalances[email]) : (Number(c.balanceBrl) || 0);
          const usdt = usdtBalances[email] !== undefined ? Number(usdtBalances[email]) : (Number(c.balanceUsdt) || 0);
          const estValue = Number((btxc * CANONICAL_MAINNET_PRICE).toFixed(2));

          const assignedId = isGeoni ? 'GX-CLI-0001' : (c.id || email);

          return {
            id: assignedId,
            email: isGeoni ? 'geonimatos31@hotmail.com' : email,
            name: isGeoni ? 'Geoni Clementino Cesar de Matos' : (c.name || ''),
            document: isGeoni ? '70781338387' : (c.document || ''),
            secondary_addresses: c.secondary_addresses || [],
            btxc_balance: btxc,
            gx_balance: btxc,
            brl_balance: brl,
            usdt_balance: usdt,
            bitx_address: isGeoni ? 'bxrt1qnkach2pvm79qljf5rxdg863utw4s0zey' : (c.bitxAddress || 'bxrt1qnkach2pvm79qljf5rxdg863utw4s0zey'),
            status: c.kycStatus || 'Verificado KYC (Completo)',
            title_badge: isGeoni ? 'Cliente Real (Titular)' : 'Titular Principal',
            custody_txid: c.registrationTxid || '0x9891c2bfbee33952a01ce9a471b83d1e',
            estimated_market_value: estValue,
            updated_at: new Date().toISOString(),
          };
        });

        const pushRes = await fetch(`${endpoint}?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(rowsToPush),
          signal: AbortSignal.timeout(6000),
        });

        if (!pushRes.ok) {
          throw new Error(`HTTP ${pushRes.status} no push de clientes`);
        }
      }

      // 2. PULL: Consulta clientes existentes no banco compartilhado
      let pulled: SupabaseClientRow[] = [];
      try {
        const res = await fetch(`${endpoint}?select=*`, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            pulled = data;
          }
        }
      } catch (e: any) {
        console.warn('[Supabase Bridge] Pull warning:', e?.message);
      }

      // Processa fila pendente se a conexão está saudável
      this.processRetryQueue().catch(() => {});

      return { success: true, pulledClients: pulled };
    } catch (err: any) {
      console.warn('[Supabase Bridge] Falha temporária ao sincronizar clientes. Enfileirando na Retry Queue:', err?.message);
      if (rowsToPush.length > 0) {
        this.enqueueRetry({
          type: 'clients',
          endpoint,
          body: rowsToPush,
          maxAttempts: 6,
          lastError: err?.message || 'Falha de conexão',
        });
      }
      return { success: false, queuedForRetry: true, error: err?.message, pulledClients: [] };
    }
  },

  /**
   * Sincroniza movimentações com a tabela public.movements no Supabase
   * Com suporte a Retry Queue
   */
  async syncMovements(movements: any[]): Promise<{ success: boolean; queuedForRetry?: boolean; error?: string }> {
    const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/movements`;
    let rowsToPush: SupabaseMovementRow[] = [];

    try {
      if (!Array.isArray(movements) || movements.length === 0) return { success: true };

      const headers = getHeaders();

      rowsToPush = movements.slice(0, 50).map((m) => {
        let clientId = m.clientId || m.clientEmail || 'GX-CLI-0001';
        const clean = String(clientId).toLowerCase();
        if (clean.includes('@') || clean.includes('geoni') || clean.includes('70781338387')) {
          clientId = 'GX-CLI-0001';
        }
        return {
          id: m.id || m.txid,
          client_id: clientId,
          type: m.type || 'DEPÓSITO BITX CORE',
          description: m.description || '',
          value: Number(m.value || m.cryptoAmount) || 0,
          created_at: m.createdAt || new Date().toISOString(),
        };
      });

      const res = await fetch(`${endpoint}?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rowsToPush),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} no push de movimentações`);
      }

      return { success: true };
    } catch (err: any) {
      console.warn('[Supabase Bridge] Falha ao sincronizar movimentações. Enfileirando na Retry Queue:', err?.message);
      if (rowsToPush.length > 0) {
        this.enqueueRetry({
          type: 'movements',
          endpoint,
          body: rowsToPush,
          maxAttempts: 6,
          lastError: err?.message || 'Falha de rede',
        });
      }
      return { success: false, queuedForRetry: true, error: err?.message };
    }
  },

  /**
   * Sincroniza o Livro Razão (Ledger) com a tabela public.financial_transactions no Supabase
   * Com suporte a Retry Queue
   */
  async syncFinancialTransactions(ledgerEntries: any[]): Promise<{ success: boolean; queuedForRetry?: boolean; error?: string }> {
    const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/financial_transactions`;
    let rowsToPush: SupabaseFinancialTransactionRow[] = [];

    try {
      if (!Array.isArray(ledgerEntries) || ledgerEntries.length === 0) return { success: true };

      const headers = getHeaders();

      rowsToPush = ledgerEntries.slice(0, 50).map((entry, idx) => {
        const id = entry.id || entry.txid || `FT-${idx}-${Date.now()}`;
        const typeStr = (entry.type || '').toUpperCase();
        const isDebit =
          typeStr.includes('DÉBITO') ||
          typeStr.includes('SAQUE') ||
          typeStr.includes('COMPRA') ||
          typeStr.includes('DEBIT') ||
          (Number(entry.amountGx) < 0) ||
          (Number(entry.amountBrl) < 0);

        const normalizedType: 'CREDIT' | 'DEBIT' = isDebit ? 'DEBIT' : 'CREDIT';

        let numVal = 0;
        if (typeof entry.amountBrl === 'number' && entry.amountBrl !== 0) {
          numVal = Math.abs(entry.amountBrl);
        } else if (typeof entry.amountGx === 'number' && entry.amountGx !== 0) {
          numVal = Math.abs(entry.amountGx * CANONICAL_MAINNET_PRICE);
        } else if (typeof entry.value === 'number') {
          numVal = Math.abs(entry.value);
        }

        let dateStr = new Date().toISOString().split('T')[0];
        if (entry.timestamp) {
          const parts = entry.timestamp.split(' ')[0].split('/');
          if (parts.length === 3) {
            dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }

        return {
          id,
          type: normalizedType,
          description: `${entry.type || 'Lançamento Contábil'}: ${entry.notes || entry.counterparty || 'Custódia Engecema'}`,
          value: Number(numVal.toFixed(2)),
          transaction_date: dateStr,
          created_at: new Date().toISOString(),
        };
      });

      const res = await fetch(`${endpoint}?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rowsToPush),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} no push de financial_transactions`);
      }

      return { success: true };
    } catch (err: any) {
      console.warn('[Supabase Bridge] Falha ao sincronizar financial_transactions. Enfileirando na Retry Queue:', err?.message);
      if (rowsToPush.length > 0) {
        this.enqueueRetry({
          type: 'financial_transactions',
          endpoint,
          body: rowsToPush,
          maxAttempts: 6,
          lastError: err?.message || 'Falha de rede',
        });
      }
      return { success: false, queuedForRetry: true, error: err?.message };
    }
  },

  /**
   * Consulta e recupera movimentações gravadas no Supabase compartilhado
   */
  async pullMovements(clientId = 'GX-CLI-0001'): Promise<any[]> {
    try {
      const headers = getHeaders();
      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/movements?client_id=eq.${clientId}&order=created_at.desc&limit=50`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e: any) {
      console.warn('[Supabase Bridge] Erro ao consultar movimentações:', e?.message);
    }
    return [];
  },

  /**
   * Consulta e recupera lançamentos do Livro Razão gravados no Supabase
   */
  async pullFinancialTransactions(): Promise<any[]> {
    try {
      const headers = getHeaders();
      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/financial_transactions?order=transaction_date.desc,created_at.desc&limit=50`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e: any) {
      console.warn('[Supabase Bridge] Erro ao consultar financial_transactions:', e?.message);
    }
    return [];
  },

  /**
   * Sincronização Bidirecional Completa e Auditoria entre Global Exchange e BitX Core no Supabase
   */
  async fullBidirectionalSync(params: {
    clients: any[];
    movements?: any[];
    ledger?: any[];
    balances?: Record<string, number>;
    brlBalances?: Record<string, number>;
    usdtBalances?: Record<string, number>;
  }): Promise<{
    success: boolean;
    latencyMs: number;
    pulledClients: SupabaseClientRow[];
    pulledMovements: any[];
    pulledTransactions: any[];
    retryQueuePending: number;
    message: string;
  }> {
    const start = Date.now();
    try {
      // Reprocessa itens antigos que possam estar pendentes na Retry Queue
      this.processRetryQueue().catch(() => {});

      const [clientSyncRes, movSyncRes, transSyncRes, pulledMovs, pulledTrans] = await Promise.all([
        this.syncClients(params.clients, params.balances, params.brlBalances, params.usdtBalances),
        this.syncMovements(params.movements || []),
        this.syncFinancialTransactions(params.ledger || []),
        this.pullMovements('GX-CLI-0001'),
        this.pullFinancialTransactions(),
      ]);

      const latencyMs = Date.now() - start;
      const pulledClients = clientSyncRes.pulledClients || [];
      const queueStatus = this.getRetryQueueStatus();

      try {
        window.dispatchEvent(
          new CustomEvent('gx_supabase_synced', {
            detail: {
              success: true,
              latencyMs,
              clientsCount: pulledClients.length,
              movementsCount: pulledMovs.length,
              transactionsCount: pulledTrans.length,
              retryQueuePending: queueStatus.pendingCount,
              timestamp: new Date().toISOString(),
            },
          })
        );
      } catch {}

      return {
        success: true,
        latencyMs,
        pulledClients,
        pulledMovements: pulledMovs,
        pulledTransactions: pulledTrans,
        retryQueuePending: queueStatus.pendingCount,
        message: `Sincronização bidirecional concluída com o Supabase em ${latencyMs}ms (${pulledClients.length} clientes, ${pulledMovs.length} movimentações, ${pulledTrans.length} lançamentos, Fila: ${queueStatus.pendingCount} pendentes)`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const queueStatus = this.getRetryQueueStatus();
      return {
        success: false,
        latencyMs,
        pulledClients: [],
        pulledMovements: [],
        pulledTransactions: [],
        retryQueuePending: queueStatus.pendingCount,
        message: 'Falha na sincronização direta (itens protegidos na Retry Queue): ' + (err?.message || 'Falha de rede'),
      };
    }
  },

  /**
   * Testa a conectividade com o Supabase compartilhado e aciona processamento da fila se online
   */
  async testConnectivity(): Promise<{ success: boolean; latencyMs: number; count: number; retryQueuePending: number; error?: string }> {
    const start = Date.now();
    const queueStatus = this.getRetryQueueStatus();
    try {
      const headers = getHeaders();
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/clients?select=id`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        const data = await res.json();
        // Conexão restabelecida: dispara o reprocessamento da fila
        this.processRetryQueue().catch(() => {});
        return {
          success: true,
          latencyMs,
          count: Array.isArray(data) ? data.length : 0,
          retryQueuePending: queueStatus.pendingCount,
        };
      }
      return { success: false, latencyMs, count: 0, retryQueuePending: queueStatus.pendingCount, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, latencyMs: Date.now() - start, count: 0, retryQueuePending: queueStatus.pendingCount, error: err?.message };
    }
  },
};

// Inicia escuta automática no navegador para disparar retry quando voltar online e a cada 15 segundos
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('[Supabase Retry Queue] Conexão restabelecida via evento online! Acionando fila...');
    SupabaseBridge.processRetryQueue().catch(() => {});
  });

  // Loop leve de reprocessamento em segundo plano a cada 15 segundos
  setInterval(() => {
    const status = SupabaseBridge.getRetryQueueStatus();
    if (status.pendingCount > 0 && !status.isProcessing) {
      SupabaseBridge.processRetryQueue().catch(() => {});
    }
  }, 15000);
}
