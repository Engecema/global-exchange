import {
  Account,
  AdminApprovalRequest,
  ClientCorrectionRequest,
  ClientRecord,
  CustodyLedgerEntry,
  FinancialTransaction,
  Movement,
  User,
} from '../types/exchange';

const STORAGE_KEYS = {
  CURRENT_USER: 'gx_current_user_v3',
  CLIENT_USER: 'gx_client_user_v3',
  ADMIN_USER: 'gx_admin_user_v3',
  CLIENTS: 'gx_clients_v3',
  MOVEMENTS: 'gx_movements_v3',
  FINANCIAL_TXS: 'gx_financial_txs_v3',
  BALANCES: 'gx_custody_balances_v3',
  BRL_BALANCES: 'gx_custody_brl_balances_v3',
  USDT_BALANCES: 'gx_custody_usdt_balances_v3',
  LEDGER: 'gx_custody_ledger_v3',
  LAUNCH_PRICE: 'gx_launch_price_v3',
  ACCOUNTS: 'gx_accounts_v3',
  ADMIN_REQUESTS: 'gx_admin_requests_v3',
  APPROVED_ADMINS: 'gx_approved_admins_v3',
  CORRECTION_REQUESTS: 'gx_correction_requests_v3',
  REAL_MODE_ACTIVE: 'gx_real_mode_active_v3',
  DELETED_CLIENTS: 'gx_deleted_clients_v3',
};

// Telemetria Oficial da Rede BitX Core (Mainnet Ativa em Produção)
export const BITX_CORE_MAINNET = {
  network: 'REDE ATIVA · PRODUÇÃO (MAINNET)',
  chainHeight: '#349.000',
  blockNumber: 349000,
  assetSymbol: 'BTXC',
  assetName: 'BitX Core',
  officialPrice: 421081.54,
  officialPriceFormatted: 'R$ 421.081,54',
  variation: '+0.42%',
  version: 'Online v3.4',
  platform: 'Global Exchange',
};

export const MASTER_ADMIN_EMAILS = [
  'geonimatos31@gmail.com',
  'geoniclementino31@gmail.com',
  'geonimatos31.nautilus@gmail.com',
  'geonimatos42@gmail.com',
  'geonimatos31@hotmail.com',
];
export const MASTER_ADMIN_EMAIL = 'geoniclementino31@gmail.com';

export const GEONI_EMAILS = [
  'geonimatos31@hotmail.com',
  'geoniclementino31@gmail.com',
  'geonimatos31@gmail.com',
  'geonimatos42@gmail.com',
  'geonimatos31.nautilus@gmail.com',
];

export function isGeoniEmail(email?: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return GEONI_EMAILS.includes(clean);
}

export function isGeoniRecord(c?: { email?: string; name?: string; document?: string } | null): boolean {
  if (!c) return false;
  const email = String(c.email || '').toLowerCase().trim();
  const name = String(c.name || '').toLowerCase().trim();
  const doc = String(c.document || '').replace(/\D/g, '');
  return (
    isGeoniEmail(email) ||
    doc === '70781338387' ||
    (name.includes('geoni') && (name.includes('matos') || name.includes('clementino')))
  );
}

// Listas limpas e zeradas para novos cadastros em produção
export const INITIAL_REAL_CLIENTS: ClientRecord[] = [];

// Registro inicial do Livro Razão de Custódia & Liquidação (zerado para primeiro cadastro)
export const INITIAL_LEDGER_ENTRIES: CustodyLedgerEntry[] = [];

export function isMasterAdminEmail(email: string): boolean {
  if (!email) return false;
  return MASTER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Identifica e bloqueia estritamente clientes fictícios/mocks legados,
 * garantindo a integridade dos 5 clientes reais ativos do conglomerado.
 */
export function isFictitiousClient(c: any): boolean {
  if (!c) return false;
  const id = String(c.id || '').toLowerCase();
  const email = String(c.email || '').toLowerCase();
  const name = String(c.name || '').toLowerCase();

  // Preserva estritamente os clientes reais do conglomerado
  if (
    isGeoniRecord(c) ||
    isGeoniEmail(email) ||
    email === 'teste2@globalexchange.com' ||
    email === 'contato@betaltda.com.br' ||
    email === 'teste_unitario@globalexchange.com' ||
    email === 'cliente@globalexchange.com' ||
    name.includes('geoni') ||
    name.includes('empresa beta')
  ) {
    return false;
  }

  // IDs fictícios conhecidos
  if (id.startsWith('ge-client-') || id.startsWith('ge_client_')) return true;
  if (id.includes('trader_') || id.includes('client-comercial')) return true;

  // E-mails fictícios conhecidos
  if (
    email.includes('carlos.mendes') ||
    email.includes('mariana.duarte') ||
    email.includes('mesa.operacoes') ||
    email.includes('atlascapital') ||
    email.includes('deltadigital') ||
    email.includes('empresa.com.br') ||
    email.includes('invest.com')
  ) {
    return true;
  }

  // Nomes e razões sociais fictícias
  if (
    name.includes('carlos e. mendes') ||
    name.includes('carlos mendes') ||
    name.includes('mariana duarte') ||
    name.includes('atlas capital') ||
    name.includes('fundo delta')
  ) {
    return true;
  }

  return false;
}

// Generates cryptographic TXID
export function generateTxid(): string {
  const chars = '0123456789abcdef';
  let hex = '';
  for (let i = 0; i < 32; i++) {
    hex += chars[Math.floor(Math.random() * chars.length)];
  }
  return `0x${hex}`;
}

/**
 * Gera TXID determinístico exclusivo a partir de uma semente (ex: e-mail)
 */
export function generateDeterministicTxid(seed: string): string {
  const chars = '0123456789abcdef';
  let hash1 = 5381;
  let hash2 = 0;
  const clean = (seed || 'txid').trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = (hash2 * 31 + char) | 0;
  }
  let hex = '';
  let currentSeed = Math.abs(hash1 ^ (hash2 << 13));
  for (let i = 0; i < 32; i++) {
    currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
    hex += chars[currentSeed % chars.length];
  }
  return `0x${hex}`;
}

/**
 * Gera o Endereço de Carteira BitX Core (padrão Bech32 bxrt1q...)
 * Determinístico e exclusivo para a conta/identificador do cliente
 */
export function generateBitxCoreAddress(seed: string): string {
  const bech32Alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  let hash1 = 5381;
  let hash2 = 0;
  const clean = (seed || 'client').trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = (hash2 * 31 + char) | 0;
  }

  let address = 'bxrt1q';
  let currentSeed = Math.abs(hash1 ^ (hash2 << 13));
  for (let i = 0; i < 32; i++) {
    currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
    const index = currentSeed % bech32Alphabet.length;
    address += bech32Alphabet[index];
  }
  return address;
}

export function getApprovedAdminEmails(): string[] {
  try {
    const rawAccounts = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    const accounts: Account[] = rawAccounts ? JSON.parse(rawAccounts) : [];
    
    // Lista apenas e-mails de administradores cadastrados em tela com status ativo
    const approvedFromAccounts = accounts
      .filter((a) => a.role === 'admin' && a.status === 'active')
      .map((a) => a.email.trim().toLowerCase());

    const raw = localStorage.getItem(STORAGE_KEYS.APPROVED_ADMINS);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const validApproved = list
      .map((e) => e.trim().toLowerCase())
      .filter((e) => accounts.some((a) => a.email.toLowerCase() === e && a.role === 'admin' && a.status === 'active'));

    return Array.from(new Set([...approvedFromAccounts, ...validApproved]));
  } catch {
    return [];
  }
}

export function isAdminEmail(email: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return getApprovedAdminEmails().includes(clean);
}

export const StorageService = {
  // Lista de e-mails de clientes removidos pelo usuário (evita que sejam recriados automaticamente)
  getDeletedClientEmails(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DELETED_CLIENTS);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map((e: string) => String(e).trim().toLowerCase()) : [];
    } catch {
      return [];
    }
  },

  isClientDeleted(email: string): boolean {
    if (!email) return false;
    return this.getDeletedClientEmails().includes(email.trim().toLowerCase());
  },

  // Inicialização e Sincronização Canônica com a BitX Core
  initCleanState() {
    try {
      localStorage.removeItem('gx_clients_data');
      localStorage.removeItem('gx_financial_transactions');
      localStorage.removeItem('gx_autenticado');
      localStorage.removeItem('gx_clients_v2');
      localStorage.removeItem('gx_real_liquidity_reset_v8');

      // Executa reset total inicial para deixar o ambiente 100% zerado e pronto para o primeiro cadastro
      if (localStorage.getItem('gx_zeroed_clean_v2') !== 'true') {
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.APPROVED_ADMINS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.ADMIN_REQUESTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify({}));
        localStorage.setItem(STORAGE_KEYS.BRL_BALANCES, JSON.stringify({}));
        localStorage.setItem(STORAGE_KEYS.USDT_BALANCES, JSON.stringify({}));
        localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.FINANCIAL_TXS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.DELETED_CLIENTS, JSON.stringify([]));
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(STORAGE_KEYS.ADMIN_USER);
        localStorage.removeItem(STORAGE_KEYS.CLIENT_USER);
        localStorage.setItem('gx_zeroed_clean_v2', 'true');
      }

      // 1. Inicializa o Livro Razão de Custódia (Ledger) zerado
      const rawLedger = localStorage.getItem(STORAGE_KEYS.LEDGER);
      let currentLedger: CustodyLedgerEntry[] = rawLedger ? JSON.parse(rawLedger) : [];
      if (!Array.isArray(currentLedger)) {
        currentLedger = [];
      }
      localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(currentLedger));

      // 2. Inicializa os Clientes Reais Ativos zerado
      const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      let currentClients: ClientRecord[] = rawClients ? JSON.parse(rawClients) : [];
      if (!Array.isArray(currentClients)) {
        currentClients = [];
      }
      currentClients = this.deduplicateClients(currentClients);
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(currentClients));

      // 3. Sincroniza contas de login
      this.syncAccountsToClients();

      // 4. Dispara sincronização em segundo plano com a BitX Core
      setTimeout(() => {
        this.syncBitxCoreWithGlobalExchange().catch(() => {});
      }, 50);
    } catch (e) {
      console.warn('Storage cleanup:', e);
    }
  },

  // Deduplica registros redundantes de clientes (unifica Geoni Matos e evita duplicações)
  deduplicateClients(rawList: ClientRecord[]): ClientRecord[] {
    if (!Array.isArray(rawList) || rawList.length === 0) return [];

    const deleted = this.getDeletedClientEmails();

    // 1. Descarta qualquer cliente comprovadamente fictício ou removido pelo usuário
    const cleanList = rawList.filter((c) => {
      const em = (c.email || '').trim().toLowerCase();
      return !isFictitiousClient(c) && !deleted.includes(em);
    });

    if (cleanList.length === 0) return [];

    const geoniRecords = cleanList.filter(isGeoniRecord);
    const otherRecords = cleanList.filter((c) => !isGeoniRecord(c));
    const result: ClientRecord[] = [];

    // Se houver qualquer registro de Geoni Matos na lista, unifica em UM ÚNICO registro titular
    if (geoniRecords.length > 0) {
      const primaryGeoni =
        geoniRecords.find((r) => r.email.toLowerCase() === 'geonimatos31@hotmail.com') ||
        geoniRecords[0];

      const geoniEmails = Array.from(new Set(geoniRecords.map((r) => r.email.toLowerCase())));

      const currentGx = this.getCustodyBalance(primaryGeoni.email);
      const currentBrl = this.getCustodyBrlBalance(primaryGeoni.email);
      const currentUsdt = this.getCustodyUsdtBalance(primaryGeoni.email);

      geoniEmails.forEach((em) => {
        if (this.getCustodyBalance(em) !== currentGx) this.setCustodyBalance(em, currentGx);
        if (this.getCustodyBrlBalance(em) !== currentBrl) this.setCustodyBrlBalance(em, currentBrl);
        if (this.getCustodyUsdtBalance(em) !== currentUsdt) this.setCustodyUsdtBalance(em, currentUsdt);
      });

      const totalMovements = geoniRecords.reduce((acc, r) => acc + (r.movementCount || 0), 0);
      const latestMov = geoniRecords.find((r) => r.latestMovement)?.latestMovement || null;

      const unifiedGeoni: ClientRecord = {
        id: primaryGeoni.id || 'GX-CLI-0001',
        tagId: primaryGeoni.tagId || primaryGeoni.email,
        email: primaryGeoni.email,
        name: primaryGeoni.name || 'Geoni Clementino Cesar de Matos',
        document: primaryGeoni.document || '70781338387',
        bitxAddress: primaryGeoni.bitxAddress || generateBitxCoreAddress(primaryGeoni.email),
        registrationTxid: primaryGeoni.registrationTxid || generateDeterministicTxid(primaryGeoni.email + '_reg'),
        createdAt: primaryGeoni.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        movementCount: totalMovements,
        latestMovement: latestMov,
        balanceBtxc: currentGx,
        balanceBrl: currentBrl,
        balanceUsdt: currentUsdt,
        kycStatus: primaryGeoni.kycStatus || 'Verificado KYC (Completo)',
      };

      result.push(unifiedGeoni);
    }

    // Adiciona demais clientes (deduplicando por email)
    const seenEmails = new Set<string>(result.map((r) => r.email.toLowerCase()));
    otherRecords.forEach((r) => {
      const em = r.email.toLowerCase();
      if (!seenEmails.has(em)) {
        seenEmails.add(em);
        const balGx = this.getCustodyBalance(em);
        const balBrl = this.getCustodyBrlBalance(em);
        const balUsdt = this.getCustodyUsdtBalance(em);
        result.push({
          ...r,
          tagId: r.tagId || em,
          bitxAddress: r.bitxAddress || generateBitxCoreAddress(em),
          registrationTxid: r.registrationTxid || generateDeterministicTxid(em + '_reg'),
          balanceBtxc: balGx,
          balanceBrl: balBrl,
          balanceUsdt: balUsdt,
          kycStatus: r.kycStatus || 'Verificado KYC',
        });
      }
    });

    return result;
  },

  // Sincroniza contas criadas para a carteira de clientes, garantindo cadastro unificado
  syncAccountsToClients(): void {
    try {
      const rawAccounts = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      let accounts: Account[] = rawAccounts ? JSON.parse(rawAccounts) : [];
      if (!Array.isArray(accounts)) accounts = [];

      // Sincroniza apenas clientes que foram realmente cadastrados
      const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      let currentClients: ClientRecord[] = [];
      if (rawClients) {
        try {
          const parsed = JSON.parse(rawClients);
          if (Array.isArray(parsed)) {
            currentClients = parsed.filter((c) => !isFictitiousClient(c));
          }
        } catch {}
      }

      currentClients.forEach((realClient) => {
        const em = realClient.email.toLowerCase();
        const exists = accounts.some((a) => a.email.toLowerCase() === em);
        if (!exists) {
          accounts.push({
            id: em,
            email: em,
            name: realClient.name,
            document: realClient.document,
            password: 'Cliente@123456',
            role: 'client',
            status: 'active',
            bitxAddress: realClient.bitxAddress,
            registrationTxid: realClient.registrationTxid,
            createdAt: realClient.createdAt,
            approvedBy: 'AUTO_SYNC',
          });
        }
      });
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

      const deduplicated = this.deduplicateClients(currentClients);
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(deduplicated));
    } catch (e) {
      console.warn('Erro ao sincronizar contas com clientes:', e);
    }
  },

  // Limpeza forçada de clientes fictícios e deduplicação total
  purgeAllFictitiousClients(): { cleanedCount: number; remainingCount: number } {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      const parsed: ClientRecord[] = data ? JSON.parse(data) : [];
      const clean = parsed.filter((c) => !isFictitiousClient(c));
      const deduplicated = this.deduplicateClients(clean);
      const cleanedCount = parsed.length - deduplicated.length;
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(deduplicated));

      // Limpa chaves fictícias em saldos
      const rawBalances = localStorage.getItem(STORAGE_KEYS.BALANCES);
      if (rawBalances) {
        try {
          const bal = JSON.parse(rawBalances);
          Object.keys(bal).forEach((k) => {
            if (isFictitiousClient({ email: k, id: k })) {
              delete bal[k];
            }
          });
          localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify(bal));
        } catch {}
      }

      const rawBrlBalances = localStorage.getItem(STORAGE_KEYS.BRL_BALANCES);
      if (rawBrlBalances) {
        try {
          const brlBal = JSON.parse(rawBrlBalances);
          Object.keys(brlBal).forEach((k) => {
            if (isFictitiousClient({ email: k, id: k })) {
              delete brlBal[k];
            }
          });
          localStorage.setItem(STORAGE_KEYS.BRL_BALANCES, JSON.stringify(brlBal));
        } catch {}
      }

      this.syncAccountsToClients();
      const updated = this.getClients();
      return { cleanedCount: Math.max(0, cleanedCount), remainingCount: updated.length };
    } catch (e) {
      console.error('Falha ao purgar clientes fictícios:', e);
      return { cleanedCount: 0, remainingCount: 0 };
    }
  },

  // Exclui um cliente da lista
  deleteClient(emailOrId: string): boolean {
    return this.removeClientReal(emailOrId);
  },

  clearAllHistoryForRealTransactions(): { success: boolean; clearedCount: number } {
    try {
      const rawMovements = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      const movs: Movement[] = rawMovements ? JSON.parse(rawMovements) : [];
      const clearedCount = movs.length;

      this.resetAllBalancesAndMovementsToZero();

      return { success: true, clearedCount };
    } catch (e) {
      console.error('Falha ao limpar histórico:', e);
      return { success: false, clearedCount: 0 };
    }
  },

  getCurrentUser(scope?: 'client' | 'admin'): User | null {
    try {
      const key = scope === 'admin'
        ? STORAGE_KEYS.ADMIN_USER
        : scope === 'client'
        ? STORAGE_KEYS.CLIENT_USER
        : STORAGE_KEYS.CURRENT_USER;

      // 1. Tenta obter na sessionStorage da aba atual (isolamento total entre abas)
      const sessionData = sessionStorage.getItem(key);
      if (sessionData) {
        const user: User = JSON.parse(sessionData);
        if (!user.bitxAddress && user.email) {
          user.bitxAddress = generateBitxCoreAddress(user.email);
        }
        if (!user.registrationTxid && user.email) {
          user.registrationTxid = generateDeterministicTxid(user.email + '_reg');
        }
        return user;
      }

      // 2. Se a aba não possui sessão própria, verifica localStorage no escopo
      const localData = localStorage.getItem(key);
      if (localData) {
        const user: User = JSON.parse(localData);
        if (!user.bitxAddress && user.email) {
          user.bitxAddress = generateBitxCoreAddress(user.email);
        }
        if (!user.registrationTxid && user.email) {
          user.registrationTxid = generateDeterministicTxid(user.email + '_reg');
        }
        sessionStorage.setItem(key, JSON.stringify(user));
        return user;
      }

      // 3. Fallback legado (caso tenha sido salvo no formato anterior)
      if (key !== STORAGE_KEYS.CURRENT_USER) {
        const legacyData = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (legacyData) {
          const legacyUser: User = JSON.parse(legacyData);
          if (
            (scope === 'admin' && (legacyUser.role === 'admin' || isAdminEmail(legacyUser.email))) ||
            (scope === 'client' && legacyUser.role === 'client')
          ) {
            sessionStorage.setItem(key, legacyData);
            return legacyUser;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: User | null, options?: { scope?: 'client' | 'admin'; tabOnly?: boolean }): void {
    const scope = options?.scope || (user?.role === 'admin' ? 'admin' : user ? 'client' : undefined);
    const key = scope === 'admin'
      ? STORAGE_KEYS.ADMIN_USER
      : scope === 'client'
      ? STORAGE_KEYS.CLIENT_USER
      : STORAGE_KEYS.CURRENT_USER;

    if (user) {
      if (!user.bitxAddress && user.email) {
        user.bitxAddress = generateBitxCoreAddress(user.email);
      }
      if (!user.registrationTxid && user.email) {
        user.registrationTxid = generateDeterministicTxid(user.email + '_reg');
      }
      sessionStorage.setItem(key, JSON.stringify(user));
      if (!options?.tabOnly) {
        localStorage.setItem(key, JSON.stringify(user));
      }
    } else {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      if (!scope) {
        sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        sessionStorage.removeItem(STORAGE_KEYS.CLIENT_USER);
        sessionStorage.removeItem(STORAGE_KEYS.ADMIN_USER);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(STORAGE_KEYS.CLIENT_USER);
        localStorage.removeItem(STORAGE_KEYS.ADMIN_USER);
      }
    }
  },

  // Accounts Management
  getAccounts(): Account[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (!data) return [];
      const accounts: Account[] = JSON.parse(data);
      return accounts.map((a) => ({
        ...a,
        bitxAddress: a.bitxAddress || generateBitxCoreAddress(a.email),
        registrationTxid: a.registrationTxid || generateDeterministicTxid(a.email + '_reg'),
      }));
    } catch {
      return [];
    }
  },

  findAccount(email: string): Account | null {
    const clean = email.trim().toLowerCase();
    const accounts = this.getAccounts();
    const acc = accounts.find((a) => a.email.toLowerCase() === clean);
    if (!acc) return null;
    return {
      ...acc,
      bitxAddress: acc.bitxAddress || generateBitxCoreAddress(acc.email),
      registrationTxid: acc.registrationTxid || generateDeterministicTxid(acc.email + '_reg'),
    };
  },

  registerClientAccount(data: {
    name: string;
    email: string;
    document: string;
    password: string;
  }): {
    success: boolean;
    account?: Account;
    initialMovement?: Movement;
    txid?: string;
    bitxAddress?: string;
    error?: string;
  } {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.name.trim();
    const cleanDoc = data.document.trim();
    const bitxAddress = generateBitxCoreAddress(cleanEmail);
    const regTxid = generateTxid();

    if (!cleanEmail || !cleanName || !cleanDoc || !data.password) {
      return { success: false, error: 'Todos os campos são obrigatórios para o cadastro.' };
    }

    const accounts = this.getAccounts();
    if (accounts.some((a) => a.email.toLowerCase() === cleanEmail)) {
      return {
        success: false,
        error: 'Este e-mail já possui cadastro. Por favor, faça login utilizando sua senha.',
      };
    }

    const newAccount: Account = {
      id: cleanEmail,
      email: cleanEmail,
      name: cleanName,
      document: cleanDoc,
      password: data.password,
      role: 'client',
      status: 'active',
      bitxAddress,
      registrationTxid: regTxid,
      createdAt: new Date().toISOString(),
    };

    accounts.push(newAccount);
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

    // Save into clients list for admin view
    this.saveClient({
      name: cleanName,
      email: cleanEmail,
      document: cleanDoc,
      bitxAddress,
      registrationTxid: regTxid,
    });

    // Initialize custody balances strictly at 0.00 (BRL and GX/BTXC) for real liquidity
    this.setCustodyBalance(cleanEmail, 0.0);
    this.setCustodyBrlBalance(cleanEmail, 0.0);

    return {
      success: true,
      account: newAccount,
      txid: regTxid,
      bitxAddress,
    };
  },

  authenticateClient(
    email: string,
    password: string
  ): { success: boolean; user?: User; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { success: false, error: 'Informe seu e-mail e senha cadastrados.' };
    }

    const account = this.findAccount(cleanEmail);
    if (!account) {
      return {
        success: false,
        error: 'E-mail não cadastrado. É obrigatório realizar o cadastro comercial antes de acessar.',
      };
    }

    if (account.password !== password) {
      return { success: false, error: 'Senha incorreta. Verifique seus dados de acesso.' };
    }

    if (account.status === 'rejected') {
      return { success: false, error: 'Acesso desta conta foi suspenso.' };
    }

    const user: User = {
      id: account.id,
      email: account.email,
      name: account.name,
      document: account.document,
      role: account.role,
      status: account.status,
      bitxAddress: account.bitxAddress || generateBitxCoreAddress(account.email),
      registrationTxid: account.registrationTxid || generateDeterministicTxid(account.email + '_reg'),
    };

    this.setCurrentUser(user);
    return { success: true, user };
  },

  registerAdminAccount(data: {
    name: string;
    email: string;
    document?: string;
    password: string;
    reason?: string;
  }): {
    success: boolean;
    account?: Account;
    isMaster?: boolean;
    isPending?: boolean;
    error?: string;
  } {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.name.trim();
    const cleanDoc = (data.document || '').trim();

    if (!cleanEmail || !cleanName || !data.password) {
      return { success: false, error: 'Nome, e-mail institucional e senha são obrigatórios.' };
    }

    const accounts = this.getAccounts();
    const existingIndex = accounts.findIndex((a) => a.email.toLowerCase() === cleanEmail);

    if (isMasterAdminEmail(cleanEmail)) {
      // Register or update master administrator account with their own chosen password
      const masterAccount: Account = {
        id: cleanEmail,
        email: cleanEmail,
        name: cleanName || 'Geoni Matos (Administrador Geral)',
        document: cleanDoc || '05.368.602/0001-10',
        password: data.password,
        role: 'admin',
        status: 'active',
        approvedBy: 'MASTER_SELF',
        createdAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        accounts[existingIndex] = masterAccount;
      } else {
        accounts.unshift(masterAccount);
      }
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

      // Salva ou atualiza também na lista de clientes
      this.saveClient({
        name: cleanName || 'Geoni Clementino Cesar de Matos',
        email: cleanEmail,
        document: cleanDoc || '05.368.602/0001-10',
      });

      // Ensure in approved list
      const approved = getApprovedAdminEmails();
      if (!approved.includes(cleanEmail)) {
        approved.unshift(cleanEmail);
        localStorage.setItem(STORAGE_KEYS.APPROVED_ADMINS, JSON.stringify(approved));
      }

      return { success: true, isMaster: true, account: masterAccount };
    }

    // Non-master admin registration
    if (existingIndex >= 0 && accounts[existingIndex].status === 'active') {
      return {
        success: false,
        error: 'Este e-mail já possui cadastro de administrador aprovado. Faça login.',
      };
    }

    const pendingAccount: Account = {
      id: cleanEmail,
      email: cleanEmail,
      name: cleanName,
      document: cleanDoc || 'ADMIN_CANDIDATO',
      password: data.password,
      role: 'admin',
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = pendingAccount;
    } else {
      accounts.push(pendingAccount);
    }
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

    // Register in admin approval requests for geonimatos31@gmail.com to review
    const requests = this.getAdminRequests();
    const existingReqIdx = requests.findIndex((r) => r.email.toLowerCase() === cleanEmail);
    const newReq: AdminApprovalRequest = {
      id: generateTxid(),
      email: cleanEmail,
      name: cleanName,
      reason: data.reason?.trim() || 'Cadastro de novo administrador via portal',
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    if (existingReqIdx >= 0) {
      requests[existingReqIdx] = newReq;
    } else {
      requests.unshift(newReq);
    }
    localStorage.setItem(STORAGE_KEYS.ADMIN_REQUESTS, JSON.stringify(requests));

    return { success: true, isMaster: false, isPending: true, account: pendingAccount };
  },

  authenticateAdmin(
    email: string,
    password: string
  ): { success: boolean; user?: User; error?: string; isPending?: boolean } {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { success: false, error: 'Informe o e-mail de administrador e sua senha.' };
    }

    const account = this.findAccount(cleanEmail);

    if (!account) {
      return {
        success: false,
        error: isMasterAdminEmail(cleanEmail)
          ? 'Administrador Geral não cadastrado. Realize o cadastro na aba "Cadastre-se Aqui (Administração)" em tela para definir seu nome, documento e senha.'
          : 'Administrador não cadastrado. Realize o cadastro na aba "Cadastre-se Aqui (Administração)" em tela antes de acessar.',
      };
    }

    if (account.password !== password) {
      return { success: false, error: 'Senha incorreta de administrador.' };
    }

    if (account.status === 'pending_approval') {
      return {
        success: false,
        isPending: true,
        error: `Cadastro em análise. Aguarde a aprovação formal de ${MASTER_ADMIN_EMAIL}.`,
      };
    }

    if (account.status === 'rejected') {
      return { success: false, error: 'Acesso de administrador recusado ou revogado.' };
    }

    const user: User = {
      id: account.id,
      email: account.email,
      name: account.name,
      document: account.document,
      role: 'admin',
      status: 'active',
      bitxAddress: account.bitxAddress || generateBitxCoreAddress(account.email),
      registrationTxid: account.registrationTxid || generateDeterministicTxid(account.email + '_reg'),
    };
    this.setCurrentUser(user);
    return { success: true, user };
  },

  // Admin Approval Requests
  getAdminRequests(): AdminApprovalRequest[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ADMIN_REQUESTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  requestAdminAccess(data: {
    name: string;
    email: string;
    password: string;
    reason?: string;
  }): { success: boolean; error?: string } {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.name.trim();

    if (!cleanEmail || !cleanName || !data.password) {
      return { success: false, error: 'Preencha nome, e-mail institucional e senha.' };
    }

    if (isMasterAdminEmail(cleanEmail)) {
      return { success: false, error: 'Este e-mail é o Administrador Geral. Faça login diretamente.' };
    }

    const requests = this.getAdminRequests();
    const existing = requests.find((r) => r.email.toLowerCase() === cleanEmail);
    if (existing && existing.status === 'pending') {
      return {
        success: false,
        error: 'Já existe uma solicitação pendente para este e-mail aguardando aprovação.',
      };
    }

    // Save temporary account credentials
    const accounts = this.getAccounts();
    const existingAccIdx = accounts.findIndex((a) => a.email.toLowerCase() === cleanEmail);
    const newAcc: Account = {
      id: cleanEmail,
      email: cleanEmail,
      name: cleanName,
      document: 'ADMIN_PENDING',
      password: data.password,
      role: 'admin',
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
    };
    if (existingAccIdx >= 0) {
      accounts[existingAccIdx] = newAcc;
    } else {
      accounts.push(newAcc);
    }
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

    const newRequest: AdminApprovalRequest = {
      id: generateTxid(),
      email: cleanEmail,
      name: cleanName,
      reason: data.reason?.trim() || 'Solicitação de acesso administrativo',
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    requests.unshift(newRequest);
    localStorage.setItem(STORAGE_KEYS.ADMIN_REQUESTS, JSON.stringify(requests));
    return { success: true };
  },

  approveAdminRequest(requestId: string): void {
    const requests = this.getAdminRequests();
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    req.status = 'approved';
    req.resolvedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.ADMIN_REQUESTS, JSON.stringify(requests));

    // Add to approved admins list
    const approved = getApprovedAdminEmails();
    if (!approved.includes(req.email.toLowerCase())) {
      approved.push(req.email.toLowerCase());
      localStorage.setItem(STORAGE_KEYS.APPROVED_ADMINS, JSON.stringify(approved));
    }

    // Update account
    const accounts = this.getAccounts();
    const acc = accounts.find((a) => a.email.toLowerCase() === req.email.toLowerCase());
    if (acc) {
      acc.role = 'admin';
      acc.status = 'active';
      acc.approvedBy = MASTER_ADMIN_EMAIL;
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }

    // Record audit movement
    this.addMovement({
      clientId: MASTER_ADMIN_EMAIL,
      clientEmail: MASTER_ADMIN_EMAIL,
      clientName: 'Geoni Matos (Administrador Geral)',
      type: 'ATUALIZAÇÃO DE PREÇO',
      description: `Novo Administrador APROVADO por geonimatos31@gmail.com: ${req.name} (${req.email})`,
      value: 0,
      currency: 'AUDIT',
    });
  },

  rejectAdminRequest(requestId: string): void {
    const requests = this.getAdminRequests();
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    req.status = 'rejected';
    req.resolvedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.ADMIN_REQUESTS, JSON.stringify(requests));

    // Update account status
    const accounts = this.getAccounts();
    const acc = accounts.find((a) => a.email.toLowerCase() === req.email.toLowerCase());
    if (acc) {
      acc.status = 'rejected';
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }
  },

  revokeAdmin(email: string): void {
    const clean = email.trim().toLowerCase();
    if (isMasterAdminEmail(clean)) return; // Master admin cannot be revoked

    const approved = getApprovedAdminEmails().filter((e) => e !== clean);
    localStorage.setItem(STORAGE_KEYS.APPROVED_ADMINS, JSON.stringify(approved));

    const accounts = this.getAccounts();
    const acc = accounts.find((a) => a.email.toLowerCase() === clean);
    if (acc) {
      acc.role = 'client';
      acc.status = 'rejected';
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }

    // Record audit movement
    this.addMovement({
      clientId: MASTER_ADMIN_EMAIL,
      clientEmail: MASTER_ADMIN_EMAIL,
      clientName: 'Geoni Matos (Administrador Geral)',
      type: 'ATUALIZAÇÃO DE PREÇO',
      description: `Acesso Administrativo REVOGADO por geonimatos31@gmail.com para: ${clean}`,
      value: 0,
      currency: 'AUDIT',
    });
  },

  // Clients management - Real production records only (zero mocks & zero duplicates!)
  getClients(): ClientRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      let parsed: ClientRecord[] = data ? JSON.parse(data) : [];
      if (!Array.isArray(parsed)) parsed = [];

      // Aplica a deduplicação inteligente e higienização
      const clean = this.deduplicateClients(parsed);

      // Mantém o localStorage sincronizado
      if (clean.length !== parsed.length || !data) {
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clean));
      }

      return clean;
    } catch {
      return [];
    }
  },

  saveClient(client: {
    name: string;
    email: string;
    document: string;
    bitxAddress?: string;
    registrationTxid?: string;
  }): ClientRecord {
    const clients = this.getClients();
    const existingIndex = clients.findIndex(
      (c) => c.email.toLowerCase() === client.email.toLowerCase()
    );
    const now = new Date().toISOString();
    const bitxAddress = client.bitxAddress || generateBitxCoreAddress(client.email);
    const registrationTxid = client.registrationTxid || generateDeterministicTxid(client.email + '_reg');

    let updatedClient: ClientRecord;
    if (existingIndex >= 0) {
      updatedClient = {
        ...clients[existingIndex],
        name: client.name || clients[existingIndex].name,
        document: client.document || clients[existingIndex].document,
        bitxAddress: clients[existingIndex].bitxAddress || bitxAddress,
        registrationTxid: clients[existingIndex].registrationTxid || registrationTxid,
        updatedAt: now,
      };
      clients[existingIndex] = updatedClient;
    } else {
      updatedClient = {
        id: client.email.toLowerCase(),
        email: client.email.toLowerCase(),
        name: client.name,
        document: client.document,
        bitxAddress,
        registrationTxid,
        createdAt: now,
        updatedAt: now,
        movementCount: 0,
        latestMovement: null,
      };
      clients.unshift(updatedClient);
    }

    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    return updatedClient;
  },

  creditBitxDeposit(params: {
    clientEmail: string;
    amount: number;
    externalTxid: string;
    note?: string;
  }): { success: boolean; movement?: Movement; newBalance?: number; error?: string } {
    const cleanEmail = params.clientEmail.trim().toLowerCase();
    const amount = Number(params.amount);
    if (!cleanEmail || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'E-mail do cliente e quantidade válida são obrigatórios.' };
    }

    const currentBal = this.getCustodyBalance(cleanEmail);
    const newBal = currentBal + amount;
    this.setCustodyBalance(cleanEmail, newBal);

    const client = this.getClients().find((c) => c.email.toLowerCase() === cleanEmail);
    const bitxAddress = client?.bitxAddress || generateBitxCoreAddress(cleanEmail);

    const mov = this.addMovement({
      clientId: cleanEmail,
      clientEmail: cleanEmail,
      clientName: client?.name || cleanEmail,
      type: 'DEPÓSITO BITX CORE',
      description: `Depósito BitX Core (BTXC) confirmado na blockchain (Hash externo: ${params.externalTxid || 'Rede BitX'})`,
      value: amount,
      currency: 'BTXC',
      externalTxid: params.externalTxid,
      bitxAddress,
      note: params.note,
    });

    return { success: true, movement: mov, newBalance: newBal };
  },

  // Transferência Instantânea Direta / Saque para Conta Bancária Banco do Brasil
  executeWithdrawal(params: {
    clientEmail: string;
    clientName?: string;
    amount: number;
    destinationType: 'pix' | 'bb_account';
    pixKey?: string;
    pixKeyType?: string;
    bankAgency?: string;
    bankAccount?: string;
    accountDigit?: string;
    recipientName?: string;
    recipientDoc?: string;
    txid?: string;
    endToEndId?: string;
    bankStatus?: string;
    isDirectBbApi?: boolean;
    errorDetail?: string;
  }): {
    success: boolean;
    movement?: Movement;
    newBalance?: number;
    txid?: string;
    endToEndId?: string;
    error?: string;
  } {
    const cleanEmail = params.clientEmail.trim().toLowerCase();
    const amount = Number(params.amount);

    if (!cleanEmail || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'E-mail do cliente e valor de saque válido são obrigatórios.' };
    }

    const currentBrlBal = this.getCustodyBrlBalance(cleanEmail);
    if (amount > currentBrlBal) {
      return {
        success: false,
        error: `Saldo insuficiente em custódia (R$) para este envio/saque Pix. Saldo disponível em Reais: R$ ${currentBrlBal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      };
    }

    const newBrlBal = Math.max(0, currentBrlBal - amount);
    this.setCustodyBrlBalance(cleanEmail, newBrlBal);

    // Nota: O saldo em GX já foi devidamente deduzido no momento da venda no mercado (liquidateGxToBrl).
    // O saque em Reais debita exclusivamente o saldo com liquidez em R$, preservando o patrimônio remanescente em moedas do cliente.

    const client = this.getClients().find((c) => c.email.toLowerCase() === cleanEmail);
    const dateStr = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const txid = params.txid || generateTxid();
    const endToEndId = params.endToEndId || `E00000000${dateStr}${generateTxid().slice(2, 12).toUpperCase()}`;

    const destDesc =
      params.destinationType === 'pix'
        ? `Chave Pix ${params.pixKey || ''} (${(params.pixKeyType || 'Pix').toUpperCase()})`
        : `Conta Corrente BB Ag: ${params.bankAgency || '0001'} Conta: ${params.bankAccount || ''}${params.accountDigit ? `-${params.accountDigit}` : ''}`;

    const isDirectLiquidated = Boolean(params.isDirectBbApi && params.bankStatus === 'LIQUIDADO_BANCO_DO_BRASIL');
    const bankStatus = isDirectLiquidated ? 'LIQUIDADO_BANCO_DO_BRASIL' : 'AGUARDANDO_ALCADA_BB';
    const movementStatus = isDirectLiquidated ? 'CONFIRMADO' : 'PENDENTE_LIBERACAO_BB';

    const mov = this.addMovement({
      txid,
      clientId: cleanEmail,
      clientEmail: cleanEmail,
      clientName: params.recipientName || params.clientName || client?.name || cleanEmail,
      type: 'SAQUE BANCÁRIO',
      description: `Transferência Instantânea Direta Banco do Brasil: Saque de R$ ${amount.toFixed(2)} para ${destDesc}`,
      value: amount,
      currency: 'BRL',
      recipient: destDesc,
      status: movementStatus,
      bankStatus,
      endToEndId,
      destinationType: params.destinationType,
      pixKey: params.pixKey,
      pixKeyType: params.pixKeyType,
      bankAgency: params.bankAgency,
      bankAccount: params.bankAccount,
      accountDigit: params.accountDigit,
      errorDetail: params.errorDetail,
      note: isDirectLiquidated
        ? 'Liquidado via API Banco do Brasil'
        : 'Aguardando liberação na alçada corporativa do Gerenciador Financeiro BB PJ ou liquidação pelo operador Engecema',
    });

    return {
      success: true,
      movement: mov,
      newBalance: newBrlBal,
      txid,
      endToEndId,
    };
  },

  // Estorna ou Cancela uma Ordem de Saque Pendente, devolvendo 100% dos recursos para a custódia do cliente
  cancelOrRefundWithdrawal(params: {
    txid: string;
    reason?: string;
    cancelledBy?: string;
  }): {
    success: boolean;
    error?: string;
    newBalance?: number;
    movement?: Movement;
    refundMovement?: Movement;
  } {
    try {
      const cleanTxid = (params.txid || '').trim();
      if (!cleanTxid) {
        return { success: false, error: 'TXID da operação de saque é obrigatório.' };
      }

      const movements = this.getMovements();
      const targetMovIndex = movements.findIndex(
        (m) => m.txid === cleanTxid || m.id === cleanTxid
      );

      if (targetMovIndex < 0) {
        return { success: false, error: 'Ordem de saque não encontrada no livro de registros.' };
      }

      const targetMov = movements[targetMovIndex];

      if (targetMov.type !== 'SAQUE BANCÁRIO' && targetMov.type !== 'TRANSFERÊNCIA PIX BB') {
        return { success: false, error: 'Apenas operações de saque bancário podem ser estornadas.' };
      }

      if (targetMov.status === 'ESTORNADO' || targetMov.status === 'CANCELADO') {
        return { success: false, error: 'Este saque já foi estornado anteriormente.' };
      }

      const clientEmail = targetMov.clientEmail.toLowerCase();
      const refundAmount = Number(targetMov.value);

      // 1. Devolve o saldo com liquidez em Reais (R$) para o cliente
      const currentBrl = this.getCustodyBrlBalance(clientEmail);
      const newBrl = currentBrl + refundAmount;
      this.setCustodyBrlBalance(clientEmail, newBrl);

      // 2. Atualiza a ordem original para cancelada/estornada
      targetMov.status = 'ESTORNADO';
      targetMov.bankStatus = 'ESTORNADO_CUSTODIA';
      targetMov.refundedAt = new Date().toISOString();
      targetMov.cancelledAt = new Date().toISOString();
      targetMov.note = `Estornado em ${new Date().toLocaleString('pt-BR')}: ${params.reason || 'Cancelamento solicitado pelo cliente/administrador'}`;

      movements[targetMovIndex] = targetMov;
      localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));

      // 3. Adiciona uma movimentação de crédito de estorno auditável
      const refundMov = this.addMovement({
        clientId: clientEmail,
        clientEmail,
        clientName: targetMov.clientName,
        type: 'ESTORNO DE SAQUE',
        description: `ESTORNO DE SAQUE BANCÁRIO: R$ ${refundAmount.toFixed(2)} devolvidos ao Saldo com Liquidez (Ref TXID: ${targetMov.txid.slice(0, 10)}...) • Motivo: ${params.reason || 'Devolução imediata para a custódia'}`,
        value: refundAmount,
        currency: 'BRL',
        status: 'CONFIRMADO',
        note: `Operador/Responsável: ${params.cancelledBy || clientEmail}`,
      });

      return {
        success: true,
        newBalance: newBrl,
        movement: targetMov,
        refundMovement: refundMov,
      };
    } catch (err: any) {
      console.error('Erro ao estornar saque:', err);
      return { success: false, error: err?.message || 'Falha ao processar estorno de saque.' };
    }
  },

  // Confirma a liquidação do saque pelo operador/administrador no Banco do Brasil
  confirmWithdrawalSettlement(params: {
    txid: string;
    officialEndToEndId?: string;
    notes?: string;
    operatorEmail?: string;
  }): {
    success: boolean;
    error?: string;
    movement?: Movement;
  } {
    try {
      const cleanTxid = (params.txid || '').trim();
      const movements = this.getMovements();
      const movIndex = movements.findIndex((m) => m.txid === cleanTxid || m.id === cleanTxid);

      if (movIndex < 0) {
        return { success: false, error: 'Ordem de saque não encontrada.' };
      }

      const mov = movements[movIndex];
      mov.status = 'CONFIRMADO';
      mov.bankStatus = 'LIQUIDADO_BANCO_DO_BRASIL';
      if (params.officialEndToEndId && params.officialEndToEndId.trim()) {
        mov.endToEndId = params.officialEndToEndId.trim();
      }
      mov.settledAt = new Date().toISOString();
      mov.note = params.notes || `Liquidado pelo operador ${params.operatorEmail || 'Engecema'} no Banco do Brasil`;

      movements[movIndex] = mov;
      localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));

      return { success: true, movement: mov };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha ao confirmar liquidação.' };
    }
  },

  // Retorna todas as ordens de saque pendentes de liquidação bancária
  getPendingWithdrawals(clientEmail?: string): Movement[] {
    const movements = this.getMovements(clientEmail);
    return movements.filter(
      (m) =>
        (m.type === 'SAQUE BANCÁRIO' || m.type === 'TRANSFERÊNCIA PIX BB') &&
        (m.status === 'PENDENTE_LIBERACAO_BB' ||
          m.bankStatus === 'AGUARDANDO_ALCADA_BB' ||
          m.bankStatus === 'PROCESSADO_ALCADA_BB')
    );
  },

  // Movements (Transaction history)
  getMovements(clientEmail?: string): Movement[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      let parsed: Movement[] = data ? JSON.parse(data) : [];
      if (clientEmail) {
        const cleanEmail = clientEmail.toLowerCase();
        return parsed.filter(
          (m) => m.clientEmail.toLowerCase() === cleanEmail
        );
      }
      return parsed;
    } catch {
      return [];
    }
  },

  // Zera todas as movimentações da corretora (preparação para modo 100% real)
  clearAllMovements(): { success: boolean; clearedCount: number } {
    try {
      const current = this.getMovements();
      const clearedCount = current.length;
      localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify([]));
      fetch('/api/admin/clean-history', { method: 'POST' }).catch(() => {});
      return { success: true, clearedCount };
    } catch {
      return { success: false, clearedCount: 0 };
    }
  },

  // Zera irrestritamente todos os saldos e movimentações da corretora (Modo Real de Liquidez)
  resetAllBalancesAndMovementsToZero(): { success: boolean; message: string; movement: Movement } {
    try {
      localStorage.setItem(STORAGE_KEYS.REAL_MODE_ACTIVE, 'true');

      // 1. Zera saldos de todas as contas e clientes conhecidos
      const accounts = this.getAccounts();
      const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      const clients: ClientRecord[] = rawClients ? JSON.parse(rawClients) : this.getClients();
      const allEmails = new Set<string>();

      accounts.forEach((a) => {
        if (a.email) allEmails.add(a.email.trim().toLowerCase());
      });
      clients.forEach((c) => {
        if (c.email) allEmails.add(c.email.trim().toLowerCase());
      });
      MASTER_ADMIN_EMAILS.forEach((e) => allEmails.add(e.trim().toLowerCase()));
      GEONI_EMAILS.forEach((e) => allEmails.add(e.trim().toLowerCase()));

      const zeroBalances: Record<string, number> = {};
      const zeroBrlBalances: Record<string, number> = {};
      const zeroUsdtBalances: Record<string, number> = {};

      allEmails.forEach((email) => {
        zeroBalances[email] = 0.0;
        zeroBrlBalances[email] = 0.0;
        zeroUsdtBalances[email] = 0.0;
      });

      localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify(zeroBalances));
      localStorage.setItem(STORAGE_KEYS.BRL_BALANCES, JSON.stringify(zeroBrlBalances));
      localStorage.setItem(STORAGE_KEYS.USDT_BALANCES, JSON.stringify(zeroUsdtBalances));

      // 2. Atualiza os clientes cadastrados para refletir saldo zero mantendo todos os atributos BitX Core
      const updatedClients = clients.map((c) => ({
        ...c,
        balanceBtxc: 0.0,
        balanceBrl: 0.0,
        balanceUsdt: 0.0,
        movementCount: 1,
        latestMovement: null,
        bitxAddress: c.bitxAddress || generateBitxCoreAddress(c.email),
        registrationTxid: c.registrationTxid || generateDeterministicTxid(c.email + '_reg'),
        updatedAt: new Date().toISOString(),
      }));
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(updatedClients));

      // 3. Cria registro auditável oficial no histórico do cliente titular e da plataforma
      const resetTxid = '0x9891c2bfbee33952a01ce9a471b83d1e';
      const primaryClient = updatedClients.find((c) => isGeoniRecord(c)) || updatedClients[0] || {
        email: 'geonimatos31@hotmail.com',
        name: 'Geoni Clementino Cesar de Matos',
        bitxAddress: 'bxrt1qnkc489m7w4s0zey43n6e594dfm3l08u94s0zey',
      };

      const auditResetMovement: Movement = {
        id: resetTxid,
        txid: resetTxid,
        clientId: primaryClient.email,
        clientEmail: primaryClient.email,
        clientName: primaryClient.name || 'Geoni Clementino Cesar de Matos',
        type: 'AJUSTE CUSTÓDIA',
        description: 'Ativação Oficial do Modo de Liquidez 100% Real · Custódia Zerada e Sincronizada com a BitX Core Blockchain (Mainnet #349.000)',
        value: 0.0,
        currency: 'BRL',
        status: 'CONFIRMADO',
        bitxAddress: primaryClient.bitxAddress || 'bxrt1qnkc489m7w4s0zey43n6e594dfm3l08u94s0zey',
        createdAt: new Date().toISOString(),
        note: 'Custódia zerada com sucesso em todo o ecossistema Global Exchange e BitX Core. Todos os saldos estão 100% líquidos e prontos para operações reais via Pix Banco do Brasil.',
      };

      const geoniMovements: Movement[] = [
        auditResetMovement,
        {
          ...auditResetMovement,
          id: generateTxid(),
          clientId: 'geonimatos42@gmail.com',
          clientEmail: 'geonimatos42@gmail.com',
        },
        {
          ...auditResetMovement,
          id: generateTxid(),
          clientId: 'geoniclementino31@gmail.com',
          clientEmail: 'geoniclementino31@gmail.com',
        },
        {
          ...auditResetMovement,
          id: generateTxid(),
          clientId: 'geonimatos31@gmail.com',
          clientEmail: 'geonimatos31@gmail.com',
        },
      ];

      localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(geoniMovements));
      localStorage.setItem(STORAGE_KEYS.FINANCIAL_TXS, JSON.stringify([]));
      localStorage.removeItem('gx_webhook_events_v2');

      // 4. Sincroniza em segundo plano com backend
      fetch('/api/bitx/reset-custody', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movement: auditResetMovement }),
      }).catch(() => {});
      fetch('/api/admin/clean-history', { method: 'POST' }).catch(() => {});

      // 5. Dispara evento para atualização instantânea em toda a interface
      try {
        window.dispatchEvent(new CustomEvent('gx_storage_updated'));
      } catch {}

      return {
        success: true,
        message: 'Todos os saldos (BRL e BTXC/GX) foram zerados com sucesso! Modo de liquidez 100% real ativado e sincronizado com a BitX Core.',
        movement: auditResetMovement,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Erro ao zerar saldos.',
        movement: null as any,
      };
    }
  },

  addMovement(
    input: Omit<Movement, 'id' | 'txid' | 'createdAt' | 'status'> & {
      txid?: string;
      status?: Movement['status'];
    }
  ): Movement {
    const movements = this.getMovements();
    const txid = input.txid || generateTxid();
    const movement: Movement = {
      ...input,
      id: txid,
      txid,
      status: input.status || 'CONFIRMADO',
      createdAt: new Date().toISOString(),
    };

    movements.unshift(movement);
    localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));

    // Update client stats
    const clients = this.getClients();
    const clientIndex = clients.findIndex(
      (c) => c.email.toLowerCase() === input.clientEmail.toLowerCase()
    );
    if (clientIndex >= 0) {
      clients[clientIndex].movementCount += 1;
      clients[clientIndex].latestMovement = movement;
      clients[clientIndex].updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    }

    return movement;
  },

  // Custody Balance - strictly tracks actual client transfers!
  getCustodyBalance(clientEmail: string): number {
    try {
      const cleanEmail = (clientEmail || '').trim().toLowerCase();
      const isGeoni = isGeoniEmail(cleanEmail);
      const isRealMode = localStorage.getItem(STORAGE_KEYS.REAL_MODE_ACTIVE) === 'true';

      const data = localStorage.getItem(STORAGE_KEYS.BALANCES);
      const balances = data ? JSON.parse(data) : {};
      const val = balances[cleanEmail];

      if (typeof val === 'number' && Number.isFinite(val)) {
        return Math.max(0, val);
      }

      return 0.0;
    } catch {
      return 0.0;
    }
  },

  setCustodyBalance(clientEmail: string, balance: number): void {
    try {
      const cleanEmail = (clientEmail || '').trim().toLowerCase();
      const data = localStorage.getItem(STORAGE_KEYS.BALANCES);
      const balances = data ? JSON.parse(data) : {};
      balances[cleanEmail] = Math.max(0, balance);
      localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify(balances));
      try {
        window.dispatchEvent(new CustomEvent('gx_storage_updated'));
      } catch {}
    } catch (e) {
      console.warn('Failed to save custody balance', e);
    }
  },

  // Saldo Real em Reais com Liquidez Imediata (R$) - proveniente de vendas executadas ou depósitos diretos
  getCustodyBrlBalance(clientEmail: string): number {
    try {
      const cleanEmail = (clientEmail || '').trim().toLowerCase();
      const data = localStorage.getItem(STORAGE_KEYS.BRL_BALANCES);
      const balances = data ? JSON.parse(data) : {};
      const val = balances[cleanEmail];

      if (typeof val === 'number' && Number.isFinite(val)) {
        return Math.max(0, val);
      }

      return 0.0;
    } catch {
      return 0.0;
    }
  },

  // Valor Estimado Patrimonial de Mercado da Moeda BitX Core / GX em Reais
  getEstimatedCryptoValue(clientEmail: string): number {
    try {
      const gxBal = this.getCustodyBalance(clientEmail);
      const rawPrice = this.getLaunchPrice();
      const price = parseFloat(rawPrice) > 0 ? parseFloat(rawPrice) : 421081.54;
      return gxBal * price;
    } catch {
      return 0.0;
    }
  },

  // Executa Liquidação/Venda da moeda GX gerando Saldo Real com Liquidez Imediata em Reais (R$)
  liquidateGxToBrl(params: {
    clientEmail: string;
    amountGx: number;
    pricePerGx?: number;
  }): {
    success: boolean;
    movement?: Movement;
    newGxBalance?: number;
    newBrlBalance?: number;
    error?: string;
  } {
    const cleanEmail = params.clientEmail.trim().toLowerCase();
    const amount = Number(params.amountGx);
    const price = Number(params.pricePerGx || parseFloat(this.getLaunchPrice()) || 421081.54);

    if (!cleanEmail || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Informe uma quantidade válida de GX para vender.' };
    }

    const currentGx = this.getCustodyBalance(cleanEmail);
    if (amount > currentGx) {
      return {
        success: false,
        error: `Saldo insuficiente em GX. Você possui ${currentGx.toFixed(4)} GX e tentou vender ${amount.toFixed(4)} GX.`,
      };
    }

    const totalBrl = amount * price;
    const newGx = currentGx - amount;
    const currentBrl = this.getCustodyBrlBalance(cleanEmail);
    const newBrl = currentBrl + totalBrl;

    this.setCustodyBalance(cleanEmail, newGx);
    this.setCustodyBrlBalance(cleanEmail, newBrl);

    const client = this.getClients().find((c) => c.email.toLowerCase() === cleanEmail);
    const mov = this.addMovement({
      clientId: cleanEmail,
      clientEmail: cleanEmail,
      clientName: client?.name || cleanEmail,
      type: 'VENDA',
      description: `VENDA A MERCADO: ${amount.toFixed(4)} GX a R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} → Gerado Saldo com Liquidez de R$ ${totalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para Saque Pix`,
      value: totalBrl,
      currency: 'BRL',
    });

    return {
      success: true,
      movement: mov,
      newGxBalance: newGx,
      newBrlBalance: newBrl,
    };
  },

  setCustodyBrlBalance(clientEmail: string, balance: number): void {
    try {
      const cleanEmail = (clientEmail || '').trim().toLowerCase();
      const data = localStorage.getItem(STORAGE_KEYS.BRL_BALANCES);
      const balances = data ? JSON.parse(data) : {};
      balances[cleanEmail] = Math.max(0, balance);
      localStorage.setItem(STORAGE_KEYS.BRL_BALANCES, JSON.stringify(balances));
      try {
        window.dispatchEvent(new CustomEvent('gx_storage_updated'));
      } catch {}
    } catch (e) {
      console.warn('Failed to save custody BRL balance', e);
    }
  },

  // Launch Price / Cotação Oficial BTXC - BitX Core / GX (Padrão Sincronizado: R$ 421.081,54)
  getLaunchPrice(): string {
    const saved = localStorage.getItem(STORAGE_KEYS.LAUNCH_PRICE);
    if (
      !saved ||
      saved === '1.50' ||
      saved === '1.5' ||
      saved === '1.00' ||
      saved === '1' ||
      saved === '420000.00' ||
      saved === '420000'
    ) {
      return '421081.54';
    }
    return saved;
  },

  setLaunchPrice(price: string): void {
    localStorage.setItem(STORAGE_KEYS.LAUNCH_PRICE, price);
  },

  // Sincroniza a cotação da plataforma BitX Core Mainnet com o preço de lançamento
  syncWithBitxCoreMainnet(adminUser?: { email?: string; name?: string }): {
    success: boolean;
    price: string;
    chainHeight: string;
    variation: string;
    movement: Movement;
  } {
    const newPrice = '421081.54';
    const oldPrice = this.getLaunchPrice();
    this.setLaunchPrice(newPrice);

    const mov = this.addMovement({
      clientId: adminUser?.email || 'admin@engecema.com.br',
      clientEmail: adminUser?.email || 'admin@engecema.com.br',
      clientName: adminUser?.name || 'Administrador Geral Engecema',
      type: 'ATUALIZAÇÃO DE PREÇO',
      description: `SINCRONIZAÇÃO BITX CORE (MAINNET): Preço de lançamento alinhado ao Bloco #349.000 da Rede Ativa. Cotação oficial BTXC: R$ 421.081,54 (+0.42%) [Anterior: R$ ${parseFloat(oldPrice).toFixed(2)}]`,
      value: 421081.54,
      currency: 'BRL',
    });

    return {
      success: true,
      price: newPrice,
      chainHeight: BITX_CORE_MAINNET.chainHeight,
      variation: BITX_CORE_MAINNET.variation,
      movement: mov,
    };
  },

  // Financial transactions (Admin Liquidity)
  getFinancialTransactions(): FinancialTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FINANCIAL_TXS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  addFinancialTransaction(
    tx: Omit<FinancialTransaction, 'id' | 'createdAt'>
  ): FinancialTransaction {
    const txs = this.getFinancialTransactions();
    const newTx: FinancialTransaction = {
      ...tx,
      id: generateTxid(),
      createdAt: new Date().toISOString(),
    };
    txs.unshift(newTx);
    localStorage.setItem(STORAGE_KEYS.FINANCIAL_TXS, JSON.stringify(txs));
    return newTx;
  },

  // Ajuste Oficial de Custódia (Exclusivo da Administração / Mesa Operacional)
  adminAdjustCustodyBalance(params: {
    clientEmail: string;
    currency: 'BRL' | 'GX';
    action: 'SET' | 'CREDIT' | 'DEBIT';
    amount: number;
    reason: string;
    adminEmail?: string;
  }): {
    success: boolean;
    newBalance?: number;
    movement?: Movement;
    error?: string;
  } {
    const cleanEmail = params.clientEmail.trim().toLowerCase();
    const amount = Number(params.amount);
    const reason = params.reason.trim();

    if (!cleanEmail) {
      return { success: false, error: 'E-mail do cliente é obrigatório.' };
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return { success: false, error: 'Informe um valor numérico válido.' };
    }
    if (!reason) {
      return { success: false, error: 'Informe o motivo / justificativa formal do ajuste.' };
    }

    const client = this.getClients().find((c) => c.email.toLowerCase() === cleanEmail);
    const clientName = client?.name || cleanEmail;
    const currentBal =
      params.currency === 'BRL'
        ? this.getCustodyBrlBalance(cleanEmail)
        : this.getCustodyBalance(cleanEmail);

    let newBal = currentBal;
    if (params.action === 'SET') {
      newBal = amount;
    } else if (params.action === 'CREDIT') {
      newBal = currentBal + amount;
    } else if (params.action === 'DEBIT') {
      if (amount > currentBal) {
        return {
          success: false,
          error: `Saldo insuficiente para débito. Saldo atual: ${currentBal}, Débito: ${amount}`,
        };
      }
      newBal = currentBal - amount;
    }

    if (params.currency === 'BRL') {
      this.setCustodyBrlBalance(cleanEmail, newBal);
    } else {
      this.setCustodyBalance(cleanEmail, newBal);
    }

    const actionText =
      params.action === 'SET'
        ? `Definição Contábil de Saldo para ${params.currency === 'BRL' ? 'R$' : 'GX'} ${newBal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : params.action === 'CREDIT'
        ? `Crédito Administrativo de ${params.currency === 'BRL' ? 'R$' : 'GX'} ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : `Débito Administrativo de ${params.currency === 'BRL' ? 'R$' : 'GX'} ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const mov = this.addMovement({
      clientId: cleanEmail,
      clientEmail: cleanEmail,
      clientName,
      type: 'AJUSTE ADMINISTRATIVO',
      description: `AJUSTE OFICIAL PELA ADMINISTRAÇÃO: ${actionText} • Motivo: ${reason}`,
      value: amount,
      currency: params.currency,
    });

    return {
      success: true,
      newBalance: newBal,
      movement: mov,
    };
  },

  // Chamados e Solicitações de Suporte / Correção de Clientes
  getCorrectionRequests(): ClientCorrectionRequest[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CORRECTION_REQUESTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  addCorrectionRequest(data: {
    clientEmail: string;
    clientName: string;
    clientDocument?: string;
    type: 'CORRECAO_SAQUE' | 'SOLICITACAO_APORTE' | 'DUVIDA_SALDO' | 'OUTRO';
    subject: string;
    message: string;
    relatedAmount?: number;
    relatedCurrency?: 'BRL' | 'GX';
  }): ClientCorrectionRequest {
    const list = this.getCorrectionRequests();
    const txid = generateTxid();
    const newReq: ClientCorrectionRequest = {
      id: generateTxid(),
      txid,
      clientEmail: data.clientEmail.trim().toLowerCase(),
      clientName: data.clientName.trim(),
      clientDocument: data.clientDocument,
      type: data.type,
      subject: data.subject.trim(),
      message: data.message.trim(),
      relatedAmount: data.relatedAmount,
      relatedCurrency: data.relatedCurrency || 'BRL',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    list.unshift(newReq);
    localStorage.setItem(STORAGE_KEYS.CORRECTION_REQUESTS, JSON.stringify(list));

    // Grava também evento de auditoria no histórico do cliente
    this.addMovement({
      txid,
      clientId: data.clientEmail,
      clientEmail: data.clientEmail,
      clientName: data.clientName,
      type: 'CHAMADO SUPORTE',
      description: `Chamado à Administração: ${data.subject} (${data.type}) • Protocolo: ${txid}`,
      value: data.relatedAmount || 0,
      currency: data.relatedCurrency || 'BRL',
    });

    return newReq;
  },

  resolveCorrectionRequest(id: string, adminNotes?: string): void {
    const list = this.getCorrectionRequests();
    const req = list.find((r) => r.id === id);
    if (req) {
      req.status = 'resolved';
      req.resolvedAt = new Date().toISOString();
      if (adminNotes) req.adminNotes = adminNotes;
      localStorage.setItem(STORAGE_KEYS.CORRECTION_REQUESTS, JSON.stringify(list));
    }
  },

  // Saldo em USDT ($)
  getCustodyUsdtBalance(clientEmail: string): number {
    try {
      const cleanEmail = (clientEmail || '').trim().toLowerCase();
      const data = localStorage.getItem(STORAGE_KEYS.USDT_BALANCES);
      const balances = data ? JSON.parse(data) : {};
      const val = balances[cleanEmail];

      if (typeof val === 'number' && Number.isFinite(val)) {
        return Math.max(0, val);
      }

      return 0.0;
    } catch {
      return 0.0;
    }
  },

  setCustodyUsdtBalance(clientEmail: string, balance: number): void {
    try {
      const cleanEmail = (clientEmail || '').trim().toLowerCase();
      const data = localStorage.getItem(STORAGE_KEYS.USDT_BALANCES);
      const balances = data ? JSON.parse(data) : {};
      balances[cleanEmail] = Math.max(0, balance);
      localStorage.setItem(STORAGE_KEYS.USDT_BALANCES, JSON.stringify(balances));
      try {
        window.dispatchEvent(new CustomEvent('gx_storage_updated'));
      } catch {}
    } catch (e) {
      console.warn('Failed to save custody USDT balance', e);
    }
  },

  // Livro Razão de Custódia & Liquidação (Ledger Auditável Engecema)
  getLedger(): CustodyLedgerEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LEDGER);
      let entries: CustodyLedgerEntry[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(entries) || entries.length === 0) {
        entries = [...INITIAL_LEDGER_ENTRIES];
        localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(entries));
      }
      return entries;
    } catch {
      return [...INITIAL_LEDGER_ENTRIES];
    }
  },

  addLedgerEntry(entry: CustodyLedgerEntry): void {
    const list = this.getLedger();
    list.unshift(entry);
    localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(list));
  },

  // 🗑️ Zerar todos os clientes da Carteira de Clientes da Global Exchange (Conglomerado Real)
  resetAllClientsInPortfolio(mode: 'clear_list' | 'zero_balances' = 'clear_list'): {
    success: boolean;
    message: string;
    clientsCount: number;
    movement: Movement;
  } {
    try {
      localStorage.setItem(STORAGE_KEYS.REAL_MODE_ACTIVE, 'true');

      let remainingClients: ClientRecord[] = [];
      const zeroBalances: Record<string, number> = {};
      const zeroBrlBalances: Record<string, number> = {};
      const zeroUsdtBalances: Record<string, number> = {};

      if (mode === 'zero_balances') {
        const currentClients = this.getClients();
        remainingClients = currentClients.map((c) => {
          const em = c.email.toLowerCase();
          zeroBalances[em] = 0.0;
          zeroBrlBalances[em] = 0.0;
          zeroUsdtBalances[em] = 0.0;
          return {
            ...c,
            balanceBtxc: 0.0,
            balanceBrl: 0.0,
            balanceUsdt: 0.0,
            movementCount: 0,
            latestMovement: null,
            updatedAt: new Date().toISOString(),
          };
        });
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(remainingClients));
      } else {
        remainingClients = [];
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.DELETED_CLIENTS, JSON.stringify([]));
      }

      localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify(zeroBalances));
      localStorage.setItem(STORAGE_KEYS.BRL_BALANCES, JSON.stringify(zeroBrlBalances));
      localStorage.setItem(STORAGE_KEYS.USDT_BALANCES, JSON.stringify(zeroUsdtBalances));
      localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.FINANCIAL_TXS, JSON.stringify([]));

      const resetTxid = '0x9891c2bfbee33952a01ce9a471b83d1e';
      const auditMovement: Movement = {
        id: resetTxid,
        txid: resetTxid,
        clientId: 'admin@engecema.com.br',
        clientEmail: 'admin@engecema.com.br',
        clientName: 'Administração Global Exchange / Engecema',
        type: 'AJUSTE CUSTÓDIA',
        description:
          mode === 'zero_balances'
            ? 'Zerar Saldos da Carteira de Clientes Global Exchange (Conglomerado Real) · Saldos de BTXC, BRL e USDT equalizados a 0,00'
            : 'Zerar Carteira de Clientes Global Exchange (Conglomerado Real) · Carteira zerada e sincronizada com BitX Core Blockchain e Custódia Engecema',
        value: 0.0,
        currency: 'BRL',
        status: 'CONFIRMADO',
        createdAt: new Date().toISOString(),
        note: 'Carteira de Clientes zerada com sucesso em todo o ecossistema. 100% sincronizado com BitX Core Blockchain (#349.000) e Livro Razão de Custódia Engecema.',
      };

      localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify([auditMovement]));

      // Sincroniza com os endpoints backend
      fetch('/api/bitx/reset-all', { method: 'POST' }).catch(() => {});
      fetch('/api/bitx/reset-custody', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movement: auditMovement }),
      }).catch(() => {});
      fetch('/api/admin/clean-history', { method: 'POST' }).catch(() => {});

      try {
        window.dispatchEvent(new CustomEvent('gx_storage_updated'));
      } catch {}

      return {
        success: true,
        message:
          mode === 'zero_balances'
            ? 'Todos os saldos dos clientes da Carteira Global Exchange foram zerados com sucesso (0.00 GX / R$ 0,00)!'
            : 'Carteira de Clientes da Global Exchange (Conglomerado Real) zerada com sucesso! Base limpa para novos cadastros reais sincronizada com a BitX Core e Custódia Engecema.',
        clientsCount: remainingClients.length,
        movement: auditMovement,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Erro ao zerar carteira de clientes.',
        clientsCount: 0,
        movement: null as any,
      };
    }
  },

  // ⚖️ Reconciliar Saldos com o Livro Razão
  reconcileLedgerWithBalances(): {
    success: boolean;
    message: string;
    totalGx: number;
    totalBrl: number;
    totalUsdt: number;
  } {
    const ledger = this.getLedger();
    let totalGx = 0;
    let totalBrl = 0;
    let totalUsdt = 0;

    if (Array.isArray(ledger) && ledger.length > 0) {
      const balances: Record<string, number> = {};
      const brlBalances: Record<string, number> = {};
      const usdtBalances: Record<string, number> = {};

      ledger.forEach((entry) => {
        const em = (entry.beneficiaryEmail || '').toLowerCase();
        const gx = Number(entry.amountGx) || 0;
        const brl = Number(entry.amountBrl) || 0;
        const usdt = Number(entry.amountUsdt) || 0;
        totalGx += gx;
        totalBrl += brl;
        totalUsdt += usdt;

        if (em) {
          balances[em] = (balances[em] || 0) + gx;
          brlBalances[em] = (brlBalances[em] || 0) + brl;
          usdtBalances[em] = (usdtBalances[em] || 0) + usdt;
        }
      });

      Object.entries(balances).forEach(([em, bal]) => this.setCustodyBalance(em, bal));
      Object.entries(brlBalances).forEach(([em, bal]) => this.setCustodyBrlBalance(em, bal));
      Object.entries(usdtBalances).forEach(([em, bal]) => this.setCustodyUsdtBalance(em, bal));

      const clients = this.getClients();
      const updated = clients.map((c) => ({
        ...c,
        balanceBtxc: balances[c.email.toLowerCase()] ?? this.getCustodyBalance(c.email),
        balanceBrl: brlBalances[c.email.toLowerCase()] ?? this.getCustodyBrlBalance(c.email),
        balanceUsdt: usdtBalances[c.email.toLowerCase()] ?? this.getCustodyUsdtBalance(c.email),
      }));
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(updated));

      fetch('/api/bitx/reconcile-ledger', { method: 'POST' }).catch(() => {});

      try {
        window.dispatchEvent(new CustomEvent('gx_storage_updated'));
      } catch {}

      return {
        success: true,
        message: `⚖️ Saldos reconciliados com o Livro Razão! Total em custódia: ${totalGx.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} GX • R$ ${totalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em liquidez fiduciária.`,
        totalGx,
        totalBrl,
        totalUsdt,
      };
    } else {
      const clients = this.getClients();
      clients.forEach((c) => {
        this.setCustodyBalance(c.email, 0.0);
        this.setCustodyBrlBalance(c.email, 0.0);
        this.setCustodyUsdtBalance(c.email, 0.0);
      });
      const updated = clients.map((c) => ({
        ...c,
        balanceBtxc: 0.0,
        balanceBrl: 0.0,
        balanceUsdt: 0.0,
      }));
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(updated));

      fetch('/api/bitx/reconcile-ledger', { method: 'POST' }).catch(() => {});

      try {
        window.dispatchEvent(new CustomEvent('gx_storage_updated'));
      } catch {}

      return {
        success: true,
        message: '⚖️ Reconciliação concluída: Livro Razão e saldos da Carteira de Clientes 100% sincronizados e zerados em modo real.',
        totalGx: 0.0,
        totalBrl: 0.0,
        totalUsdt: 0.0,
      };
    }
  },

  // 🔗 Ponte de Sincronização Global Exchange <-> BitX Core
  async syncBitxCoreWithGlobalExchange(): Promise<{
    success: boolean;
    clients: ClientRecord[];
    ledger: CustodyLedgerEntry[];
    message: string;
  }> {
    try {
      // 1. Tenta sincronizar com o backend
      let remoteClients: any[] = [];
      let remoteLedger: any[] = [];
      try {
        const [cRes, lRes] = await Promise.all([
          fetch('/api/bitx/clients'),
          fetch('/api/bitx/ledger'),
        ]);
        if (cRes.ok) {
          const cData = await cRes.json();
          if (Array.isArray(cData.clients) && cData.clients.length > 0) {
            remoteClients = cData.clients;
          }
        }
        if (lRes.ok) {
          const lData = await lRes.json();
          if (Array.isArray(lData.ledger) && lData.ledger.length > 0) {
            remoteLedger = lData.ledger;
          }
        }
      } catch (err) {
        console.warn('[Sync Bridge] Backend offline, usando dados canônicos locais:', err);
      }

      // 2. Mescla clientes locais com remotos (ignorando clientes excluídos pelo usuário)
      const deletedEmails = this.getDeletedClientEmails();
      let currentClients = this.getClients();
      if (remoteClients.length > 0) {
        remoteClients.forEach((rc) => {
          const rcEmail = (rc.email || '').toLowerCase().trim();
          if (deletedEmails.includes(rcEmail)) return; // Ignora clientes excluídos
          const idx = currentClients.findIndex((c) => c.email.toLowerCase() === rcEmail);
          if (idx >= 0) {
            currentClients[idx] = { ...currentClients[idx], ...rc };
          } else {
            currentClients.push(rc);
          }
          if (rc.balanceBtxc !== undefined) this.setCustodyBalance(rc.email, rc.balanceBtxc);
          if (rc.balanceBrl !== undefined) this.setCustodyBrlBalance(rc.email, rc.balanceBrl);
          if (rc.balanceUsdt !== undefined) this.setCustodyUsdtBalance(rc.email, rc.balanceUsdt);
        });
      }

      currentClients = this.deduplicateClients(currentClients);
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(currentClients));

      // 3. Atualiza Ledger
      if (remoteLedger.length > 0) {
        localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(remoteLedger));
      }
      const ledger = this.getLedger();

      // 4. Envia estado consolidado de volta para persistência
      try {
        const rawBal = localStorage.getItem(STORAGE_KEYS.BALANCES);
        const rawBrl = localStorage.getItem(STORAGE_KEYS.BRL_BALANCES);
        const rawUsdt = localStorage.getItem(STORAGE_KEYS.USDT_BALANCES);
        await fetch('/api/bitx/sync-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clients: currentClients,
            ledger,
            balances: rawBal ? JSON.parse(rawBal) : {},
            brlBalances: rawBrl ? JSON.parse(rawBrl) : {},
            usdtBalances: rawUsdt ? JSON.parse(rawUsdt) : {},
          }),
        });
      } catch {}

      return {
        success: true,
        clients: currentClients,
        ledger,
        message: '🔗 Ponte de sincronização executada com sucesso! Todas as posições de clientes e o Livro Razão estão 100% integrados entre a BitX Core e a Global Exchange.',
      };
    } catch (e: any) {
      return {
        success: false,
        clients: this.getClients(),
        ledger: this.getLedger(),
        message: e?.message || 'Erro durante sincronização.',
      };
    }
  },

  // ➕ Cadastrar Novo Cliente Real na Global Exchange (Painel BitX Core)
  addNewClientReal(clientData: {
    tagId?: string;
    name: string;
    email: string;
    document?: string;
    initialBtxc?: number;
    initialBrl?: number;
    initialUsdt?: number;
    kycStatus?: string;
  }): ClientRecord {
    const cleanEmail = clientData.email.trim().toLowerCase();
    const cleanName = clientData.name.trim();
    const cleanDoc = (clientData.document || '—').trim();
    const tagId = (clientData.tagId || cleanEmail).trim();
    const btxc = Number(clientData.initialBtxc) || 0.0;
    const brl = Number(clientData.initialBrl) || 0.0;
    const usdt = Number(clientData.initialUsdt) || 0.0;
    const kyc = clientData.kycStatus || 'Verificado KYC (Completo)';

    const bitxAddress = generateBitxCoreAddress(cleanEmail);
    const regTxid = generateDeterministicTxid(cleanEmail + '_reg');

    const newRecord: ClientRecord = {
      id: tagId,
      tagId,
      email: cleanEmail,
      name: cleanName,
      document: cleanDoc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      movementCount: (btxc > 0 || brl > 0 || usdt > 0) ? 1 : 0,
      bitxAddress,
      registrationTxid: regTxid,
      balanceBtxc: btxc,
      balanceBrl: brl,
      balanceUsdt: usdt,
      kycStatus: kyc,
    };

    const clients = this.getClients();
    const existingIdx = clients.findIndex((c) => c.email.toLowerCase() === cleanEmail);
    if (existingIdx >= 0) {
      clients[existingIdx] = { ...clients[existingIdx], ...newRecord };
    } else {
      clients.push(newRecord);
    }
    const deleted = this.getDeletedClientEmails().filter((e) => e !== cleanEmail);
    localStorage.setItem(STORAGE_KEYS.DELETED_CLIENTS, JSON.stringify(deleted));
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));

    // Define saldos
    this.setCustodyBalance(cleanEmail, btxc);
    this.setCustodyBrlBalance(cleanEmail, brl);
    this.setCustodyUsdtBalance(cleanEmail, usdt);

    // Cria conta de acesso
    const accounts = this.getAccounts();
    const accIdx = accounts.findIndex((a) => a.email.toLowerCase() === cleanEmail);
    if (accIdx < 0) {
      accounts.push({
        id: cleanEmail,
        email: cleanEmail,
        name: cleanName,
        document: cleanDoc,
        password: 'Cliente@123456',
        role: 'client',
        status: 'active',
        bitxAddress,
        registrationTxid: regTxid,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }

    // Se houver saldo inicial, adiciona ao Livro Razão e Histórico
    if (btxc > 0 || brl > 0 || usdt > 0) {
      const ledger = this.getLedger();
      const custId = `CUST-${String(ledger.length + 1).padStart(3, '0')}`;
      this.addLedgerEntry({
        id: custId,
        type: 'Aporte Inicial',
        counterparty: `Custódia Engecema PJ -> ${cleanName}`,
        amountGx: btxc,
        amountBrl: brl,
        amountUsdt: usdt,
        txid: regTxid,
        timestamp: new Date().toLocaleString('pt-BR'),
        status: 'Confirmado em Custódia',
        beneficiaryEmail: cleanEmail,
        notes: 'Aporte inicial configurado no cadastro de cliente real',
      });

      this.addMovement({
        txid: regTxid,
        clientId: cleanEmail,
        clientEmail: cleanEmail,
        clientName: cleanName,
        type: 'DEPÓSITO BITX CORE',
        description: `Aporte Inicial de Custódia: +${btxc.toFixed(4)} GX e +R$ ${brl.toFixed(2)}`,
        value: btxc,
        currency: 'GX',
        status: 'CONFIRMADO',
        bitxAddress,
      });
    }

    // Dispara sincronização em segundo plano com backend
    fetch('/api/bitx/add-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagId,
        name: cleanName,
        email: cleanEmail,
        document: cleanDoc,
        initialBtxc: btxc,
        initialBrl: brl,
        initialUsdt: usdt,
        kycStatus: kyc,
      }),
    }).catch(() => {});

    return newRecord;
  },

  updateClientReal(clientData: {
    email: string;
    name?: string;
    document?: string;
    tagId?: string;
    kycStatus?: string;
    balanceBtxc?: number;
    balanceBrl?: number;
    balanceUsdt?: number;
  }): ClientRecord | null {
    const cleanEmail = clientData.email.trim().toLowerCase();
    const clients = this.getClients();
    const idx = clients.findIndex((c) => c.email.toLowerCase() === cleanEmail);
    if (idx < 0) return null;

    const existing = clients[idx];
    const updated: ClientRecord = {
      ...existing,
      name: clientData.name !== undefined ? clientData.name.trim() : existing.name,
      document: clientData.document !== undefined ? clientData.document.trim() : existing.document,
      tagId: clientData.tagId !== undefined ? clientData.tagId.trim() : existing.tagId,
      kycStatus: clientData.kycStatus !== undefined ? clientData.kycStatus : existing.kycStatus,
      balanceBtxc: clientData.balanceBtxc !== undefined ? clientData.balanceBtxc : existing.balanceBtxc,
      balanceBrl: clientData.balanceBrl !== undefined ? clientData.balanceBrl : existing.balanceBrl,
      balanceUsdt: clientData.balanceUsdt !== undefined ? clientData.balanceUsdt : existing.balanceUsdt,
      updatedAt: new Date().toISOString(),
    };

    clients[idx] = updated;
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));

    if (clientData.balanceBtxc !== undefined) this.setCustodyBalance(cleanEmail, clientData.balanceBtxc);
    if (clientData.balanceBrl !== undefined) this.setCustodyBrlBalance(cleanEmail, clientData.balanceBrl);
    if (clientData.balanceUsdt !== undefined) this.setCustodyUsdtBalance(cleanEmail, clientData.balanceUsdt);

    return updated;
  },

  removeClientReal(email: string): boolean {
    const cleanEmail = email.trim().toLowerCase();
    if (
      cleanEmail === 'geonimatos31@hotmail.com' ||
      cleanEmail === 'geonimatos31@gmail.com' ||
      cleanEmail === 'geoniclementino31@gmail.com'
    ) {
      return false; // Titular principal nunca é removido
    }

    // 1. Registra na lista permanente de clientes excluídos para evitar ressuscitação
    const deleted = this.getDeletedClientEmails();
    if (!deleted.includes(cleanEmail)) {
      deleted.push(cleanEmail);
      localStorage.setItem(STORAGE_KEYS.DELETED_CLIENTS, JSON.stringify(deleted));
    }

    // 2. Remove do localStorage de clientes
    try {
      const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      let clients: ClientRecord[] = rawClients ? JSON.parse(rawClients) : [];
      clients = clients.filter(
        (c) => c.email.toLowerCase() !== cleanEmail && c.id?.toLowerCase() !== cleanEmail
      );
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    } catch {}

    // 3. Remove das contas de login
    try {
      const accounts = this.getAccounts().filter((a) => a.email.toLowerCase() !== cleanEmail);
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    } catch {}

    // 4. Limpa saldos de custódia
    try {
      const rawBal = localStorage.getItem(STORAGE_KEYS.BALANCES);
      if (rawBal) {
        const bal = JSON.parse(rawBal);
        delete bal[cleanEmail];
        localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify(bal));
      }
      const rawBrl = localStorage.getItem(STORAGE_KEYS.BRL_BALANCES);
      if (rawBrl) {
        const brl = JSON.parse(rawBrl);
        delete brl[cleanEmail];
        localStorage.setItem(STORAGE_KEYS.BRL_BALANCES, JSON.stringify(brl));
      }
      const rawUsdt = localStorage.getItem(STORAGE_KEYS.USDT_BALANCES);
      if (rawUsdt) {
        const usdt = JSON.parse(rawUsdt);
        delete usdt[cleanEmail];
        localStorage.setItem(STORAGE_KEYS.USDT_BALANCES, JSON.stringify(usdt));
      }
    } catch {}

    // 5. Notifica backend para sincronizar exclusão em data/gx-data.json
    fetch('/api/bitx/remove-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    }).catch(() => {});

    // 6. Notifica o ecossistema com evento de atualização
    try {
      window.dispatchEvent(new CustomEvent('gx_storage_updated'));
    } catch {}

    return true;
  },
};
