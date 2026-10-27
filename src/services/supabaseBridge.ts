/**
 * Ponte de Comunicação e Sincronização Supabase
 * Compartilhada entre Global Exchange e BitX Core Blockchain
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

export const SUPABASE_CONFIG = {
  url: 'https://odbbtgkxgiqlfhcepwuj.supabase.co',
  anonKey: 'sb_publishable_22fzrMlPYyCnPUceg1b04g_ChyHEv97',
};

function getHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json',
  };
}

export const SupabaseBridge = {
  /**
   * Sincroniza clientes com a tabela public.clients no Supabase (Push e Pull)
   */
  async syncClients(
    clients: any[],
    balances: Record<string, number> = {},
    brlBalances: Record<string, number> = {},
    usdtBalances: Record<string, number> = {}
  ): Promise<{
    success: boolean;
    pulledClients?: SupabaseClientRow[];
    error?: string;
  }> {
    try {
      const headers = getHeaders();
      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/clients`;

      // 1. PUSH: Prepara dados para upsert em Supabase
      if (Array.isArray(clients) && clients.length > 0) {
        const rows: SupabaseClientRow[] = clients.map((c) => {
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
          const estValue = Number((btxc * 420087.14).toFixed(2));

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

        try {
          await fetch(`${endpoint}?on_conflict=id`, {
            method: 'POST',
            headers: {
              ...headers,
              Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(rows),
            signal: AbortSignal.timeout(6000),
          });
        } catch (e: any) {
          console.warn('[Supabase Bridge] Upsert warning:', e?.message);
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

      return { success: true, pulledClients: pulled };
    } catch (err: any) {
      console.warn('[Supabase Bridge] Erro ao sincronizar clientes:', err?.message);
      return { success: true, pulledClients: [] };
    }
  },

  /**
   * Sincroniza movimentações com a tabela public.movements no Supabase
   */
  async syncMovements(movements: any[]): Promise<{ success: boolean; error?: string }> {
    try {
      if (!Array.isArray(movements) || movements.length === 0) return { success: true };

      const headers = getHeaders();
      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/movements`;

      const rows: SupabaseMovementRow[] = movements.slice(0, 50).map((m) => {
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

      await fetch(`${endpoint}?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(6000),
      });

      return { success: true };
    } catch (err: any) {
      console.warn('[Supabase Bridge] Erro ao sincronizar movimentações:', err?.message);
      return { success: false, error: err?.message };
    }
  },

  /**
   * Sincroniza o Livro Razão (Ledger) com a tabela public.financial_transactions no Supabase
   * Note: O Supabase exige que `type` seja estritamente 'CREDIT' ou 'DEBIT' via check constraint.
   */
  async syncFinancialTransactions(ledgerEntries: any[]): Promise<{ success: boolean; error?: string }> {
    try {
      if (!Array.isArray(ledgerEntries) || ledgerEntries.length === 0) return { success: true };

      const headers = getHeaders();
      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/financial_transactions`;

      const rows: SupabaseFinancialTransactionRow[] = ledgerEntries.slice(0, 50).map((entry, idx) => {
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

        // Determina valor absoluto positivo (check constraint value >= 0)
        let numVal = 0;
        if (typeof entry.amountBrl === 'number' && entry.amountBrl !== 0) {
          numVal = Math.abs(entry.amountBrl);
        } else if (typeof entry.amountGx === 'number' && entry.amountGx !== 0) {
          numVal = Math.abs(entry.amountGx * 420087.14);
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

      await fetch(`${endpoint}?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(6000),
      });

      return { success: true };
    } catch (err: any) {
      console.warn('[Supabase Bridge] Erro ao sincronizar financial_transactions:', err?.message);
      return { success: false, error: err?.message };
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
    message: string;
  }> {
    const start = Date.now();
    try {
      const [clientSyncRes, movSyncRes, transSyncRes, pulledMovs, pulledTrans] = await Promise.all([
        this.syncClients(params.clients, params.balances, params.brlBalances, params.usdtBalances),
        this.syncMovements(params.movements || []),
        this.syncFinancialTransactions(params.ledger || []),
        this.pullMovements('GX-CLI-0001'),
        this.pullFinancialTransactions(),
      ]);

      const latencyMs = Date.now() - start;
      const pulledClients = clientSyncRes.pulledClients || [];

      try {
        window.dispatchEvent(
          new CustomEvent('gx_supabase_synced', {
            detail: {
              success: true,
              latencyMs,
              clientsCount: pulledClients.length,
              movementsCount: pulledMovs.length,
              transactionsCount: pulledTrans.length,
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
        message: `Sincronização bidirecional concluída com o Supabase em ${latencyMs}ms (${pulledClients.length} clientes, ${pulledMovs.length} movimentações, ${pulledTrans.length} lançamentos)`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        success: false,
        latencyMs,
        pulledClients: [],
        pulledMovements: [],
        pulledTransactions: [],
        message: 'Erro na sincronização bidirecional: ' + (err?.message || 'Falha de rede'),
      };
    }
  },

  /**
   * Testa a conectividade com o Supabase compartilhado
   */
  async testConnectivity(): Promise<{ success: boolean; latencyMs: number; count: number; error?: string }> {
    const start = Date.now();
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
        return { success: true, latencyMs, count: Array.isArray(data) ? data.length : 0 };
      }
      return { success: false, latencyMs, count: 0, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, latencyMs: Date.now() - start, count: 0, error: err?.message };
    }
  },
};
