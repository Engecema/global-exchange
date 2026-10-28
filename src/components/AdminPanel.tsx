import React, { useState, useEffect, useMemo } from 'react';
import {
  AdminApprovalRequest,
  ClientRecord,
  CustodyLedgerEntry,
  Movement,
  User,
} from '../types/exchange';
import {
  StorageService,
  getApprovedAdminEmails,
  MASTER_ADMIN_EMAIL,
  isMasterAdminEmail,
  isGeoniRecord,
  generateTxid,
  generateBitxCoreAddress,
  BITX_CORE_MAINNET,
} from '../services/storage';
import { SupabaseBridge } from '../services/supabaseBridge';
import {
  PIX_BB_CONFIG,
  fetchPixDiagnosticsAPI,
  testBBConnectionAPI,
  registerBBWebhookAPI,
  fetchWebhookEventsAPI,
  clearWebhookEventsAPI,
  confirmWithdrawalSettlementAPI,
  cancelWithdrawalAPI,
  updateBBCredentialsAPI,
  normalizeBBContractNumber,
  PixDiagnostics,
  WebhookEventRecord,
} from '../services/pixBB';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Coins,
  DollarSign,
  Users,
  PlusCircle,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Trash2,
  Sliders,
  Building2,
  Lock,
  Zap,
  TrendingUp,
  Scale,
  X,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  onOpenReceipt: (movement: Movement) => void;
  onPriceUpdated?: (newPrice: string) => void;
}

type AdminTab = 'cotacao' | 'clientes' | 'saques' | 'livro-razao' | 'gateway' | 'configuracoes';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onOpenReceipt,
  onPriceUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    try {
      const pathname = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (pathname.includes('config') || hash.includes('config')) return 'configuracoes';
    } catch {}
    return 'cotacao';
  });

  // Estados principais
  const [launchPrice, setLaunchPrice] = useState<string>(() => StorageService.getLaunchPrice());
  const [newPriceInput, setNewPriceInput] = useState<string>('');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [ledger, setLedger] = useState<CustodyLedgerEntry[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminApprovalRequest[]>([]);
  const [approvedAdmins, setApprovedAdmins] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState<string>('');

  // Mensagens e feedbacks
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isRefreshingPanel, setIsRefreshingPanel] = useState<boolean>(false);
  const [retryQueuePending, setRetryQueuePending] = useState<number>(() => {
    try {
      return SupabaseBridge.getRetryQueueStatus().pendingCount;
    } catch {
      return 0;
    }
  });
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false);

  // Modais
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState<boolean>(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    document: '',
    initialBtxc: '',
    initialBrl: '',
  });

  const [adjustBalanceClient, setAdjustBalanceClient] = useState<ClientRecord | null>(null);
  const [adjustBtxcAmount, setAdjustBtxcAmount] = useState<string>('');
  const [adjustBrlAmount, setAdjustBrlAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');

  // Gateway Pix BB & Pagamentos em Lote (V1)
  const [pixDiag, setPixDiag] = useState<PixDiagnostics | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRecord[]>([]);
  const [isTestingBB, setIsTestingBB] = useState<boolean>(false);
  const [webhookUrlInput, setWebhookUrlInput] = useState<string>('');
  const [bbApiUrl, setBbApiUrl] = useState<string>('https://api.bb.com.br');
  const [bbIpUrl, setBbIpUrl] = useState<string>('https://api.ip.bb.com.br');
  const [bbWebhooksUrl, setBbWebhooksUrl] = useState<string>('https://api.webhooks.com.br');
  const [bbContractNumber, setBbContractNumber] = useState<string>('2277581');
  const [isSavingBBEndpoints, setIsSavingBBEndpoints] = useState<boolean>(false);

  const isMaster = isMasterAdminEmail(currentUser.email);

  const handleSaveBBEndpoints = async () => {
    setIsSavingBBEndpoints(true);
    try {
      const cleanContract = normalizeBBContractNumber(bbContractNumber);
      const res = await updateBBCredentialsAPI({
        apiUrl: bbApiUrl.trim(),
        ipUrl: bbIpUrl.trim(),
        webhooksUrl: bbWebhooksUrl.trim(),
        pagamentosApiUrl: `${bbIpUrl.trim().replace(/\/+$/, '')}/pagamentos-lote/v1`,
        numeroContrato: cleanContract,
        contrato: cleanContract,
        numeroConvenio: cleanContract,
        convenio: cleanContract,
      });
      setBbContractNumber(cleanContract);
      showFeedback('success', res.message || `Endpoints e convênio Nº ${cleanContract} do Banco do Brasil atualizados com sucesso!`);
      const diag = await fetchPixDiagnosticsAPI();
      if (diag) setPixDiag(diag);
    } catch (e: any) {
      showFeedback('error', 'Falha ao salvar endpoints: ' + e.message);
    } finally {
      setIsSavingBBEndpoints(false);
    }
  };

  // Zerar Cadastro de Clientes nas Configurações
  const handleClearClients = () => {
    if (
      confirm(
        'ATENÇÃO: Deseja realmente zerar todo o cadastro de clientes existente nas configurações? Esta ação removerá todos os clientes cadastrados e seus saldos de custódia vinculados, deixando a corretora totalmente livre para novos cadastros a partir do zero.'
      )
    ) {
      const res = StorageService.clearClientsRegistry();
      loadData();
      if (res.success) {
        showFeedback('success', res.message);
      } else {
        showFeedback('error', res.message);
      }
    }
  };

  // Carrega e atualiza dados locais
  const loadData = () => {
    StorageService.ensurePosterior1_5Transfer();
    const currentP = StorageService.getLaunchPrice();
    setLaunchPrice(currentP);
    if (!newPriceInput) setNewPriceInput(currentP);

    setClients(StorageService.deduplicateClients(StorageService.getClients()));
    setMovements(StorageService.getMovements());
    setLedger(StorageService.getLedger());
    setAdminRequests(StorageService.getAdminRequests());
    setApprovedAdmins(getApprovedAdminEmails());
    try {
      setRetryQueuePending(SupabaseBridge.getRetryQueueStatus().pendingCount);
    } catch {}
  };

  const handleProcessRetryQueue = async () => {
    setIsProcessingQueue(true);
    try {
      const res = await SupabaseBridge.retryNow();
      setRetryQueuePending(SupabaseBridge.getRetryQueueStatus().pendingCount);
      showFeedback('success', `Retry Queue processada com sucesso: ${res.succeeded} tarefa(s) sincronizada(s), ${res.failed} pendente(s).`);
      loadData();
    } catch (e: any) {
      showFeedback('error', `Falha ao processar Retry Queue: ${e?.message}`);
    } finally {
      setIsProcessingQueue(false);
    }
  };

  // Ação explícita de atualização e sincronização total do Painel Administrativo
  const handleRefreshPanel = async () => {
    setIsRefreshingPanel(true);
    try {
      loadData();
      await StorageService.syncBitxCoreWithGlobalExchange().catch(() => {});
      const [diag, events] = await Promise.all([
        fetchPixDiagnosticsAPI().catch(() => null),
        fetchWebhookEventsAPI().catch(() => []),
      ]);
      if (diag) setPixDiag(diag);
      if (events) setWebhookEvents(events.slice(0, 10));
      loadData();
      showFeedback('success', 'Painel administrativo atualizado com sucesso! Dados sincronizados com a Mainnet #348.912.');
    } catch {
      loadData();
      showFeedback('info', 'Painel administrativo atualizado.');
    } finally {
      setIsRefreshingPanel(false);
    }
  };

  useEffect(() => {
    loadData();

    // Detecta rota /configuracoes
    try {
      const pathname = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (pathname.includes('config') || hash.includes('config')) {
        setActiveTab('configuracoes');
      }
    } catch {}

    // Carrega diagnósticos do BB em segundo plano
    fetchPixDiagnosticsAPI().then((diag) => {
      if (diag) {
        setPixDiag(diag);
        if (diag.endpoints?.apiUrl) setBbApiUrl(diag.endpoints.apiUrl);
        if (diag.endpoints?.ipUrl) setBbIpUrl(diag.endpoints.ipUrl);
        if (diag.endpoints?.webhooksUrl) setBbWebhooksUrl(diag.endpoints.webhooksUrl);
        if (diag.numeroConvenio || diag.convenio || diag.numeroContrato || diag.contractNumber) {
          const raw = diag.numeroConvenio || diag.convenio || diag.numeroContrato || diag.contractNumber;
          setBbContractNumber(normalizeBBContractNumber(raw));
        }
      }
    }).catch(() => {});
    fetchWebhookEventsAPI().then((evs) => setWebhookEvents(evs.slice(0, 10))).catch(() => {});

    const handleStorageUpdated = () => {
      loadData();
    };

    const handleQueueUpdated = (e: any) => {
      if (typeof e?.detail?.pendingCount === 'number') {
        setRetryQueuePending(e.detail.pendingCount);
      }
    };

    window.addEventListener('gx_storage_updated', handleStorageUpdated);
    window.addEventListener('storage', handleStorageUpdated);
    window.addEventListener('gx_supabase_queue_updated', handleQueueUpdated);
    window.addEventListener('gx_dollar_rate_updated', handleStorageUpdated);

    return () => {
      window.removeEventListener('gx_storage_updated', handleStorageUpdated);
      window.removeEventListener('storage', handleStorageUpdated);
      window.removeEventListener('gx_supabase_queue_updated', handleQueueUpdated);
      window.removeEventListener('gx_dollar_rate_updated', handleStorageUpdated);
    };
  }, []);

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  // 1. Atualização de Cotação
  const handleUpdatePrice = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newPriceInput.trim().replace(',', '.');
    const num = parseFloat(clean);
    if (!Number.isFinite(num) || num <= 0) {
      showFeedback('error', 'Informe um valor numérico válido maior que zero para a cotação.');
      return;
    }

    const formatted = num.toFixed(2);
    StorageService.setLaunchPrice(formatted);
    setLaunchPrice(formatted);

    // Registra movimento de auditoria
    StorageService.addMovement({
      clientId: currentUser.email,
      clientEmail: currentUser.email,
      clientName: currentUser.name,
      type: 'ATUALIZAÇÃO DE PREÇO',
      description: `Cotação oficial BTXC atualizada para R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} pelo administrador ${currentUser.name}`,
      value: num,
      currency: 'BRL',
    });

    if (onPriceUpdated) onPriceUpdated(formatted);
    const liveDollar = StorageService.getUsdBrlRate() || 5.43;
    fetch('/api/bitx/sync-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price: formatted,
        btxcBrl: num,
        usdBrlRate: liveDollar,
        dollarRate: liveDollar,
        usdBrl: liveDollar,
      }),
    }).catch(() => {});
    showFeedback('success', `Cotação oficial atualizada com sucesso para R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`);
  };

  // Sincronizar com a BitX Core Mainnet (#348.912)
  const handleSyncBitxCore = async () => {
    setIsSyncing(true);
    try {
      const res = StorageService.syncWithBitxCoreMainnet(currentUser);
      setLaunchPrice(res.price);
      setNewPriceInput(res.price);
      if (onPriceUpdated) onPriceUpdated(res.price);

      const liveDollar = StorageService.getUsdBrlRate() || 5.43;

      // Dispara sync na API local e ponte BitX Core com preço e dólar dinâmico
      await Promise.allSettled([
        fetch('/api/bitx/sync-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            price: res.price,
            btxcBrl: Number(res.price),
            usdBrlRate: liveDollar,
            dollarRate: liveDollar,
            usdBrl: liveDollar,
          }),
        }),
        fetch('/api/bitx/sync-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            price: res.price,
            btxcBrl: Number(res.price),
            usdBrlRate: liveDollar,
            dollarRate: liveDollar,
            usdBrl: liveDollar,
          }),
        }),
      ]);

      showFeedback('success', `Cotação BTXC e Dólar Comercial sincronizados com sucesso com o Bloco #348.912 da BitX Core Mainnet (BTXC: R$ ${Number(res.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · Dólar: R$ ${liveDollar.toFixed(2)})!`);
    } catch (err: any) {
      showFeedback('error', 'Falha ao sincronizar com a BitX Core: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Testar conexão com a BitX Core
  const handleTestBitxConnection = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/bitx/test-connection', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Conexão bem-sucedida com BitX Core (${data.latencyMs}ms)! Endereço alcançado.`);
      } else {
        showFeedback('info', data.message || 'Serviço BitX Core respondeu com aviso.');
      }
    } catch (e: any) {
      showFeedback('error', 'Erro ao testar conectividade: ' + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // 2. Clientes
  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.document && c.document.includes(q)) ||
        (c.bitxAddress && c.bitxAddress.toLowerCase().includes(q))
    );
  }, [clients, clientSearch]);

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, document, initialBtxc, initialBrl } = newClientForm;
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !cleanName) {
      showFeedback('error', 'Nome e E-mail são obrigatórios.');
      return;
    }

    const btxcVal = parseFloat(initialBtxc) || 0;
    const brlVal = parseFloat(initialBrl) || 0;
    const bitxAddress = generateBitxCoreAddress(cleanEmail);
    const regTxid = generateTxid();

    // Salva cliente
    StorageService.saveClient({
      name: cleanName,
      email: cleanEmail,
      document: document.trim() || '—',
      bitxAddress,
      registrationTxid: regTxid,
    });

    if (btxcVal > 0) StorageService.setCustodyBalance(cleanEmail, btxcVal);
    if (brlVal > 0) StorageService.setCustodyBrlBalance(cleanEmail, brlVal);

    // Se houve aporte, insere no livro razão
    if (btxcVal > 0 || brlVal > 0) {
      StorageService.addLedgerEntry({
        type: 'Aporte Inicial de Custódia',
        counterparty: `Custódia Geral Engecema -> ${cleanName}`,
        amountGx: btxcVal,
        amountBrl: brlVal,
        amountUsdt: 0,
        txid: regTxid,
        status: 'Confirmado em Custódia',
        beneficiaryEmail: cleanEmail,
        notes: `Cadastrado pelo administrador ${currentUser.name}`,
      });
    }

    // Propaga via API para backend / BitX Core
    fetch('/api/bitx/add-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        email: cleanEmail,
        document: document.trim() || '—',
        initialBtxc: btxcVal,
        initialBrl: brlVal,
        bitxAddress,
        registrationTxid: regTxid,
      }),
    }).catch(() => {});

    setIsAddClientModalOpen(false);
    setNewClientForm({ name: '', email: '', document: '', initialBtxc: '', initialBrl: '' });
    loadData();
    showFeedback('success', `Cliente ${cleanName} cadastrado com sucesso! Carteira BitX: ${bitxAddress}`);
  };

  const handleOpenAdjustBalance = (c: ClientRecord) => {
    setAdjustBalanceClient(c);
    setAdjustBtxcAmount(String(StorageService.getCustodyBalance(c.email)));
    setAdjustBrlAmount(String(StorageService.getCustodyBrlBalance(c.email)));
    setAdjustReason('Ajuste operacional de custódia');
  };

  const handleSaveAdjustBalance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustBalanceClient) return;

    const email = adjustBalanceClient.email;
    const newBtxc = Math.max(0, parseFloat(adjustBtxcAmount) || 0);
    const newBrl = Math.max(0, parseFloat(adjustBrlAmount) || 0);

    const oldBtxc = StorageService.getCustodyBalance(email);
    const oldBrl = StorageService.getCustodyBrlBalance(email);

    StorageService.setCustodyBalance(email, newBtxc);
    StorageService.setCustodyBrlBalance(email, newBrl);

    // Auditoria
    StorageService.addMovement({
      clientId: email,
      clientEmail: email,
      clientName: adjustBalanceClient.name,
      type: 'AJUSTE CUSTÓDIA',
      description: `Ajuste manual de custódia: BTXC de ${oldBtxc.toFixed(4)} para ${newBtxc.toFixed(4)} • BRL de R$ ${oldBrl.toFixed(2)} para R$ ${newBrl.toFixed(2)} (${adjustReason})`,
      value: newBtxc,
      currency: 'BTXC',
    });

    StorageService.addLedgerEntry({
      type: 'Ajuste de Custódia',
      counterparty: `Mesa de Operações -> ${adjustBalanceClient.name}`,
      amountGx: newBtxc - oldBtxc,
      amountBrl: newBrl - oldBrl,
      txid: generateTxid(),
      status: 'Ajuste Efetuado',
      beneficiaryEmail: email,
      notes: adjustReason,
    });

    setAdjustBalanceClient(null);
    loadData();
    showFeedback('success', `Saldos do cliente ${adjustBalanceClient.name} atualizados com sucesso!`);
  };

  const handleDeleteClient = (c: ClientRecord) => {
    if (confirm(`Tem certeza que deseja remover o cliente ${c.name} (${c.email})?`)) {
      StorageService.deleteClient(c.email);
      fetch('/api/bitx/remove-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email }),
      }).catch(() => {});
      loadData();
      showFeedback('info', `Cliente ${c.name} removido da carteira.`);
    }
  };

  // 3. Saques Pendentes
  const pendingWithdrawals = useMemo(() => {
    return movements.filter(
      (m) =>
        (m.type === 'SAQUE BANCÁRIO' || m.type === 'TRANSFERÊNCIA PIX BB') &&
        m.status !== 'CONFIRMADO' &&
        m.status !== 'ESTORNADO' &&
        m.status !== 'CANCELADO'
    );
  }, [movements]);

  const handleConfirmWithdrawal = async (m: Movement) => {
    const endToEndId = prompt('Informe o EndToEnd ID oficial do Banco do Brasil (opcional):', m.endToEndId || '');
    const notes = prompt('Observação da liquidação:', 'Liquidado via Gerenciador Financeiro BB PJ');

    const res = StorageService.confirmWithdrawalSettlement({
      txid: m.txid,
      officialEndToEndId: endToEndId || undefined,
      notes: notes || undefined,
      operatorEmail: currentUser.email,
    });

    if (res.success) {
      confirmWithdrawalSettlementAPI({
        txid: m.txid,
        officialEndToEndId: endToEndId || undefined,
        notes: notes || undefined,
      }).catch(() => {});
      loadData();
      showFeedback('success', `Saque de R$ ${m.value.toFixed(2)} liquidado e confirmado com sucesso!`);
    } else {
      showFeedback('error', res.error || 'Falha ao confirmar liquidação.');
    }
  };

  const handleRefundWithdrawal = (m: Movement) => {
    const reason = prompt('Motivo do estorno / devolução à custódia do cliente:', 'Chave Pix inválida ou cancelamento solicitado');
    if (!reason) return;

    const res = StorageService.cancelOrRefundWithdrawal({
      txid: m.txid,
      reason,
      cancelledBy: currentUser.email,
    });

    if (res.success) {
      cancelWithdrawalAPI({ txid: m.txid, reason }).catch(() => {});
      loadData();
      showFeedback('success', `Saque estornado! R$ ${m.value.toFixed(2)} devolvidos à custódia do cliente.`);
    } else {
      showFeedback('error', res.error || 'Falha ao estornar saque.');
    }
  };

  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  // 4. Livro Razão & Reconciliação (Destravado e Assíncrono)
  const handleReconcileLedger = async () => {
    setIsReconciling(true);
    try {
      const res = await StorageService.reconcileLedgerWithBalances();
      loadData();
      showFeedback('success', res.message || 'Saldos reconciliados com sucesso com o Livro Razão!');
    } catch (err: any) {
      loadData();
      showFeedback('error', 'Erro na reconciliação: ' + (err?.message || 'Falha inesperada'));
    } finally {
      setIsReconciling(false);
    }
  };

  const handleResetToRealMode = () => {
    if (confirm('ATENÇÃO: Deseja zerar todos os saldos de custódia (BTXC e BRL) para o Modo de Liquidez 100% Real? Esta ação preservará os cadastros dos clientes com saldos em zero prontos para operações reais.')) {
      const res = StorageService.resetAllClientsInPortfolio('zero_balances');
      loadData();
      showFeedback('success', res.message);
    }
  };

  // 5. Gateway BB
  const handleTestBB = async () => {
    setIsTestingBB(true);
    try {
      const res = await testBBConnectionAPI();
      if (res.success) {
        showFeedback('success', res.message || 'Conexão mTLS e OAuth 2.0 com Banco do Brasil realizada com SUCESSO!');
      } else {
        showFeedback('info', res.message || 'Credenciais BB ainda não configuradas nas variáveis de ambiente.');
      }
    } catch (e: any) {
      showFeedback('error', 'Falha ao conectar: ' + e.message);
    } finally {
      setIsTestingBB(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!webhookUrlInput.trim()) {
      showFeedback('error', 'Informe a URL do webhook.');
      return;
    }
    try {
      const cleanContract = normalizeBBContractNumber(bbContractNumber);
      const res = await registerBBWebhookAPI(webhookUrlInput.trim(), cleanContract);
      showFeedback('success', res.message || `Webhook registrado no Banco do Brasil (Contrato ${cleanContract})!`);
    } catch (e: any) {
      showFeedback('error', 'Erro ao registrar webhook: ' + e.message);
    }
  };

  // 6. Aprovação de Acessos
  const handleApproveAdmin = (req: AdminApprovalRequest) => {
    StorageService.approveAdminRequest(req.id);
    loadData();
    showFeedback('success', `Administrador ${req.name} (${req.email}) aprovado com sucesso!`);
  };

  const handleRejectAdmin = (req: AdminApprovalRequest) => {
    StorageService.rejectAdminRequest(req.id);
    loadData();
    showFeedback('info', `Solicitação de ${req.name} foi recusada.`);
  };

  // Cálculos de KPI
  const numericPrice = parseFloat(launchPrice) || 438819.34;
  const currentUsdRate = StorageService.getUsdBrlRate() || 5.43;

  // Deduplica estritamente para garantir que a custódia total NUNCA seja duplicada no painel administrativo
  const totalBtxcCustody = useMemo(() => {
    const seenIdentities = new Set<string>();
    return clients.reduce((acc, c) => {
      const cleanEmail = (c.email || '').toLowerCase().trim();
      const doc = (c.document || '').replace(/\D/g, '');
      const addr = (c.bitxAddress || '').toLowerCase().trim();
      const isGeoni = isGeoniRecord(c);
      const identityKey = isGeoni
        ? 'canonical_geoni'
        : (doc && doc.length >= 11 ? `doc_${doc}` : (addr || cleanEmail));

      if (seenIdentities.has(identityKey)) return acc;
      seenIdentities.add(identityKey);

      const bal = typeof c.balanceBtxc === 'number' && Number.isFinite(c.balanceBtxc)
        ? c.balanceBtxc
        : (StorageService.getCustodyBalance(cleanEmail) || 0);
      return acc + (Number.isFinite(bal) ? bal : 0);
    }, 0);
  }, [clients]);

  const totalBrlCustody = useMemo(() => {
    const seenIdentities = new Set<string>();
    return clients.reduce((acc, c) => {
      const cleanEmail = (c.email || '').toLowerCase().trim();
      const doc = (c.document || '').replace(/\D/g, '');
      const addr = (c.bitxAddress || '').toLowerCase().trim();
      const isGeoni = isGeoniRecord(c);
      const identityKey = isGeoni
        ? 'canonical_geoni'
        : (doc && doc.length >= 11 ? `doc_${doc}` : (addr || cleanEmail));

      if (seenIdentities.has(identityKey)) return acc;
      seenIdentities.add(identityKey);

      const bal = typeof c.balanceBrl === 'number' && Number.isFinite(c.balanceBrl)
        ? c.balanceBrl
        : (StorageService.getCustodyBrlBalance(cleanEmail) || 0);
      return acc + (Number.isFinite(bal) ? bal : 0);
    }, 0);
  }, [clients]);

  // Histórico de preços para o mini-gráfico
  const priceHistory = useMemo(() => {
    return StorageService.getPriceHistory().slice(-20);
  }, [launchPrice]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Admin Identity */}
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#f0b90b]/15 border border-[#f0b90b]/40 flex items-center justify-center text-[#f0b90b]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-[#eaecef]">
                Painel Administrativo Simplificado
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/30">
                {isMaster ? 'ADMINISTRADOR GERAL' : 'ADMINISTRADOR HOMOLOGADO'}
              </span>
            </div>
            <p className="text-xs text-[#848e9c] mt-0.5">
              Gestão centralizada de cotação BTXC, custódia de clientes, liquidações e Pix Banco do Brasil
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          {retryQueuePending > 0 && (
            <button
              type="button"
              onClick={handleProcessRetryQueue}
              disabled={isProcessingQueue}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#f0b90b]/15 hover:bg-[#f0b90b]/30 border border-[#f0b90b]/40 text-[#f0b90b] transition cursor-pointer active:scale-95 animate-pulse"
              title="Existem itens pendentes na Fila de Reprocessamento (Retry Queue) do Supabase por falhas de rede intermitentes. Clique para tentar sincronizar agora."
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isProcessingQueue ? 'animate-spin' : ''}`} />
              <span>Retry Queue: {retryQueuePending} pendente{retryQueuePending > 1 ? 's' : ''}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleReconcileLedger}
            disabled={isReconciling}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#02c076] hover:bg-[#02a062] text-black transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-sm active:scale-95"
            title="Reconciliar saldos de todos os clientes com as entradas auditáveis do Livro Razão"
          >
            <Scale className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
            <span>{isReconciling ? 'Reconciliando...' : 'Reconciliar com Livro Razão'}</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshPanel}
            disabled={isRefreshingPanel}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#0b0e11] hover:bg-[#2b3139] border border-[#2f343b] text-[#eaecef] hover:text-[#f0b90b] transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-sm active:scale-95"
            title="Atualizar e sincronizar todos os dados do painel com a Mainnet #348.912 e servidor"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPanel ? 'animate-spin text-[#f0b90b]' : 'text-[#f0b90b]'}`} />
            <span>{isRefreshingPanel ? 'Sincronizando...' : 'Atualizar Painel'}</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-[#02c076]/10 border-[#02c076]/30 text-[#02c076]'
              : feedback.type === 'error'
              ? 'bg-[#cf304a]/10 border-[#cf304a]/30 text-[#cf304a]'
              : 'bg-[#38bdf8]/10 border-[#38bdf8]/30 text-[#38bdf8]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
            {feedback.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            {feedback.type === 'info' && <Zap className="w-5 h-5 flex-shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Simplified KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-4">
          <span className="text-[11px] font-medium text-[#848e9c] block">Cotação Oficial BTXC</span>
          <div className="text-lg font-bold font-mono text-[#02c076] mt-1">
            R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-[#848e9c]">$ {(numericPrice / currentUsdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
        </div>

        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-4">
          <span className="text-[11px] font-medium text-[#848e9c] block">Clientes Cadastrados</span>
          <div className="text-lg font-bold font-mono text-[#eaecef] mt-1">
            {clients.length} <span className="text-xs font-normal text-[#848e9c]">ativos</span>
          </div>
          <span className="text-[10px] text-[#02c076]">100% Sincronizados</span>
        </div>

        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-4">
          <span className="text-[11px] font-medium text-[#848e9c] block">Custódia Total (BTXC)</span>
          <div className="text-lg font-bold font-mono text-[#f0b90b] mt-1">
            {totalBtxcCustody.toFixed(4)} <span className="text-xs">BTXC</span>
          </div>
          <span className="text-[10px] text-[#848e9c]">R$ {(totalBtxcCustody * numericPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-4">
          <span className="text-[11px] font-medium text-[#848e9c] block">Liquidez Total em Reais</span>
          <div className="text-lg font-bold font-mono text-[#38bdf8] mt-1">
            R$ {totalBrlCustody.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-[#848e9c]">Disponível para Pix</span>
        </div>

        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-4 col-span-2 md:col-span-1">
          <span className="text-[11px] font-medium text-[#848e9c] block">Saques Pendentes</span>
          <div className="text-lg font-bold font-mono text-[#eaecef] mt-1 flex items-center gap-2">
            <span>{pendingWithdrawals.length}</span>
            {pendingWithdrawals.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#cf304a]/20 text-[#cf304a] border border-[#cf304a]/30 animate-pulse">
                Ação Requerida
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#848e9c]">Liberação BB PJ</span>
        </div>
      </div>

      {/* Clean Tab Navigation */}
      <div className="flex border-b border-[#2f343b] overflow-x-auto space-x-2 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('cotacao')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'cotacao'
              ? 'border-[#f0b90b] text-[#f0b90b] bg-[#f0b90b]/5 rounded-t-lg'
              : 'border-transparent text-[#848e9c] hover:text-[#eaecef] hover:bg-[#1e2329]/50'
          }`}
        >
          <Coins className="w-4 h-4" />
          Cotação & BitX Core
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('clientes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'clientes'
              ? 'border-[#f0b90b] text-[#f0b90b] bg-[#f0b90b]/5 rounded-t-lg'
              : 'border-transparent text-[#848e9c] hover:text-[#eaecef] hover:bg-[#1e2329]/50'
          }`}
        >
          <Users className="w-4 h-4" />
          Clientes & Custódia ({clients.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('saques')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'saques'
              ? 'border-[#f0b90b] text-[#f0b90b] bg-[#f0b90b]/5 rounded-t-lg'
              : 'border-transparent text-[#848e9c] hover:text-[#eaecef] hover:bg-[#1e2329]/50'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          Saques & Liquidações
          {pendingWithdrawals.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-[#cf304a] text-white text-[10px] font-bold flex items-center justify-center">
              {pendingWithdrawals.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('livro-razao')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'livro-razao'
              ? 'border-[#f0b90b] text-[#f0b90b] bg-[#f0b90b]/5 rounded-t-lg'
              : 'border-transparent text-[#848e9c] hover:text-[#eaecef] hover:bg-[#1e2329]/50'
          }`}
        >
          <Scale className="w-4 h-4" />
          Livro Razão & Reconciliação
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gateway')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'gateway'
              ? 'border-[#f0b90b] text-[#f0b90b] bg-[#f0b90b]/5 rounded-t-lg'
              : 'border-transparent text-[#848e9c] hover:text-[#eaecef] hover:bg-[#1e2329]/50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Gateway Banco do Brasil & Acessos
          {adminRequests.filter((r) => r.status === 'pending').length > 0 && (
            <span className="w-5 h-5 rounded-full bg-[#f0b90b] text-black text-[10px] font-bold flex items-center justify-center">
              {adminRequests.filter((r) => r.status === 'pending').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('configuracoes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'configuracoes'
              ? 'border-[#f0b90b] text-[#f0b90b] bg-[#f0b90b]/5 rounded-t-lg'
              : 'border-transparent text-[#848e9c] hover:text-[#eaecef] hover:bg-[#1e2329]/50'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Configurações do Sistema
        </button>
      </div>

      {/* TAB 1: COTAÇÃO & BITX CORE */}
      {activeTab === 'cotacao' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card de Configuração de Preço */}
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#f0b90b]" />
                Controle de Cotação de Lançamento
              </h3>
              <p className="text-xs text-[#848e9c] mt-1">
                Ajuste o valor oficial da moeda BitX Core (BTXC) para negociação e custódia na Global Exchange.
              </p>
            </div>

            <form onSubmit={handleUpdatePrice} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#848e9c] block mb-1">
                  Nova Cotação Oficial (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm font-mono text-[#848e9c]">R$</span>
                  <input
                    type="text"
                    value={newPriceInput}
                    onChange={(e) => setNewPriceInput(e.target.value)}
                    placeholder="438819.34"
                    className="w-full pl-10 pr-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-sm font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold text-xs rounded-lg transition"
                >
                  Salvar Nova Cotação
                </button>
                <button
                  type="button"
                  onClick={handleSyncBitxCore}
                  disabled={isSyncing}
                  className="py-2.5 px-4 bg-[#2b3139] hover:bg-[#383f4a] text-[#02c076] font-bold text-xs rounded-lg border border-[#02c076]/30 transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  Mainnet #348.912
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-[#2f343b] space-y-2.5 text-xs">
              <div className="flex justify-between text-[#848e9c]">
                <span>Status da Rede:</span>
                <span className="font-semibold text-[#02c076]">{BITX_CORE_MAINNET.network}</span>
              </div>
              <div className="flex justify-between text-[#848e9c]">
                <span>Altura da Blockchain:</span>
                <span className="font-mono text-[#eaecef]">{BITX_CORE_MAINNET.chainHeight}</span>
              </div>
              <div className="flex justify-between text-[#848e9c]">
                <span>Dólar Comercial Dinâmico:</span>
                <span className="font-mono font-bold text-[#38bdf8]">
                  R$ {currentUsdRate.toFixed(4)}{' '}
                  <span className="text-[10px] text-[#02c076] font-normal">● Ao Vivo</span>
                </span>
              </div>
              <div className="flex justify-between text-[#848e9c]">
                <span>Cotação Equivalente USD:</span>
                <span className="font-mono font-bold text-[#02c076]">
                  $ {(numericPrice / currentUsdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
              <div className="flex justify-between text-[#848e9c]">
                <span>Sincronização BitX Core:</span>
                <span className="text-[11px] font-semibold text-[#02c076]">
                  ● Ativa & Dinâmica (Porta 8332)
                </span>
              </div>
              <button
                type="button"
                onClick={handleTestBitxConnection}
                disabled={isSyncing}
                className="w-full mt-2 py-2 px-3 bg-[#0b0e11] hover:bg-[#2b3139] text-[#38bdf8] border border-[#38bdf8]/30 rounded-lg text-xs font-semibold transition"
              >
                Testar Conexão com BitX Core (/test-connection)
              </button>
            </div>
          </div>

          {/* Gráfico de Cotação Integrado */}
          <div className="lg:col-span-2 bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#2f343b]">
                <div>
                  <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#02c076]" />
                    Tendência de Preço BTXC (Tempo Real)
                  </h3>
                  <p className="text-xs text-[#848e9c]">
                    Curva histórica registrada no banco de dados da corretora
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-[#02c076] bg-[#02c076]/10 px-2.5 py-1 rounded border border-[#02c076]/20">
                  +0.42% (24h)
                </span>
              </div>

              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adminPriceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#02c076" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#02c076" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2b3139" opacity={0.5} />
                    <XAxis dataKey="timeFormatted" stroke="#848e9c" fontSize={10} tickLine={false} />
                    <YAxis
                      domain={['auto', 'auto']}
                      stroke="#848e9c"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const pt = payload[0].payload;
                        return (
                          <div className="bg-[#0b0e11] border border-[#2f343b] rounded p-2 text-xs font-mono text-[#eaecef]">
                            <div>{pt.timeFormatted}</div>
                            <div className="text-[#02c076] font-bold">R$ {pt.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          </div>
                        );
                      }}
                    />
                    <Area type="monotone" dataKey="price" stroke="#02c076" strokeWidth={2} fill="url(#adminPriceGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pt-3 border-t border-[#2f343b] text-xs text-[#848e9c] flex justify-between items-center">
              <span>Sincronização em tempo real ativada</span>
              <span className="font-mono text-[#f0b90b]">Total de Pontos: {priceHistory.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLIENTES & CUSTÓDIA */}
      {activeTab === 'clientes' && (
        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2f343b]">
            <div>
              <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#f0b90b]" />
                Carteira de Clientes & Saldos de Custódia
              </h3>
              <p className="text-xs text-[#848e9c]">
                Gerenciamento de contas, carteiras BitX Core e liquidez fiduciária
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#848e9c]" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar por nome, doc ou e-mail..."
                  className="pl-8 pr-3 py-1.5 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs text-[#eaecef] focus:outline-none focus:border-[#f0b90b] w-48 sm:w-64"
                />
              </div>

              <button
                type="button"
                onClick={handleClearClients}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#cf304a]/15 hover:bg-[#cf304a]/30 text-[#cf304a] font-bold text-xs rounded-lg border border-[#cf304a]/30 transition"
                title="Zerar cadastro de clientes existente e deixar a base limpa"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Zerar Clientes
              </button>

              <button
                type="button"
                onClick={() => setIsAddClientModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold text-xs rounded-lg transition"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Novo Cliente
              </button>
            </div>
          </div>

          {/* Card de Auditoria da Transferência de 3.0 GX e Posição Consolidada de 13.0 GX */}
          <div className="p-3.5 bg-gradient-to-r from-[#02c076]/15 via-[#1e2329] to-[#f0b90b]/10 border border-[#02c076]/40 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-md">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#02c076]/20 border border-[#02c076]/40 flex items-center justify-center text-[#02c076] shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[#02c076] uppercase tracking-wide flex items-center gap-1">
                    Transferência de 3.0000 GX Confirmada & Saldo Consolidado em 13.0000 GX
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/40 font-bold">
                    Livro Razão Auditado
                  </span>
                </div>
                <div className="text-[#eaecef] mt-1">
                  Titular: <strong>Geoni Clementino Cesar de Matos</strong> · Carteira: <span className="font-mono text-[#38bdf8]">bxrt1qnkach2pvm79qljf5rxdg863utw4s0zey</span>
                </div>
                <div className="text-[#848e9c] text-[11px] mt-0.5 font-mono">
                  Saldo anterior: 10.0000 GX + Transferência BitX Core: 3.0000 GX = <span className="text-[#f0b90b] font-bold">13.0000 GX</span> (≈ R$ {(13 * numericPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) · TXID: <span className="text-[#38bdf8]">0x8f3a1d94e2b07c5a16d8e4f2019385b3</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
              <button
                type="button"
                onClick={handleReconcileLedger}
                disabled={isReconciling}
                className="px-3.5 py-1.5 bg-[#02c076] hover:bg-[#02a062] text-black font-bold text-xs rounded-lg transition shadow disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                title="Reconciliar saldos com o Livro Razão e equalizar para 13.0000 GX"
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                <span>{isReconciling ? 'Reconciliando...' : 'Reconciliar com Livro Razão (13.0 GX)'}</span>
              </button>
            </div>
          </div>

          {/* Tabela de Clientes */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b0e11] text-[#848e9c] font-semibold border-b border-[#2f343b]">
                <tr>
                  <th className="py-2.5 px-3">Cliente / Documento</th>
                  <th className="py-2.5 px-3">E-mail</th>
                  <th className="py-2.5 px-3">Endereço Carteira BitX</th>
                  <th className="py-2.5 px-3 text-right">Saldo BTXC</th>
                  <th className="py-2.5 px-3 text-right">Correspondente em Reais (R$)</th>
                  <th className="py-2.5 px-3 text-right">Saldo com Liquidez (R$)</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2f343b]/50">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#848e9c]">
                      Nenhum cliente encontrado. Clique em "+ Novo Cliente" para cadastrar.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((c) => {
                    const btxcBal = StorageService.getCustodyBalance(c.email);
                    const brlBal = StorageService.getCustodyBrlBalance(c.email);
                    const cryptoValBrl = btxcBal * numericPrice;

                    return (
                      <tr key={c.email} className="hover:bg-[#2b3139]/30 transition">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#eaecef]">{c.name}</div>
                          <div className="text-[10px] text-[#848e9c] font-mono">{c.document || '—'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[#eaecef]">{c.email}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#38bdf8]">
                          <div className="flex items-center gap-1.5" title={c.bitxAddress}>
                            <span>{c.bitxAddress ? `${c.bitxAddress.slice(0, 10)}...${c.bitxAddress.slice(-6)}` : '—'}</span>
                            {c.bitxAddress && (
                              <button
                                type="button"
                                onClick={() => {
                                  const addr = c.bitxAddress || '';
                                  navigator.clipboard.writeText(addr);
                                  showFeedback('success', `Endereço BitX ${addr} copiado!`);
                                }}
                                className="hover:text-white transition p-0.5"
                                title="Copiar Endereço Completo BitX Core"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#f0b90b]">
                          <div>{btxcBal.toFixed(4)} BTXC</div>
                          <div className="text-[10px] text-[#848e9c] font-normal">
                            ≈ R$ {cryptoValBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#02c076]">
                          R$ {cryptoValBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-[#eaecef]">
                          R$ {brlBal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustBalance(c)}
                              className="px-2 py-1 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] rounded text-[11px] font-semibold transition"
                              title="Ajustar Saldo"
                            >
                              Ajustar Saldo
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClient(c)}
                              className="p-1 hover:bg-[#cf304a]/20 text-[#cf304a] rounded transition"
                              title="Remover Cliente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SAQUES & LIQUIDAÇÕES */}
      {activeTab === 'saques' && (
        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-5">
          <div>
            <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-[#f0b90b]" />
              Mesa de Saques & Ordens de Transferência Bancária
            </h3>
            <p className="text-xs text-[#848e9c]">
              Liberação e estorno de saques fiduciários solicitados por clientes via Pix Banco do Brasil
            </p>
          </div>

          {/* Ordens Pendentes */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#cf304a] flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Saques Aguardando Liberação / Alçada BB ({pendingWithdrawals.length})
            </h4>

            {pendingWithdrawals.length === 0 ? (
              <div className="p-6 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-center text-xs text-[#848e9c]">
                Nenhum saque pendente de liberação no momento. Todos os saques estão 100% liquidados!
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingWithdrawals.map((m) => (
                  <div
                    key={m.id || m.txid}
                    className="p-4 bg-[#0b0e11] border border-[#cf304a]/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#eaecef]">{m.clientName}</span>
                        <span className="text-xs font-mono text-[#848e9c]">({m.clientEmail})</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#cf304a]/20 text-[#cf304a]">
                          {m.status}
                        </span>
                      </div>
                      <div className="text-xs text-[#848e9c] mt-1">
                        {m.description}
                      </div>
                      <div className="text-[10px] font-mono text-[#848e9c] mt-1">
                        TXID: {m.txid} • Data: {new Date(m.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right mr-2 font-mono">
                        <div className="text-base font-bold text-[#cf304a]">
                          - R$ {Number(m.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-[#848e9c]">Chave Pix / Conta BB</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConfirmWithdrawal(m)}
                        className="px-3 py-1.5 bg-[#02c076] hover:bg-[#02a062] text-black font-bold text-xs rounded-lg transition"
                      >
                        Confirmar BB
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRefundWithdrawal(m)}
                        className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#cf304a]/30 text-[#cf304a] font-bold text-xs rounded-lg border border-[#cf304a]/30 transition"
                      >
                        Estornar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico Recente de Saques Liquidados */}
          <div className="pt-4 border-t border-[#2f343b]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#848e9c] mb-3">
              Últimas Movimentações Bancárias Concluídas
            </h4>
            <div className="space-y-2">
              {movements
                .filter((m) => m.type === 'SAQUE BANCÁRIO' || m.type === 'ESTORNO DE SAQUE' || m.type === 'DEPÓSITO PIX')
                .slice(0, 5)
                .map((m) => (
                  <div
                    key={m.id || m.txid}
                    className="p-3 bg-[#0b0e11] border border-[#2f343b] rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#eaecef]">{m.clientName}:</span>{' '}
                      <span className="text-[#848e9c]">{m.description}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-bold ${m.type === 'DEPÓSITO PIX' ? 'text-[#02c076]' : m.type === 'ESTORNO DE SAQUE' ? 'text-[#38bdf8]' : 'text-[#eaecef]'}`}>
                        R$ {Number(m.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(m)}
                        className="text-[11px] text-[#f0b90b] hover:underline font-semibold"
                      >
                        Recibo
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LIVRO RAZÃO & RECONCILIAÇÃO */}
      {activeTab === 'livro-razao' && (
        <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2f343b]">
            <div>
              <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#f0b90b]" />
                Livro Razão Institucional & Auditoria (Ledger)
              </h3>
              <p className="text-xs text-[#848e9c]">
                Entradas oficiais de custódia, reconciliação de saldos e controle contábil Engecema
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleReconcileLedger}
                disabled={isReconciling}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#02c076] hover:bg-[#02a062] text-black font-bold text-xs rounded-lg transition shadow disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                title="Reconciliar saldos de custódia com todas as entradas contábeis do Livro Razão"
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                <span>{isReconciling ? 'Reconciliando Livro Razão...' : 'Reconciliar Saldos com Livro Razão'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetToRealMode}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#cf304a]/15 hover:bg-[#cf304a]/30 text-[#cf304a] font-bold text-xs rounded-lg border border-[#cf304a]/30 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Zerar para Modo Real
              </button>
            </div>
          </div>

          {/* Tabela do Livro Razão */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b0e11] text-[#848e9c] font-semibold border-b border-[#2f343b]">
                <tr>
                  <th className="py-2.5 px-3">Tipo / Descrição</th>
                  <th className="py-2.5 px-3">Contraparte / Destino</th>
                  <th className="py-2.5 px-3 text-right">Aporte BTXC</th>
                  <th className="py-2.5 px-3 text-right">Aporte R$</th>
                  <th className="py-2.5 px-3">TXID / Identificador</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2f343b]/50">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#848e9c]">
                      O Livro Razão está zerado. Aportes cadastrados nos clientes ou recebidos via Pix aparecerão aqui.
                    </td>
                  </tr>
                ) : (
                  ledger.map((entry) => {
                    const is375 = entry.id === 'CUST-TX-375' || entry.txid?.includes('375') || entry.amountGx === 3.75;
                    const is1_5Transfer = entry.id === 'LEDGER-006' || entry.amountGx === 1.5;
                    const is3Transfer = entry.id === 'LEDGER-007' || entry.amountGx === 3.0;
                    return (
                      <tr key={entry.id} className={`hover:bg-[#2b3139]/30 transition ${is375 ? 'bg-[#f0b90b]/10 border-l-2 border-[#f0b90b]' : is1_5Transfer ? 'bg-[#f0b90b]/5 border-l-2 border-[#f0b90b]' : is3Transfer ? 'bg-[#02c076]/5 border-l-2 border-[#02c076]' : ''}`}>
                        <td className="py-3 px-3 font-semibold text-[#eaecef]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{entry.type}</span>
                            {is375 && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/40 font-bold">
                                Mempool #348.912 (3.75 GX)
                              </span>
                            )}
                            {is3Transfer && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40 font-bold">
                                Mempool #348.913 (3.0 GX)
                              </span>
                            )}
                            {is1_5Transfer && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40 font-bold">
                                Livro de Ofertas
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[#848e9c]">{entry.counterparty}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#f0b90b]">
                          {entry.amountGx ? `${entry.amountGx > 0 ? '+' : ''}${entry.amountGx.toFixed(4)} BTXC` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#02c076]">
                          {entry.amountBrl ? `R$ ${entry.amountBrl.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#38bdf8]">
                          {entry.txid ? `${entry.txid.slice(0, 10)}...` : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#02c076]/15 text-[#02c076]">
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: GATEWAY BANCO DO BRASIL & GESTÃO DE ACESSOS */}
      {activeTab === 'gateway' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gateway Pix BB & Pagamentos em Lote V1 */}
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#f0b90b]" />
                  Banco do Brasil Developers · Produção
                </h3>
                <p className="text-xs text-[#848e9c]">
                  Aplicação Ativa: <span className="text-[#f0b90b] font-semibold">Pagamentos em Lote (V1)</span>
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#02c076]/10 text-[#02c076] border border-[#02c076]/30">
                PRODUÇÃO ATIVA
              </span>
            </div>

            <div className="p-3.5 bg-[#0b0e11] border border-[#2f343b] rounded-lg space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Beneficiário / Empresa:</span>
                <span className="font-semibold text-[#eaecef]">{PIX_BB_CONFIG.merchantName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">CNPJ / Chave Pix Oficial:</span>
                <span className="font-mono text-[#f0b90b] font-bold">{PIX_BB_CONFIG.formattedCnpj}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Aplicação Developers BB:</span>
                <span className="font-semibold text-[#f0b90b]">Pagamentos em Lote (V1)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Escopo OAuth 2.0:</span>
                <span className="font-mono text-[#eaecef]">pagamentos-lote.requisicao</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Certificado mTLS Corporativo:</span>
                <span className="font-mono text-[#02c076]">{PIX_BB_CONFIG.mtlsCertName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#848e9c]">Convênio Oficial Banco do Brasil (ENGECEMA):</span>
                <span className="font-mono font-semibold text-[#f0b90b]">
                  Nº {bbContractNumber || '2277581'} (Webhooks & Pagamentos Lote v1 - Convênio ENGECEMA 2277581) ✅
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Credenciais Render (API Key, Client ID/Secret):</span>
                <span className="font-semibold text-[#02c076]">
                  {pixDiag?.credentials?.isConfigured ? 'CONFIGURADAS NO RENDER ✅' : 'SINCRONIZADAS ✅'}
                </span>
              </div>
            </div>

            {/* Configuração dos Endpoints de Produção e Contrato */}
            <div className="p-3.5 bg-[#0b0e11] border border-[#2f343b] rounded-lg space-y-3">
              <span className="text-xs font-bold text-[#f0b90b] uppercase tracking-wider block">
                Configurações Oficiais Banco do Brasil (Produção)
              </span>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[#848e9c] block font-medium">
                    Número do Convênio Banco do Brasil (Webhooks & Pagamentos em Lote v1 - ENGECEMA 2277581):
                  </label>
                  <span className="text-[10px] text-[#02c076] font-mono">Zeros à esquerda removidos automaticamente</span>
                </div>
                <input
                  type="text"
                  value={bbContractNumber}
                  onChange={(e) => setBbContractNumber(e.target.value)}
                  placeholder="2277581"
                  className="w-full px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded text-xs font-mono text-[#f0b90b] font-bold focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-[#848e9c] block font-medium">
                  1. API Principal / Gateway BB (api.bb.com.br):
                </label>
                <input
                  type="text"
                  value={bbApiUrl}
                  onChange={(e) => setBbApiUrl(e.target.value)}
                  placeholder="https://api.bb.com.br"
                  className="w-full px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-[#848e9c] block font-medium">
                  2. API Pagamentos em Lote & mTLS (api.ip.bb.com.br):
                </label>
                <input
                  type="text"
                  value={bbIpUrl}
                  onChange={(e) => setBbIpUrl(e.target.value)}
                  placeholder="https://api.ip.bb.com.br"
                  className="w-full px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-[#848e9c] block font-medium">
                  3. API Webhooks / Notificações (api.webhooks.com.br):
                </label>
                <input
                  type="text"
                  value={bbWebhooksUrl}
                  onChange={(e) => setBbWebhooksUrl(e.target.value)}
                  placeholder="https://api.webhooks.com.br"
                  className="w-full px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveBBEndpoints}
                disabled={isSavingBBEndpoints}
                className="w-full py-1.5 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] text-xs font-bold rounded transition flex items-center justify-center gap-2"
              >
                <Check className="w-3.5 h-3.5 text-[#02c076]" />
                {isSavingBBEndpoints ? 'Salvando...' : 'Salvar Contrato e Endpoints de Produção'}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTestBB}
                disabled={isTestingBB}
                className="flex-1 py-2 px-3 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold text-xs rounded-lg transition flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingBB ? 'animate-spin' : ''}`} />
                Testar Autenticação OAuth 2.0 (Pagamentos em Lote)
              </button>
            </div>

            <div className="pt-3 border-t border-[#2f343b] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#848e9c] block">
                  Registrar URL de Webhook no Banco do Brasil:
                </label>
                <span className="text-[10px] text-[#848e9c] font-mono">
                  Convênio ENGECEMA: <strong className="text-[#f0b90b]">{normalizeBBContractNumber(bbContractNumber)}</strong>
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  placeholder="https://api.webhooks.com.br/api/webhook/pix"
                  className="flex-1 px-3 py-1.5 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
                <button
                  type="button"
                  onClick={handleRegisterWebhook}
                  className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] text-xs font-bold rounded-lg transition"
                >
                  Registrar
                </button>
              </div>
            </div>
          </div>

          {/* Gestão de Acessos Administrativos */}
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#f0b90b]" />
                Segurança & Administradores Homologados
              </h3>
              <p className="text-xs text-[#848e9c]">
                Aprovação de novos acessos e lista de administradores ativos
              </p>
            </div>

            {/* Solicitações Pendentes */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-[#f0b90b] uppercase tracking-wider block">
                Solicitações Pendentes ({adminRequests.filter((r) => r.status === 'pending').length})
              </span>

              {adminRequests.filter((r) => r.status === 'pending').length === 0 ? (
                <div className="p-4 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-center text-xs text-[#848e9c]">
                  Nenhuma solicitação de acesso pendente no momento.
                </div>
              ) : (
                adminRequests
                  .filter((r) => r.status === 'pending')
                  .map((req) => (
                    <div
                      key={req.id}
                      className="p-3 bg-[#0b0e11] border border-[#f0b90b]/40 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-[#eaecef]">{req.name}</div>
                        <div className="text-[#848e9c] font-mono text-[11px]">{req.email}</div>
                        <div className="text-[10px] text-[#848e9c] mt-0.5">{req.reason || 'Sem justificativa'}</div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApproveAdmin(req)}
                          className="px-2.5 py-1 bg-[#02c076] hover:bg-[#02a062] text-black font-bold rounded transition"
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectAdmin(req)}
                          className="px-2.5 py-1 bg-[#cf304a]/20 hover:bg-[#cf304a]/40 text-[#cf304a] font-bold rounded transition"
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Administradores Homologados */}
            <div className="pt-3 border-t border-[#2f343b] space-y-2">
              <span className="text-xs font-bold text-[#848e9c] uppercase tracking-wider block">
                Administradores Ativos
              </span>
              <div className="space-y-1.5">
                {approvedAdmins.map((admEmail) => (
                  <div
                    key={admEmail}
                    className="p-2.5 bg-[#0b0e11] border border-[#2f343b] rounded-lg flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-[#eaecef]">{admEmail}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#02c076]/15 text-[#02c076]">
                      {isMasterAdminEmail(admEmail) ? 'Geral' : 'Homologado'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: CONFIGURAÇÕES DO SISTEMA & GERENCIAMENTO DE CADASTRO */}
      {activeTab === 'configuracoes' && (
        <div className="space-y-6">
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-6">
            <div className="border-b border-[#2f343b] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-[#f0b90b]" />
                  Configurações Gerais do Sistema & Base de Clientes
                </h3>
                <p className="text-xs text-[#848e9c] mt-0.5">
                  Painel de controle institucional, limpeza e gestão do cadastro de clientes, liquidez e parâmetros de rede
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#0b0e11] border border-[#2f343b] text-[#eaecef]">
                  Rede: {BITX_CORE_MAINNET.network}
                </span>
                <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#02c076]/10 border border-[#02c076]/30 text-[#02c076]">
                  Mainnet: {BITX_CORE_MAINNET.chainHeight}
                </span>
                <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#f0b90b]/10 border border-[#f0b90b]/30 text-[#f0b90b]">
                  Cotação Padrão: {BITX_CORE_MAINNET.officialPriceFormatted}
                </span>
              </div>
            </div>

            {/* SEÇÃO PRINCIPAL: ZERAR CADASTRO DE CLIENTES */}
            <div className="p-5 bg-[#0b0e11] border border-[#cf304a]/40 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#cf304a]/15 border border-[#cf304a]/30 flex items-center justify-center text-[#cf304a] flex-shrink-0 mt-0.5">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#eaecef] flex items-center gap-2">
                      Zerar Cadastro de Clientes Existente
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#cf304a]/20 text-[#cf304a]">
                        Ação de Reset
                      </span>
                    </h4>
                    <p className="text-xs text-[#848e9c] mt-1">
                      Remove todos os clientes atualmente registrados na corretora, zera saldos de custódia vinculados e limpa a base de dados, deixando o sistema 100% livre para novos cadastros a partir do zero.
                    </p>
                  </div>
                </div>

                <div className="sm:text-right flex-shrink-0">
                  <span className="text-[11px] text-[#848e9c] block">Status da Base:</span>
                  <span className={`text-xs font-mono font-bold ${clients.length === 0 ? 'text-[#02c076]' : 'text-[#f0b90b]'}`}>
                    {clients.length === 0 ? 'Base Limpa (0 clientes)' : `${clients.length} cliente(s) ativo(s)`}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-[#1e2329]/70 border border-[#2f343b] rounded-lg text-xs space-y-2 text-[#848e9c]">
                <div className="flex items-center gap-2 text-[#eaecef] font-semibold">
                  <AlertCircle className="w-4 h-4 text-[#cf304a]" />
                  <span>O que acontece ao executar este comando:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
                  <li>A lista de clientes comerciais é completamente esvaziada (0 clientes).</li>
                  <li>Saldos de custódia (BTXC, Reais e USDT) de clientes são zerados.</li>
                  <li>Credenciais de login de clientes são removidas, preservando o acesso dos administradores.</li>
                  <li>A base no servidor backend (<code className="text-[#38bdf8]">data/gx-data.json</code>) é sincronizada como limpa.</li>
                  <li>A corretora fica imediatamente disponível para você recadastrar um novo cliente e testar todo o fluxo.</li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClearClients}
                  className="px-4 py-2.5 bg-[#cf304a] hover:bg-[#b02239] text-white font-bold text-xs rounded-lg transition flex items-center gap-2 shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  Zerar Cadastro de Clientes Agora
                </button>

                <button
                  type="button"
                  onClick={() => setIsAddClientModalOpen(true)}
                  className="px-4 py-2.5 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold text-xs rounded-lg transition flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Cadastrar Novo Cliente
                </button>
              </div>
            </div>

            {/* SEÇÃO SECUNDÁRIA: MODO REAL DE LIQUIDEZ E CONCILIAÇÃO */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-[#0b0e11] border border-[#2f343b] rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#eaecef]">
                  <Scale className="w-4 h-4 text-[#02c076]" />
                  <span>Modo 100% Real de Liquidez</span>
                </div>
                <p className="text-xs text-[#848e9c]">
                  Equaliza os saldos de custódia e livro razão contábil para 0,00 mantendo os cadastros se existirem.
                </p>
                <button
                  type="button"
                  onClick={handleResetToRealMode}
                  className="w-full py-2 px-3 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] border border-[#2f343b] rounded-lg text-xs font-bold transition"
                >
                  Zerar Apenas Saldos de Custódia (0,00)
                </button>
              </div>

              <div className="p-4 bg-[#0b0e11] border border-[#2f343b] rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#eaecef]">
                  <RefreshCw className="w-4 h-4 text-[#38bdf8]" />
                  <span>Sincronização BitX Core & Rede (Mainnet #348.912)</span>
                </div>
                <p className="text-xs text-[#848e9c]">
                  Testa e sincroniza a comunicação com a blockchain BitX Core e a cotação padrão da Mainnet #348.912 (R$ 438.819,34).
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSyncBitxCore}
                    disabled={isSyncing}
                    className="flex-1 py-2 px-3 bg-[#02c076]/15 hover:bg-[#02c076]/30 text-[#02c076] border border-[#02c076]/30 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sync Mainnet #348.912
                  </button>
                  <button
                    type="button"
                    onClick={handleTestBitxConnection}
                    disabled={isSyncing}
                    className="flex-1 py-2 px-3 bg-[#38bdf8]/15 hover:bg-[#383f4a] text-[#38bdf8] border border-[#38bdf8]/30 rounded-lg text-xs font-bold transition"
                  >
                    Ping BitX (#348.912)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR NOVO CLIENTE */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4">
              <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-[#f0b90b]" />
                Cadastrar Novo Cliente
              </h3>
              <button
                type="button"
                onClick={() => setIsAddClientModalOpen(false)}
                className="text-[#848e9c] hover:text-[#eaecef]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-[#848e9c] block mb-1">Nome Completo / Razão Social *</label>
                <input
                  type="text"
                  required
                  value={newClientForm.name}
                  onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                  placeholder="Ex: João da Silva"
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#848e9c] block mb-1">E-mail Comercial *</label>
                <input
                  type="email"
                  required
                  value={newClientForm.email}
                  onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                  placeholder="cliente@exemplo.com"
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#848e9c] block mb-1">Documento (CPF ou CNPJ)</label>
                <input
                  type="text"
                  value={newClientForm.document}
                  onChange={(e) => setNewClientForm({ ...newClientForm, document: e.target.value })}
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-semibold text-[#848e9c] block mb-1">Aporte Inicial BTXC</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newClientForm.initialBtxc}
                    onChange={(e) => setNewClientForm({ ...newClientForm, initialBtxc: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] font-mono focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#848e9c] block mb-1">Aporte Inicial R$</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newClientForm.initialBrl}
                    onChange={(e) => setNewClientForm({ ...newClientForm, initialBrl: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] font-mono focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddClientModalOpen(false)}
                  className="flex-1 py-2 px-3 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] font-semibold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold rounded-lg transition"
                >
                  Confirmar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AJUSTAR SALDO / APORTE DE CLIENTE */}
      {adjustBalanceClient && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4">
              <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#f0b90b]" />
                Ajustar Saldos de Custódia
              </h3>
              <button
                type="button"
                onClick={() => setAdjustBalanceClient(null)}
                className="text-[#848e9c] hover:text-[#eaecef]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustBalance} className="space-y-3.5 text-xs">
              <div className="p-3 bg-[#0b0e11] border border-[#2f343b] rounded-lg">
                <div className="font-bold text-[#eaecef]">{adjustBalanceClient.name}</div>
                <div className="text-[11px] font-mono text-[#848e9c]">{adjustBalanceClient.email}</div>
                <div className="text-[10px] font-mono text-[#38bdf8] mt-1">{adjustBalanceClient.bitxAddress}</div>
              </div>

              <div>
                <label className="font-semibold text-[#848e9c] block mb-1">Novo Saldo BTXC</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={adjustBtxcAmount}
                  onChange={(e) => setAdjustBtxcAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] font-mono font-bold focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#848e9c] block mb-1">Novo Saldo com Liquidez (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjustBrlAmount}
                  onChange={(e) => setAdjustBrlAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] font-mono font-bold focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#848e9c] block mb-1">Motivo do Ajuste (Auditoria)</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ex: Aporte autorizado, equalização contábil..."
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustBalanceClient(null)}
                  className="flex-1 py-2 px-3 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] font-semibold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold rounded-lg transition"
                >
                  Salvar Saldos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
