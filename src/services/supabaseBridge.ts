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

        // Tenta enviar com todos os campos; se der erro de coluna não encontrada, tenta sem colunas estendidas
        try {
          const upsertRes = await fetch(`${endpoint}?on_conflict=id`, {
            method: 'POST',
            headers: {
              ...headers,
              Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(rows),
            signal: AbortSignal.timeout(6000),
          });
          if (!upsertRes.ok) {
            const errText = await upsertRes.text();
            if (errText.includes('secondary_addresses') || errText.includes('column') || errText.includes('schema cache')) {
              // Fallback com campos base
              const basicRows = rows.map((r) => ({
                id: r.id,
                email: r.email,
                name: r.name,
                document: r.document,
                updated_at: r.updated_at,
              }));
              await fetch(`${endpoint}?on_conflict=id`, {
                method: 'POST',
                headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(basicRows),
                signal: AbortSignal.timeout(6000),
              }).catch(() => {});
            }
          }
        } catch (e: any) {
          console.warn('[Supabase Bridge] Upsert warning:', e?.message);
        }
      }

      // 2. Consulta clientes existentes no banco compartilhado com fallback resiliente
      let pulled: any[] = [];
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
        } else {
          // Fallback se select=* falhar por causa de schema cache ou colunas ausentes
          const fallbackRes = await fetch(`${endpoint}?select=id,email,name,document,updated_at`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (fallbackRes.ok) {
            const fbData = await fallbackRes.json();
            if (Array.isArray(fbData)) pulled = fbData;
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

      const rows = movements.slice(0, 50).map((m) => {
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
   * Consulta e recupera movimentações gravadas no Supabase compartilhado
   */
  async pullMovements(clientId = 'GX-CLI-0001'): Promise<any[]> {
    try {
      const headers = getHeaders();
      const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/movements?client_id=eq.${clientId}&order=created_at.desc`;
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
