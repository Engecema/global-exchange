/**
 * Ponte de Comunicação e Sincronização Supabase
 * Compartilhada entre Global Exchange e BitX Core Blockchain
 */

export interface SupabaseClientRow {
  id: string;
  email: string;
  name: string;
  document: string;
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
   * Sincroniza clientes com a tabela public.clients no Supabase
   */
  async syncClients(clients: any[], balances: Record<string, number> = {}, brlBalances: Record<string, number> = {}, usdtBalances: Record<string, number> = {}): Promise<{
    success: boolean;
    pulledClients?: SupabaseClientRow[];
    error?: string;
  }> {
    try {
      const headers = getHeaders();
      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/clients`;

      // 1. Prepara dados para upsert em Supabase
      if (Array.isArray(clients) && clients.length > 0) {
        const rows: SupabaseClientRow[] = clients.map((c) => {
          const email = (c.email || '').toLowerCase().trim();
          const btxc = balances[email] !== undefined ? Number(balances[email]) : (Number(c.balanceBtxc) || 0);
          const brl = brlBalances[email] !== undefined ? Number(brlBalances[email]) : (Number(c.balanceBrl) || 0);
          const usdt = usdtBalances[email] !== undefined ? Number(usdtBalances[email]) : (Number(c.balanceUsdt) || 0);
          const estValue = Number((btxc * 421081.54).toFixed(2));

          return {
            id: c.id || email,
            email,
            name: c.name || '',
            document: c.document || '',
            btxc_balance: btxc,
            gx_balance: btxc,
            brl_balance: brl,
            usdt_balance: usdt,
            bitx_address: c.bitxAddress || 'bxrt1qnkach2pvm79qljf5rxdg863utw4s0zey',
            status: c.kycStatus || 'Verificado KYC (Completo)',
            title_badge: 'Titular Principal',
            custody_txid: c.registrationTxid || '0x9891c2bfbee33952a01ce9a471b83d1e',
            estimated_market_value: estValue,
            updated_at: new Date().toISOString(),
          };
        });

        await fetch(`${endpoint}?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(rows),
          signal: AbortSignal.timeout(6000),
        }).catch((e) => console.warn('[Supabase Bridge] Upsert warning:', e?.message));
      }

      // 2. Consulta clientes existentes no banco compartilhado
      const res = await fetch(`${endpoint}?select=*`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return { success: true, pulledClients: data };
        }
      }

      return { success: true };
    } catch (err: any) {
      console.warn('[Supabase Bridge] Erro ao sincronizar clientes:', err?.message);
      return { success: false, error: err?.message };
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

      const rows = movements.slice(0, 50).map((m) => ({
        id: m.id || m.txid,
        client_id: (m.clientEmail || m.clientId || 'geonimatos31@hotmail.com').toLowerCase().trim(),
        type: m.type || 'DEPÓSITO BITX CORE',
        description: m.description || '',
        value: Number(m.value) || 0,
        created_at: m.createdAt || new Date().toISOString(),
      }));

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
