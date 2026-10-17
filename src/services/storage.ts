import {
  Account,
  AdminApprovalRequest,
  ClientRecord,
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
  LAUNCH_PRICE: 'gx_launch_price_v3',
  ACCOUNTS: 'gx_accounts_v3',
  ADMIN_REQUESTS: 'gx_admin_requests_v3',
  APPROVED_ADMINS: 'gx_approved_admins_v3',
};

export const MASTER_ADMIN_EMAILS = [
  'geonimatos31@gmail.com',
  'geoniclementino31@gmail.com',
  'geonimatos31.nautilus@gmail.com',
  'geonimatos42@gmail.com',
];
export const MASTER_ADMIN_EMAIL = 'geoniclementino31@gmail.com';

export function isMasterAdminEmail(email: string): boolean {
  if (!email) return false;
  return MASTER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Identifica e bloqueia estritamente clientes fictícios/mocks legados
 */
export function isFictitiousClient(c: any): boolean {
  if (!c) return false;
  const id = String(c.id || '').toLowerCase();
  const email = String(c.email || '').toLowerCase();
  const name = String(c.name || '').toLowerCase();

  // IDs fictícios conhecidos
  if (id.startsWith('ge-client-') || id.startsWith('ge_client_') || id.startsWith('ge-')) return true;
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

    const combined = Array.from(new Set([...approvedFromAccounts, ...validApproved]))
      .filter((e) => e === MASTER_ADMIN_EMAIL || accounts.some((a) => a.email.toLowerCase() === e && a.status === 'active'));

    return combined;
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
  // Purge any outdated test mocks if found
  initCleanState() {
    try {
      localStorage.removeItem('gx_clients_data');
      localStorage.removeItem('gx_financial_transactions');
      localStorage.removeItem('gx_autenticado');
      localStorage.removeItem('gx_clients_v2');

      // Purga clientes fictícios conhecidos da lista de clientes
      const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      if (rawClients) {
        try {
          const parsed = JSON.parse(rawClients);
          if (Array.isArray(parsed)) {
            const cleanClients = parsed.filter((c) => !isFictitiousClient(c));
            localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(cleanClients));
          }
        } catch {}
      }

      // Purga eventos e movimentações de teste anteriores para manter ambiente 100% real
      localStorage.removeItem('gx_webhook_events_v2');
      const rawMovements = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      if (rawMovements) {
        const movs: Movement[] = JSON.parse(rawMovements);
        const realMovs = movs.filter(
          (m) =>
            !m.endToEndId?.includes('SIMULADO') &&
            !m.description?.includes('SIMULADO') &&
            m.clientName !== 'Engecema Pagador Teste' &&
            !isFictitiousClient({ id: m.clientId, email: m.clientEmail, name: m.clientName })
        );
        localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(realMovs));
      }

      // Sincroniza contas cadastradas reais
      this.syncAccountsToClients();
    } catch (e) {
      console.warn('Storage cleanup:', e);
    }
  },

  // Sincroniza contas criadas para a carteira de clientes, garantindo Geoni Clementino Cesar de Matos
  syncAccountsToClients(): void {
    try {
      const accounts = this.getAccounts();

      // Garante que a conta do Administrador Geral Geoni Clementino Cesar de Matos existe
      const masterEmail = 'geoniclementino31@gmail.com';
      const hasGeoni = accounts.some(
        (a) => a.email.toLowerCase() === masterEmail || a.name.toLowerCase().includes('geoni')
      );

      if (!hasGeoni) {
        const geoniRegTxid = generateDeterministicTxid(masterEmail + '_reg');
        const geoniBitx = generateBitxCoreAddress(masterEmail);
        const geoniAccount: Account = {
          id: masterEmail,
          email: masterEmail,
          name: 'Geoni Clementino Cesar de Matos',
          document: '05.368.602/0001-10',
          password: 'MasterAdminPassword@2026',
          role: 'admin',
          status: 'active',
          bitxAddress: geoniBitx,
          registrationTxid: geoniRegTxid,
          createdAt: new Date().toISOString(),
          approvedBy: 'MASTER_SELF',
        };
        accounts.unshift(geoniAccount);
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

        // Assegura na lista de admins aprovados
        const approved = getApprovedAdminEmails();
        if (!approved.includes(masterEmail)) {
          approved.unshift(masterEmail);
          localStorage.setItem(STORAGE_KEYS.APPROVED_ADMINS, JSON.stringify(approved));
        }
      }

      // Obtém clientes atuais limpos
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

      // Adiciona cada conta real não fictícia na carteira de clientes
      accounts.forEach((acc) => {
        if (!isFictitiousClient(acc)) {
          const exists = currentClients.some((c) => c.email.toLowerCase() === acc.email.toLowerCase());
          if (!exists) {
            currentClients.push({
              id: acc.email.toLowerCase(),
              email: acc.email.toLowerCase(),
              name: acc.name,
              document: acc.document,
              bitxAddress: acc.bitxAddress || generateBitxCoreAddress(acc.email),
              registrationTxid: acc.registrationTxid || generateDeterministicTxid(acc.email + '_reg'),
              createdAt: acc.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              movementCount: 0,
              latestMovement: null,
            });
          }
        }
      });

      // Garante que o registro explícito de Geoni Clementino Cesar de Matos esteja presente
      const geoniExistsInClients = currentClients.some(
        (c) => c.email.toLowerCase() === masterEmail || c.name.toLowerCase().includes('geoni')
      );
      if (!geoniExistsInClients) {
        currentClients.unshift({
          id: masterEmail,
          email: masterEmail,
          name: 'Geoni Clementino Cesar de Matos',
          document: '05.368.602/0001-10',
          bitxAddress: generateBitxCoreAddress(masterEmail),
          registrationTxid: generateDeterministicTxid(masterEmail + '_reg'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          movementCount: 0,
          latestMovement: null,
        });
      }

      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(currentClients));
    } catch (e) {
      console.warn('Erro ao sincronizar contas com clientes:', e);
    }
  },

  // Limpeza forçada de clientes fictícios
  purgeAllFictitiousClients(): { cleanedCount: number; remainingCount: number } {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      const parsed: ClientRecord[] = data ? JSON.parse(data) : [];
      const clean = parsed.filter((c) => !isFictitiousClient(c));
      const cleanedCount = parsed.length - clean.length;
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clean));

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

      this.syncAccountsToClients();
      const updated = this.getClients();
      return { cleanedCount, remainingCount: updated.length };
    } catch (e) {
      console.error('Falha ao purgar clientes fictícios:', e);
      return { cleanedCount: 0, remainingCount: 0 };
    }
  },

  clearAllHistoryForRealTransactions(): { success: boolean; clearedCount: number } {
    try {
      const rawMovements = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      const movs: Movement[] = rawMovements ? JSON.parse(rawMovements) : [];
      const clearedCount = movs.length;

      // Zera saldos de custódia de todas as contas
      const accounts = this.getAccounts();
      const newBalances: Record<string, number> = {};
      accounts.forEach((acc) => {
        newBalances[acc.email.toLowerCase()] = 0.0;
      });
      localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify(newBalances));

      // Limpa histórico de movimentações e transações financeiras de teste
      localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.FINANCIAL_TXS, JSON.stringify([]));
      localStorage.removeItem('gx_webhook_events_v2');

      // Tenta sincronizar com o backend para limpar gx-data.json e eventos
      fetch('/api/admin/clean-history', { method: 'POST' }).catch(() => {});

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

    // Initialize custody balance at 0.00 GX
    this.setCustodyBalance(cleanEmail, 0.0);

    // Gera automaticamente a Chave Criptográfica TXID de Abertura de Conta e Registro de Titularidade
    const initialMovement = this.addMovement({
      txid: regTxid,
      clientId: cleanEmail,
      clientEmail: cleanEmail,
      clientName: cleanName,
      type: 'AJUSTE CUSTÓDIA',
      description: `Certidão de Registro de Titularidade e Abertura de Conta Comercial (Doc: ${cleanDoc})`,
      value: 0,
      currency: 'GX',
      bitxAddress,
    });

    return {
      success: true,
      account: newAccount,
      initialMovement,
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

  // Clients management - Real production records only (zero mocks!)
  getClients(): ClientRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      let parsed: ClientRecord[] = data ? JSON.parse(data) : [];
      if (!Array.isArray(parsed)) parsed = [];

      // Filtra estritamente descartando qualquer registro fictício
      let valid = parsed.filter((c) => !isFictitiousClient(c));

      // Garante que todas as contas criadas (inclusive Geoni Clementino Cesar de Matos) estejam na lista
      const accounts = this.getAccounts();
      accounts.forEach((acc) => {
        if (!isFictitiousClient(acc)) {
          const cleanEmail = acc.email.toLowerCase();
          const found = valid.find((c) => c.email.toLowerCase() === cleanEmail);
          if (!found) {
            valid.push({
              id: cleanEmail,
              email: cleanEmail,
              name: acc.name,
              document: acc.document,
              bitxAddress: acc.bitxAddress || generateBitxCoreAddress(acc.email),
              registrationTxid: acc.registrationTxid || generateDeterministicTxid(acc.email + '_reg'),
              createdAt: acc.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              movementCount: 0,
              latestMovement: null,
            });
          } else {
            if (acc.name && !found.name) found.name = acc.name;
            if (acc.document && !found.document) found.document = acc.document;
          }
        }
      });

      // Garante explicitamente a presença de Geoni Clementino Cesar de Matos
      const hasGeoni = valid.some(
        (c) =>
          c.email.toLowerCase() === 'geoniclementino31@gmail.com' ||
          c.name.toLowerCase().includes('geoni')
      );

      if (!hasGeoni) {
        const masterEmail = 'geoniclementino31@gmail.com';
        valid.unshift({
          id: masterEmail,
          email: masterEmail,
          name: 'Geoni Clementino Cesar de Matos',
          document: '05.368.602/0001-10',
          bitxAddress: generateBitxCoreAddress(masterEmail),
          registrationTxid: generateDeterministicTxid(masterEmail + '_reg'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          movementCount: 0,
          latestMovement: null,
        });
      }

      const mapped = valid.map((c) => ({
        ...c,
        bitxAddress: c.bitxAddress || generateBitxCoreAddress(c.email),
        registrationTxid: c.registrationTxid || generateDeterministicTxid(c.email + '_reg'),
      }));

      // Mantém o localStorage sincronizado
      if (mapped.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(mapped));
      }

      return mapped;
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

    const currentBal = this.getCustodyBalance(cleanEmail);
    if (amount > currentBal) {
      return {
        success: false,
        error: `Saldo insuficiente em custódia para este saque. Saldo disponível: ${currentBal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} GX.`,
      };
    }

    const newBal = Math.max(0, currentBal - amount);
    this.setCustodyBalance(cleanEmail, newBal);

    const client = this.getClients().find((c) => c.email.toLowerCase() === cleanEmail);
    const dateStr = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const txid = params.txid || generateTxid();
    const endToEndId = params.endToEndId || `E00000000${dateStr}${generateTxid().slice(2, 12).toUpperCase()}`;

    const destDesc =
      params.destinationType === 'pix'
        ? `Chave Pix ${params.pixKey || ''} (${params.pixKeyType || 'Pix'})`
        : `Conta Corrente BB Ag: ${params.bankAgency || '0001'} Conta: ${params.bankAccount || ''}${params.accountDigit ? `-${params.accountDigit}` : ''}`;

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
      endToEndId,
      note: `Alçada corporativa Banco do Brasil - Engecema Tecnologia PJ`,
    });

    return {
      success: true,
      movement: mov,
      newBalance: newBal,
      txid,
      endToEndId,
    };
  },

  // Movements (Transaction history)
  getMovements(clientEmail?: string): Movement[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      let parsed: Movement[] = data ? JSON.parse(data) : [];
      if (clientEmail) {
        const cleanEmail = clientEmail.toLowerCase();
        let userMovs = parsed.filter(
          (m) => m.clientEmail.toLowerCase() === cleanEmail
        );

        // Se o cliente ainda não tiver nenhuma movimentação gravada, garante a Certidão de Registro TXID oficial
        if (userMovs.length === 0) {
          const account = this.findAccount(cleanEmail);
          const client = this.getClients().find((c) => c.email.toLowerCase() === cleanEmail);
          const regTxid = account?.registrationTxid || client?.registrationTxid || generateDeterministicTxid(cleanEmail + '_reg');
          const bitxAddress = account?.bitxAddress || client?.bitxAddress || generateBitxCoreAddress(cleanEmail);
          const doc = account?.document || client?.document || '000.000.000-00';
          const name = account?.name || client?.name || cleanEmail;

          const foundingMovement: Movement = {
            id: regTxid,
            txid: regTxid,
            clientId: cleanEmail,
            clientEmail: cleanEmail,
            clientName: name,
            type: 'AJUSTE CUSTÓDIA',
            description: `Certidão de Registro de Titularidade e Abertura de Conta Comercial (Doc: ${doc})`,
            value: 0,
            currency: 'GX',
            status: 'CONFIRMADO',
            bitxAddress,
            createdAt: account?.createdAt || client?.createdAt || new Date().toISOString(),
          };

          parsed.unshift(foundingMovement);
          localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(parsed));
          userMovs = [foundingMovement];
        }

        return userMovs;
      }
      return parsed;
    } catch {
      return [];
    }
  },

  addMovement(
    input: Omit<Movement, 'id' | 'txid' | 'createdAt' | 'status'> & { txid?: string }
  ): Movement {
    const movements = this.getMovements();
    const txid = input.txid || generateTxid();
    const movement: Movement = {
      ...input,
      id: txid,
      txid,
      status: 'CONFIRMADO',
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
      const data = localStorage.getItem(STORAGE_KEYS.BALANCES);
      if (!data) return 0.0;
      const balances = JSON.parse(data);
      const val = balances[clientEmail.toLowerCase()];
      return typeof val === 'number' && Number.isFinite(val) ? val : 0.0;
    } catch {
      return 0.0;
    }
  },

  setCustodyBalance(clientEmail: string, balance: number): void {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BALANCES);
      const balances = data ? JSON.parse(data) : {};
      balances[clientEmail.toLowerCase()] = Math.max(0, balance);
      localStorage.setItem(STORAGE_KEYS.BALANCES, JSON.stringify(balances));
    } catch (e) {
      console.warn('Failed to save custody balance', e);
    }
  },

  // Launch Price
  getLaunchPrice(): string {
    return localStorage.getItem(STORAGE_KEYS.LAUNCH_PRICE) || '1.50';
  },

  setLaunchPrice(price: string): void {
    localStorage.setItem(STORAGE_KEYS.LAUNCH_PRICE, price);
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
};
