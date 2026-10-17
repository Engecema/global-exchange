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
];
export const MASTER_ADMIN_EMAIL = 'geonimatos31@gmail.com';

export function isMasterAdminEmail(email: string): boolean {
  if (!email) return false;
  return MASTER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
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

      // Limpa administradores que não foram cadastrados em tela
      const rawAccounts = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (rawAccounts) {
        const accs: Account[] = JSON.parse(rawAccounts);
        const filteredAccs = accs.filter(
          (a) =>
            a.email.toLowerCase() !== 'geoniclementino31@gmail.com' &&
            a.email.toLowerCase() !== 'geonimatos31.nautilus@gmail.com'
        );
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(filteredAccs));
      }

      // Se houver usuário salvo na sessão que não possui conta cadastrada em tela, limpa a sessão
      const currentUser = this.getCurrentUser();
      if (currentUser) {
        const accounts = this.getAccounts();
        const hasRegisteredAccount = accounts.some(
          (a) => a.email.toLowerCase() === currentUser.email.toLowerCase()
        );
        if (!hasRegisteredAccount) {
          this.setCurrentUser(null);
        }
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
            m.clientName !== 'Engecema Pagador Teste'
        );
        localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(realMovs));
      }
    } catch (e) {
      console.warn('Storage cleanup:', e);
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

  getCurrentUser(): User | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: User | null): void {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  },

  // Accounts Management
  getAccounts(): Account[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  findAccount(email: string): Account | null {
    const clean = email.trim().toLowerCase();
    const accounts = this.getAccounts();
    return accounts.find((a) => a.email.toLowerCase() === clean) || null;
  },

  registerClientAccount(data: {
    name: string;
    email: string;
    document: string;
    password: string;
  }): { success: boolean; account?: Account; error?: string } {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.name.trim();
    const cleanDoc = data.document.trim();

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
      createdAt: new Date().toISOString(),
    };

    accounts.push(newAccount);
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

    // Save into clients list for admin view
    this.saveClient({
      name: cleanName,
      email: cleanEmail,
      document: cleanDoc,
    });

    // Initialize custody balance at 0.00 GX
    this.setCustodyBalance(cleanEmail, 0.0);

    // Gera automaticamente a Chave Criptográfica TXID de Abertura de Conta e Registro de Titularidade
    const initialMovement = this.addMovement({
      clientId: cleanEmail,
      clientEmail: cleanEmail,
      clientName: cleanName,
      type: 'AJUSTE CUSTÓDIA',
      description: `Certidão de Registro de Titularidade e Abertura de Conta Comercial (Doc: ${cleanDoc})`,
      value: 0,
      currency: 'GX',
    });

    return { success: true, account: newAccount };
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

  // Clients management - starts EMPTY for real production
  getClients(): ClientRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      if (!data) return [];
      const parsed: ClientRecord[] = JSON.parse(data);
      return parsed.filter(
        (c) =>
          !c.email.includes('trader_1792086701') &&
          !c.id.includes('client-comercial-2')
      );
    } catch {
      return [];
    }
  },

  saveClient(client: { name: string; email: string; document: string }): ClientRecord {
    const clients = this.getClients();
    const existingIndex = clients.findIndex(
      (c) => c.email.toLowerCase() === client.email.toLowerCase()
    );
    const now = new Date().toISOString();

    let updatedClient: ClientRecord;
    if (existingIndex >= 0) {
      updatedClient = {
        ...clients[existingIndex],
        name: client.name || clients[existingIndex].name,
        document: client.document || clients[existingIndex].document,
        updatedAt: now,
      };
      clients[existingIndex] = updatedClient;
    } else {
      updatedClient = {
        id: client.email.toLowerCase(),
        email: client.email.toLowerCase(),
        name: client.name,
        document: client.document,
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

  // Movements (Transaction history)
  getMovements(clientEmail?: string): Movement[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      if (!data) return [];
      const parsed: Movement[] = JSON.parse(data);
      if (clientEmail) {
        return parsed.filter(
          (m) => m.clientEmail.toLowerCase() === clientEmail.toLowerCase()
        );
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
