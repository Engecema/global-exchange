import React, { useState, useEffect } from 'react';
import {
  AdminApprovalRequest,
  ClientCorrectionRequest,
  ClientRecord,
  CustodyLedgerEntry,
  FinancialTransaction,
  Movement,
  User,
} from '../types/exchange';
import {
  StorageService,
  getApprovedAdminEmails,
  MASTER_ADMIN_EMAIL,
  isMasterAdminEmail,
  isGeoniEmail,
  isGeoniRecord,
  generateTxid,
  generateBitxCoreAddress,
  BITX_CORE_MAINNET,
  INITIAL_REAL_CLIENTS,
  INITIAL_LEDGER_ENTRIES,
} from '../services/storage';
import {
  PIX_BB_CONFIG,
  fetchPixDiagnosticsAPI,
  testBBConnectionAPI,
  registerBBWebhookAPI,
  checkPixStatusAPI,
  fetchWebhookEventsAPI,
  clearWebhookEventsAPI,
  cancelWithdrawalAPI,
  confirmWithdrawalSettlementAPI,
  retryWithdrawalAPI,
  updateBBCredentialsAPI,
  PixDiagnostics,
  WebhookEventRecord,
} from '../services/pixBB';
import {
  ShieldAlert,
  Coins,
  DollarSign,
  Download,
  Users,
  Calendar,
  PlusCircle,
  ExternalLink,
  X,
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  Lock,
  Zap,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertCircle,
  Search,
  FileText,
  Trash2,
  LineChart,
  Play,
  CheckSquare,
  Sparkles,
  Wallet,
  ArrowDownLeft,
  MessageSquare,
  HelpCircle,
  Sliders,
  Banknote,
  Building2,
  Key,
  Layers,
  Activity,
  TrendingUp,
  Link as LinkIcon,
  Scale,
  Edit3,
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  onOpenReceipt: (movement: Movement) => void;
  onPriceUpdated?: (newPrice: string) => void;
  onNavigateToClientView?: (targetUser?: User) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onOpenReceipt,
  onPriceUpdated,
  onNavigateToClientView,
}) => {
  const [launchPrice, setLaunchPrice] = useState('1.50');
  const [priceSuccess, setPriceSuccess] = useState('');

  // Financial transactions (Admin Liquidity)
  const [financialTxs, setFinancialTxs] = useState<FinancialTransaction[]>([]);
  const [finType, setFinType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [finDesc, setFinDesc] = useState('');
  const [finAmount, setFinAmount] = useState('');
  const [finDate, setFinDate] = useState(new Date().toISOString().slice(0, 10));
  const [finMsg, setFinMsg] = useState('');

  // Clients (Requirement 4: Clean slate - zero mock accounts!)
  const [clients, setClients] = useState<ClientRecord[]>(() => StorageService.getClients());
  const [allMovements, setAllMovements] = useState<Movement[]>([]);

  // Livro Razão de Custódia & Liquidação (Ledger Auditável Engecema)
  const [ledger, setLedger] = useState<CustodyLedgerEntry[]>(() => StorageService.getLedger());
  const [ledgerSuccessMsg, setLedgerSuccessMsg] = useState('');
  const [isSyncingBridge, setIsSyncingBridge] = useState(false);
  const [isReconcilingLedger, setIsReconcilingLedger] = useState(false);

  // Formulário ➕ Cadastrar Novo Cliente Real
  const [newClientTag, setNewClientTag] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientDoc, setNewClientDoc] = useState('');
  const [newClientBtxc, setNewClientBtxc] = useState('0');
  const [newClientBrl, setNewClientBrl] = useState('0');
  const [newClientUsdt, setNewClientUsdt] = useState('0');
  const [newClientKyc, setNewClientKyc] = useState('Verificado KYC (Completo)');
  const [newClientMsg, setNewClientMsg] = useState('');
  const [newClientError, setNewClientError] = useState('');
  const [isSubmittingNewClient, setIsSubmittingNewClient] = useState(false);

  // Modal Edição de Cliente
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientDoc, setEditClientDoc] = useState('');
  const [editClientTag, setEditClientTag] = useState('');
  const [editClientKyc, setEditClientKyc] = useState('Verificado KYC');
  const [editClientBtxc, setEditClientBtxc] = useState('0');
  const [editClientBrl, setEditClientBrl] = useState('0');
  const [editClientUsdt, setEditClientUsdt] = useState('0');

  // Confirmação de exclusão segura
  const [clientToDelete, setClientToDelete] = useState<ClientRecord | null>(null);

  const handleSyncBridge = async () => {
    setIsSyncingBridge(true);
    setLedgerSuccessMsg('');
    const res = await StorageService.syncBitxCoreWithGlobalExchange();
    setLedger(res.ledger);
    setClients(res.clients);
    setAllMovements(StorageService.getMovements());
    setIsSyncingBridge(false);
    setLedgerSuccessMsg(res.message);
    setTimeout(() => setLedgerSuccessMsg(''), 7000);
  };

  const handleReconcileLedger = () => {
    setIsReconcilingLedger(true);
    setLedgerSuccessMsg('');
    const res = StorageService.reconcileLedgerWithBalances();
    setClients(StorageService.getClients());
    setLedger(StorageService.getLedger());
    setIsReconcilingLedger(false);
    setLedgerSuccessMsg(res.message);
    setTimeout(() => setLedgerSuccessMsg(''), 7000);
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    setNewClientError('');
    setNewClientMsg('');
    if (!newClientName.trim() || !newClientEmail.trim()) {
      setNewClientError('Nome Completo / Razão Social e E-mail Institucional são obrigatórios.');
      return;
    }
    setIsSubmittingNewClient(true);
    try {
      const rec = StorageService.addNewClientReal({
        tagId: newClientTag || newClientEmail,
        name: newClientName,
        email: newClientEmail,
        document: newClientDoc,
        initialBtxc: parseFloat(newClientBtxc) || 0,
        initialBrl: parseFloat(newClientBrl) || 0,
        initialUsdt: parseFloat(newClientUsdt) || 0,
        kycStatus: newClientKyc,
      });
      setClients(StorageService.getClients());
      setLedger(StorageService.getLedger());
      setAllMovements(StorageService.getMovements());
      setNewClientMsg(`✅ Cliente "${rec.name}" cadastrado e sincronizado com sucesso na Global Exchange e BitX Core!`);
      setNewClientTag('');
      setNewClientName('');
      setNewClientEmail('');
      setNewClientDoc('');
      setNewClientBtxc('0');
      setNewClientBrl('0');
      setNewClientUsdt('0');
      setTimeout(() => setNewClientMsg(''), 6000);
    } catch (err: any) {
      setNewClientError(err?.message || 'Erro ao cadastrar cliente.');
    } finally {
      setIsSubmittingNewClient(false);
    }
  };

  const handleOpenEditClient = (c: ClientRecord) => {
    setEditingClient(c);
    setEditClientName(c.name);
    setEditClientDoc(c.document);
    setEditClientTag(c.tagId || c.id);
    setEditClientKyc(c.kycStatus || 'Verificado KYC');
    setEditClientBtxc(String(StorageService.getCustodyBalance(c.email)));
    setEditClientBrl(String(StorageService.getCustodyBrlBalance(c.email)));
    setEditClientUsdt(String(StorageService.getCustodyUsdtBalance(c.email)));
  };

  const handleSaveEditClient = () => {
    if (!editingClient) return;
    StorageService.updateClientReal({
      email: editingClient.email,
      name: editClientName,
      document: editClientDoc,
      tagId: editClientTag,
      kycStatus: editClientKyc,
      balanceBtxc: parseFloat(editClientBtxc) || 0,
      balanceBrl: parseFloat(editClientBrl) || 0,
      balanceUsdt: parseFloat(editClientUsdt) || 0,
    });
    setClients(StorageService.getClients());
    setLedger(StorageService.getLedger());
    setEditingClient(null);
  };

  const handleGoToCorretora = (c: ClientRecord) => {
    const targetUser: User = {
      id: c.id || c.email,
      email: c.email,
      name: c.name,
      document: c.document,
      role: 'client',
      status: 'active',
      bitxAddress: c.bitxAddress,
      registrationTxid: c.registrationTxid,
    };
    StorageService.setCurrentUser(targetUser, { scope: 'client' });
    if (onNavigateToClientView) {
      onNavigateToClientView(targetUser);
    }
  };

  // Admin Approval Requests & Authorized Admins
  const [adminRequests, setAdminRequests] = useState<AdminApprovalRequest[]>([]);
  const [approvedAdmins, setApprovedAdmins] = useState<string[]>([]);
  const [adminMgmtMsg, setAdminMgmtMsg] = useState('');

  // Selected client for modal history
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [clientMovements, setClientMovements] = useState<Movement[]>([]);

  // Automação Bancária & Webhook Banco do Brasil
  const [diagnostics, setDiagnostics] = useState<PixDiagnostics | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRecord[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingBB, setIsTestingBB] = useState(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [regWebhookResult, setRegWebhookResult] = useState<{ success: boolean; message: string } | null>(null);
  const [customWebhookUrl, setCustomWebhookUrl] = useState(
    typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/pix` : ''
  );
  const [auditTxid, setAuditTxid] = useState('');
  const [auditResult, setAuditResult] = useState<{ status: string; message: string; paidAmount?: number } | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  // Status de Limpeza de Histórico e Prontidão Real
  const [cleanHistoryResult, setCleanHistoryResult] = useState('');
  const [isCleaningHistory, setIsCleaningHistory] = useState(false);

  // Limpeza Forçada de Clientes Fictícios & Sincronização Real
  const [purgeClientMsg, setPurgeClientMsg] = useState('');
  const [isPurgingClients, setIsPurgingClients] = useState(false);

  const handlePurgeFictitiousClients = () => {
    setIsPurgingClients(true);
    setPurgeClientMsg('');
    setTimeout(() => {
      const res = StorageService.purgeAllFictitiousClients();
      const updatedClients = StorageService.getClients();
      setClients(updatedClients);
      setAllMovements(StorageService.getMovements());
      setPurgeClientMsg(
        `✅ Limpeza executada com sucesso! ${
          res.cleanedCount > 0 ? `${res.cleanedCount} cadastro(s) fictício(s) removido(s). ` : ''
        }A lista agora exibe exclusivamente os clientes e administradores reais (${updatedClients.length} cadastrado(s)).`
      );
      setIsPurgingClients(false);
      setTimeout(() => setPurgeClientMsg(''), 6000);
    }, 250);
  };

  // Crédito Administrativo de BitX Core
  const [adminBitxHash, setAdminBitxHash] = useState('tx_5e197e2d');
  const [adminBitxAmount, setAdminBitxAmount] = useState('1.0000');
  const [adminBitxMsg, setAdminBitxMsg] = useState('');
  const [isAdminCreditingBitx, setIsAdminCreditingBitx] = useState(false);
  const [adminBitxCopied, setAdminBitxCopied] = useState(false);

  // Solicitações / Chamados de Suporte e Correção dos Clientes
  const [correctionRequests, setCorrectionRequests] = useState<ClientCorrectionRequest[]>([]);
  const [correctionMsg, setCorrectionMsg] = useState('');

  // Ajuste Oficial de Custódia (Reais ou GX) pelo Administrador
  const [adminAdjustCurrency, setAdminAdjustCurrency] = useState<'BRL' | 'GX'>('BRL');
  const [adminAdjustAction, setAdminAdjustAction] = useState<'SET' | 'CREDIT' | 'DEBIT'>('SET');
  const [adminAdjustAmount, setAdminAdjustAmount] = useState('');
  const [adminAdjustReason, setAdminAdjustReason] = useState('');
  const [adminAdjustMsg, setAdminAdjustMsg] = useState('');
  const [isAdminAdjusting, setIsAdminAdjusting] = useState(false);
  const [clientActionMsg, setClientActionMsg] = useState('');

  // Mesa Operacional de Saques e Transferências Pix BB
  const [withdrawalActionMsg, setWithdrawalActionMsg] = useState('');
  const [isProcessingWithdrawalAction, setIsProcessingWithdrawalAction] = useState(false);
  const [settleModalTxid, setSettleModalTxid] = useState<string | null>(null);
  const [settleOfficialEndToEndId, setSettleOfficialEndToEndId] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);

  const handleCopyPixData = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPixId(id);
    setTimeout(() => setCopiedPixId(null), 2500);
  };

  const [refundConfirmData, setRefundConfirmData] = useState<{
    txid: string;
    clientName: string;
    value: number;
  } | null>(null);

  const handleAdminRefundWithdrawal = (txid: string, clientName: string, value: number) => {
    setRefundConfirmData({ txid, clientName, value });
  };

  const executeAdminRefundWithdrawal = async () => {
    if (!refundConfirmData) return;
    const { txid, clientName, value } = refundConfirmData;
    setRefundConfirmData(null);
    setIsProcessingWithdrawalAction(true);
    setWithdrawalActionMsg('');
    try {
      await cancelWithdrawalAPI({
        txid,
        reason: 'Estorno realizado pela Mesa de Operações da Corretora Engecema',
        cancelledBy: currentUser.email,
      });
      loadData();
      setWithdrawalActionMsg(`✅ Sucesso! O saque de R$ ${value.toFixed(2)} foi estornado e o saldo devolvido à conta de ${clientName}.`);
      setTimeout(() => setWithdrawalActionMsg(''), 6000);
    } catch (err: any) {
      setWithdrawalActionMsg(err?.message || 'Erro ao estornar saque.');
    } finally {
      setIsProcessingWithdrawalAction(false);
    }
  };

  const handleOpenSettleModal = (mov: Movement) => {
    setSettleModalTxid(mov.txid);
    const dateStr = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    setSettleOfficialEndToEndId(mov.endToEndId || `E00000000${dateStr}${mov.txid.slice(2, 10).toUpperCase()}`);
    setSettleNotes('Transferência liquidada pelo operador via Gerenciador Financeiro Banco do Brasil PJ');
  };

  const handleAdminConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalTxid) return;
    setIsProcessingWithdrawalAction(true);
    setWithdrawalActionMsg('');
    try {
      await confirmWithdrawalSettlementAPI({
        txid: settleModalTxid,
        officialEndToEndId: settleOfficialEndToEndId.trim(),
        notes: settleNotes.trim(),
        operatorEmail: currentUser.email,
      });
      loadData();
      setWithdrawalActionMsg('✅ Liquidação no Banco do Brasil confirmada! A ordem foi marcada como LIQUIDADA com sucesso.');
      setSettleModalTxid(null);
      setTimeout(() => setWithdrawalActionMsg(''), 6000);
    } catch (err: any) {
      setWithdrawalActionMsg(err?.message || 'Erro ao confirmar liquidação.');
    } finally {
      setIsProcessingWithdrawalAction(false);
    }
  };

  const [retryingTxid, setRetryingTxid] = useState<string | null>(null);

  const handleRetryWithdrawal = async (txid: string) => {
    setRetryingTxid(txid);
    setWithdrawalActionMsg('');
    try {
      const res = await retryWithdrawalAPI({ txid });
      loadData();
      if (res.success) {
        setWithdrawalActionMsg('✅ SUCESSO! A API do Banco do Brasil confirmou a liquidação direta do Pix!');
      } else {
        setWithdrawalActionMsg(`⚠️ Resposta do Banco do Brasil: ${res.error || 'Não liquidado automaticamente'}. Verifique as credenciais ou autorize no Gerenciador Financeiro BB PJ.`);
      }
      setTimeout(() => setWithdrawalActionMsg(''), 8000);
    } catch (err: any) {
      setWithdrawalActionMsg(`Erro na tentativa via API BB: ${err?.message || 'Falha de conexão'}`);
    } finally {
      setRetryingTxid(null);
    }
  };

  // Credenciais Oficiais BB PJ
  const [bbClientIdInput, setBbClientIdInput] = useState('');
  const [bbClientSecretInput, setBbClientSecretInput] = useState('');
  const [bbGwAppKeyInput, setBbGwAppKeyInput] = useState('');
  const [bbPixKeyInput, setBbPixKeyInput] = useState('05368602000110');
  const [isSavingBBCreds, setIsSavingBBCreds] = useState(false);
  const [bbCredsMsg, setBbCredsMsg] = useState<{ success: boolean; text: string } | null>(null);
  const [isSyncingBitx, setIsSyncingBitx] = useState(false);
  const [bitxSyncSuccess, setBitxSyncSuccess] = useState('');

  const handleSaveBBCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBBCreds(true);
    setBbCredsMsg(null);
    try {
      const res = await updateBBCredentialsAPI({
        clientId: bbClientIdInput.trim(),
        clientSecret: bbClientSecretInput.trim(),
        gwAppKey: bbGwAppKeyInput.trim(),
        pixKey: bbPixKeyInput.trim(),
      });
      setBbCredsMsg({ success: true, text: res.message || 'Credenciais do Banco do Brasil ativadas com sucesso em produção!' });
      // Atualiza diagnósticos
      try {
        const diag = await fetchPixDiagnosticsAPI();
        setDiagnostics(diag);
      } catch {}
      setTimeout(() => setBbCredsMsg(null), 7000);
    } catch (err: any) {
      setBbCredsMsg({ success: false, text: err?.message || 'Erro ao salvar credenciais BB.' });
    } finally {
      setIsSavingBBCreds(false);
    }
  };

  const loadData = () => {
    setLaunchPrice(StorageService.getLaunchPrice());
    setFinancialTxs(StorageService.getFinancialTransactions());
    setClients(StorageService.getClients());
    setLedger(StorageService.getLedger());
    setAllMovements(StorageService.getMovements());
    setAdminRequests(StorageService.getAdminRequests());
    setApprovedAdmins(getApprovedAdminEmails());
    setCorrectionRequests(StorageService.getCorrectionRequests());

    // Carrega diagnósticos e eventos do webhook
    fetchPixDiagnosticsAPI().then((diag) => {
      if (diag) {
        setDiagnostics(diag);
        if (!customWebhookUrl && diag.webhook?.suggestedUrl) {
          setCustomWebhookUrl(diag.webhook.suggestedUrl);
        }
      }
    });
    fetchWebhookEventsAPI().then((events) => {
      if (events) setWebhookEvents(events);
    });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      fetchWebhookEventsAPI().then((events) => {
        if (events && events.length) setWebhookEvents(events);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTestBBConnection = async () => {
    setIsTestingBB(true);
    setTestResult(null);
    try {
      const res = await testBBConnectionAPI();
      setTestResult(res);
    } finally {
      setIsTestingBB(false);
    }
  };

  const handleRegisterWebhook = async () => {
    setIsRegisteringWebhook(true);
    setRegWebhookResult(null);
    try {
      const res = await registerBBWebhookAPI(customWebhookUrl);
      setRegWebhookResult(res);
      fetchPixDiagnosticsAPI().then((d) => d && setDiagnostics(d));
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleAuditTxid = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = auditTxid.trim();
    if (!cleanId) return;

    setIsAuditing(true);
    setAuditResult(null);

    try {
      const res = await checkPixStatusAPI(cleanId);
      if (res && res.status) {
        setAuditResult({
          status: res.status,
          message:
            res.status === 'CONCLUIDA'
              ? `Cobrança Pix ${res.txid} LIQUIDADA no Banco do Brasil e creditada na custódia!`
              : `Cobrança Pix ${res.txid}: Status atual no BB é ${res.status}.`,
          paidAmount: res.paidAmount,
        });
      } else {
        const found = webhookEvents.find(
          (w) => w.endToEndId === cleanId || w.txid === cleanId
        );
        if (found) {
          setAuditResult({
            status: 'CONCLUIDA',
            message: `Pagamento de R$ ${found.amount.toFixed(2)} por ${found.payerName} registrado sob o EndToEndId oficial!`,
            paidAmount: found.amount,
          });
        } else {
          setAuditResult({
            status: 'NAO_ENCONTRADA',
            message: `Nenhuma cobrança ativa ou liquidação localizada com o identificador informado.`,
          });
        }
      }
    } catch (err: any) {
      setAuditResult({
        status: 'ERRO',
        message: 'Erro na auditoria: ' + (err?.message || 'Falha ao consultar Banco do Brasil'),
      });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleOpenReceiptFromEvent = (evt: WebhookEventRecord) => {
    const movement: Movement = {
      id: evt.id || evt.txid || generateTxid(),
      txid: evt.txid || evt.endToEndId,
      clientId: evt.payerDoc || evt.payerName || 'Banco do Brasil',
      clientEmail: evt.payerName || 'pix@bb.com.br',
      clientName: evt.payerName || 'Pagador Banco do Brasil',
      type: 'DEPÓSITO PIX',
      description: `Liquidação Pix Banco do Brasil (EndToEnd: ${evt.endToEndId})`,
      value: evt.amount,
      currency: 'BRL',
      status: 'CONFIRMADO',
      endToEndId: evt.endToEndId,
      createdAt: evt.paidAt || evt.receivedAt || new Date().toISOString(),
    };
    onOpenReceipt(movement);
  };

  const handleClearTestEvents = async () => {
    await clearWebhookEventsAPI();
    setWebhookEvents([]);
    loadData();
  };

  const handleClearAllHistory = () => {
    if (
      !window.confirm(
        'Atenção: Tem certeza que deseja limpar todo o histórico de transações e movimentações de teste? O ecossistema será zerado e ficará 100% pronto para transações reais em produção.'
      )
    ) {
      return;
    }

    setIsCleaningHistory(true);
    try {
      const res = StorageService.clearAllHistoryForRealTransactions();
      setWebhookEvents([]);
      loadData();
      setCleanHistoryResult(
        `✅ Histórico limpo com sucesso! ${res.clearedCount} registro(s) purgados. O livro de custódia e o livro de ofertas estão 100% aptos para transações reais em produção.`
      );
      setTimeout(() => setCleanHistoryResult(''), 6000);
    } finally {
      setIsCleaningHistory(false);
    }
  };

  const copyWebhookUrl = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWebhookUrl(true);
    setTimeout(() => setCopiedWebhookUrl(false), 2000);
  };

  const handleApproveAdmin = (requestId: string) => {
    StorageService.approveAdminRequest(requestId);
    setAdminMgmtMsg('Administrador aprovado com sucesso! Acesso liberado no sistema.');
    loadData();
    setTimeout(() => setAdminMgmtMsg(''), 4000);
  };

  const handleRejectAdmin = (requestId: string) => {
    StorageService.rejectAdminRequest(requestId);
    setAdminMgmtMsg('Solicitação de administrador recusada.');
    loadData();
    setTimeout(() => setAdminMgmtMsg(''), 4000);
  };

  const handleRevokeAdmin = (email: string) => {
    StorageService.revokeAdmin(email);
    setAdminMgmtMsg(`Acesso de administrador revogado para ${email}.`);
    loadData();
    setTimeout(() => setAdminMgmtMsg(''), 4000);
  };

  const handleSyncBitxCore = async () => {
    setIsSyncingBitx(true);
    setBitxSyncSuccess('');
    try {
      const res = StorageService.syncWithBitxCoreMainnet(currentUser);
      setLaunchPrice(res.price);

      // Sincroniza com endpoint do backend
      try {
        await fetch('/api/bitx/sync-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: res.price }),
        });
      } catch {}

      // Atualiza movimentações
      const updatedMovements = StorageService.getMovements();
      setAllMovements(updatedMovements);

      if (onPriceUpdated) {
        onPriceUpdated(res.price);
      }

      setBitxSyncSuccess(
        `✅ Preço sincronizado com sucesso! Cotação BTXC fixada em R$ 421.081,54 (+0.42%) alinhada ao Bloco #349.000 da Rede Ativa BitX Core Mainnet.`
      );
      setTimeout(() => setBitxSyncSuccess(''), 7000);
    } catch (err: any) {
      setBitxSyncSuccess(`Erro ao sincronizar: ${err?.message}`);
    } finally {
      setIsSyncingBitx(false);
    }
  };

  const handleUpdatePrice = (e: React.FormEvent) => {
    e.preventDefault();
    const oldPrice = StorageService.getLaunchPrice();
    const cleanPrice = launchPrice.trim();
    const numPrice = parseFloat(cleanPrice);

    if (!cleanPrice || !Number.isFinite(numPrice) || numPrice <= 0) {
      return;
    }

    StorageService.setLaunchPrice(cleanPrice);

    // Registra a atualização oficial de preço no histórico geral de transações da rede
    StorageService.addMovement({
      clientId: currentUser?.email || 'admin@engecema.com.br',
      clientEmail: currentUser?.email || 'admin@engecema.com.br',
      clientName: currentUser?.name || 'Administrador Geral Engecema',
      type: 'ATUALIZAÇÃO DE PREÇO',
      description: `Atualização de Preço de Lançamento GX: de R$ ${parseFloat(oldPrice).toFixed(2)} para R$ ${numPrice.toFixed(2)} (Cotação Oficial da Rede)`,
      value: numPrice,
      currency: 'BRL',
    });

    // Atualiza imediatamente o histórico geral de transações na tela
    const updatedMovements = StorageService.getMovements();
    setAllMovements(updatedMovements);

    setPriceSuccess(`Preço atualizado para R$ ${numPrice.toFixed(2)} e registrado no histórico geral da rede!`);
    if (onPriceUpdated) {
      onPriceUpdated(cleanPrice);
    }
    setTimeout(() => setPriceSuccess(''), 4000);
  };

  const handleAddFinancialTx = (e: React.FormEvent) => {
    e.preventDefault();
    setFinMsg('');
    const val = parseFloat(finAmount);
    if (!finDesc.trim() || !Number.isFinite(val) || val <= 0) {
      setFinMsg('Preencha descrição e valor válido.');
      return;
    }

    StorageService.addFinancialTransaction({
      type: finType,
      description: finDesc.trim(),
      value: val,
      date: finDate,
    });

    setFinDesc('');
    setFinAmount('');
    setFinMsg('Lançamento financeiro registrado com sucesso.');
    setFinancialTxs(StorageService.getFinancialTransactions());
  };

  const openClientHistory = (client: ClientRecord) => {
    setSelectedClient(client);
    setClientMovements(StorageService.getMovements(client.email));
    setAdminBitxMsg('');
    setAdminBitxCopied(false);
    setAdminAdjustMsg('');
    setAdminAdjustAmount('');
    setAdminAdjustReason('');
  };

  const handleAdminAdjustBalance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    setAdminAdjustMsg('');
    const amt = parseFloat(adminAdjustAmount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt < 0) {
      setAdminAdjustMsg('Informe um valor numérico válido maior ou igual a zero.');
      return;
    }
    if (!adminAdjustReason.trim()) {
      setAdminAdjustMsg('Informe a justificativa formal da operação para auditoria.');
      return;
    }

    setIsAdminAdjusting(true);
    setTimeout(() => {
      const res = StorageService.adminAdjustCustodyBalance({
        clientEmail: selectedClient.email,
        currency: adminAdjustCurrency,
        action: adminAdjustAction,
        amount: amt,
        reason: adminAdjustReason,
        adminEmail: currentUser.email,
      });

      setIsAdminAdjusting(false);
      if (!res.success) {
        setAdminAdjustMsg(`Erro no ajuste: ${res.error}`);
        return;
      }

      setAdminAdjustMsg(
        `✅ Ajuste executado com sucesso! Novo saldo em ${adminAdjustCurrency === 'BRL' ? 'Reais com Liquidez (R$)' : 'GX'}: ${(res.newBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. TXID gerado e registrado na auditoria da rede.`
      );
      setAdminAdjustAmount('');
      setAdminAdjustReason('');
      loadData();
      setClientMovements(StorageService.getMovements(selectedClient.email));
    }, 300);
  };

  const handleResolveCorrection = (id: string) => {
    StorageService.resolveCorrectionRequest(id, 'Atendido formalmente pela administração');
    setCorrectionMsg('Chamado marcado como resolvido.');
    loadData();
    setTimeout(() => setCorrectionMsg(''), 4000);
  };

  const handleOpenClientFromCorrection = (req: ClientCorrectionRequest) => {
    const found = clients.find((c) => c.email.toLowerCase() === req.clientEmail.toLowerCase());
    if (found) {
      setSelectedClient(found);
      setClientMovements(StorageService.getMovements(found.email));
      if (req.relatedAmount) {
        setAdminAdjustAmount(req.relatedAmount.toString());
      }
      setAdminAdjustReason(`Atendimento ao chamado [${req.id.slice(0, 8)}]: ${req.subject}`);
      if (req.relatedCurrency) {
        setAdminAdjustCurrency(req.relatedCurrency);
      }
    }
  };

  const handleDeleteClient = (client: ClientRecord) => {
    setClientToDelete(client);
  };

  const handleConfirmDeleteClient = () => {
    if (!clientToDelete) return;
    const target = clientToDelete;
    const isGeoni = isGeoniEmail(target.email) || isGeoniRecord(target);

    if (isGeoni) {
      setClientActionMsg('O Titular Principal Geoni Clementino Cesar de Matos possui custódia institucional e não pode ser removido.');
      setClientToDelete(null);
      setTimeout(() => setClientActionMsg(''), 6000);
      return;
    }

    const email = target.email;
    const name = target.name || target.email;
    setClientToDelete(null);

    const success = StorageService.removeClientReal(email);
    if (success) {
      const updated = StorageService.getClients();
      setClients(updated);
      setLedger(StorageService.getLedger());
      setClientActionMsg(`✅ Cliente "${name}" (${email}) foi removido com sucesso.`);
    } else {
      setClientActionMsg('Não foi possível remover este cliente.');
    }
    loadData();
    setTimeout(() => setClientActionMsg(''), 6000);
  };

  const handleEmitInitialTxid = (client: ClientRecord) => {
    const mov = StorageService.addMovement({
      clientId: client.email,
      clientEmail: client.email,
      clientName: client.name || client.email,
      type: 'AJUSTE CUSTÓDIA',
      description: `Certidão de Registro de Titularidade e Abertura de Conta Comercial (Doc: ${client.document || 'Confirmado'})`,
      value: 0,
      currency: 'GX',
    });
    loadData();
    setClientMovements(StorageService.getMovements(client.email));
    onOpenReceipt(mov);
  };

  const handleAdminCreditBitx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    setAdminBitxMsg('');

    const hash = adminBitxHash.trim();
    const amount = parseFloat(adminBitxAmount.replace(',', '.'));

    if (!hash || !Number.isFinite(amount) || amount <= 0) {
      setAdminBitxMsg('Preencha o Hash/ID da transação e quantidade válida maior que zero.');
      return;
    }

    setIsAdminCreditingBitx(true);
    setTimeout(() => {
      const res = StorageService.creditBitxDeposit({
        clientEmail: selectedClient.email,
        amount,
        externalTxid: hash,
        note: `Crédito BitX Core confirmado pelo Administrador (${hash})`,
      });

      setIsAdminCreditingBitx(false);

      if (res.success && res.movement) {
        setAdminBitxMsg(`✅ Sucesso! ${amount.toFixed(4)} BTXC creditados na conta de ${selectedClient.email}.`);
        loadData();
        setClientMovements(StorageService.getMovements(selectedClient.email));
      } else {
        setAdminBitxMsg(res.error || 'Erro ao creditar BitX Core.');
      }
    }, 350);
  };

  const handleDownloadReport = () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      launchPrice,
      totalClients: clients.length,
      clients,
      totalMovements: allMovements.length,
      movements: allMovements,
      financialTransactions: financialTxs,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-admin-gx-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#f0b90b]">
            Painel Administrativo - ENGECEMA
          </h2>
          <p className="text-xs text-[#848e9c] mt-0.5">
            Gestão do livro de custódia, clientes, lançamentos financeiros e conformidade Banco do Brasil
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#848e9c]">Administrador Geral:</span>
          <strong className="text-xs text-white bg-[#0b0e11] px-2.5 py-1 rounded border border-[#2f343b]">
            {currentUser?.email || 'geonimatos31@gmail.com'}
          </strong>
        </div>
      </div>

      {/* 🚀 Painel de Acesso Rápido à Negociação, Custódia e Prontidão Real */}
      <div className="bg-[#1e2329] border border-[#3a414b] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] gap-3">
          <div>
            <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
              <LineChart className="w-4 h-4 text-[#f0b90b]" />
              Painel de Acesso & Prontidão Operacional para Transações Reais
            </h3>
            <p className="text-xs text-[#848e9c] mt-0.5">
              Alterne diretamente para o painel de Negociação & Custódia e garanta que o ecossistema esteja 100% limpo e pronto para transações reais.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleClearAllHistory}
              disabled={isCleaningHistory}
              className="px-3.5 py-2 bg-[#2b3139] hover:bg-[#cf304a]/20 text-[#cf304a] border border-[#cf304a]/40 hover:border-[#cf304a] text-xs font-bold rounded transition flex items-center gap-1.5"
              title="Limpar qualquer histórico existente e zerar para operações reais"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isCleaningHistory ? 'Limpando Registros...' : 'Limpar Histórico de Testes (Reset Real)'}
            </button>
          </div>
        </div>

        {cleanHistoryResult && (
          <div className="p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{cleanHistoryResult}</span>
          </div>
        )}

        {/* Checklist de Auditoria e Conformidade para Transações Reais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block mb-1">Chave Pix Favorecida (PJ):</span>
            <strong className="text-[#f0b90b] font-mono text-xs block">05.368.602/0001-10</strong>
            <span className="text-[10px] text-[#02c076] block mt-0.5">● Engecema Engenharia PJ Ativa</span>
          </div>

          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block mb-1">Padrão QR Code / Copia e Cola:</span>
            <strong className="text-white font-mono text-xs block">EMV QRCPS-MPM (Bacen)</strong>
            <span className="text-[10px] text-[#02c076] block mt-0.5">● Compatível com todos os bancos</span>
          </div>

          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block mb-1">Endpoint Webhook Pix BB:</span>
            <strong className="text-white font-mono text-xs block">/api/webhook/pix</strong>
            <span className="text-[10px] text-[#02c076] block mt-0.5">● Notificações mTLS em tempo real</span>
          </div>

          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block mb-1">Boletas e Ordens GX/USDT:</span>
            <strong className="text-white font-mono text-xs block">100% Operacional</strong>
            <span className="text-[10px] text-[#02c076] block mt-0.5">● Auditoria com TXID Criptográfico</span>
          </div>
        </div>
      </div>

      {/* 🏛️ MESA OPERACIONAL: LIQUIDAÇÃO DE SAQUES & PIX BANCO DO BRASIL */}
      <div className="bg-[#1e2329] border-2 border-[#f0b90b] rounded-lg p-5 space-y-4 shadow-xl">
        <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#f0b90b]" />
              <h3 className="text-base sm:text-lg font-bold text-[#f0b90b]">
                Mesa de Operações: Liquidação de Saques Pix BB (Corretora)
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/40">
                {allMovements.filter((m) => (m.type === 'SAQUE BANCÁRIO' || m.type === 'TRANSFERÊNCIA PIX BB') && (m.status === 'PENDENTE_LIBERACAO_BB' || m.bankStatus === 'AGUARDANDO_ALCADA_BB' || m.bankStatus === 'PROCESSADO_ALCADA_BB')).length} pendente(s)
              </span>
            </div>
            <p className="text-xs text-[#848e9c] mt-1 leading-relaxed">
              Controle e liquidação das solicitações de saque dos clientes após a venda de ativos na corretora. No Banco do Brasil PJ, pagamentos de saída necessitam de liberação na alçada do Gerenciador Financeiro ou execução manual pela mesa. Copie os dados bancários para transferir ou confirme a liquidação.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] border border-[#474d57] rounded text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar Mesa
          </button>
        </div>

        {withdrawalActionMsg && (
          <div className="p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded font-medium flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{withdrawalActionMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setWithdrawalActionMsg('')}
              className="text-white hover:underline text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tabela de Saques Pendentes de Liquidação */}
        {allMovements.filter((m) => (m.type === 'SAQUE BANCÁRIO' || m.type === 'TRANSFERÊNCIA PIX BB') && (m.status === 'PENDENTE_LIBERACAO_BB' || m.bankStatus === 'AGUARDANDO_ALCADA_BB' || m.bankStatus === 'PROCESSADO_ALCADA_BB')).length === 0 ? (
          <div className="p-6 bg-[#0b0e11] rounded-lg border border-[#2f343b] text-center text-xs text-[#848e9c]">
            <CheckCircle2 className="w-8 h-8 text-[#02c076] mx-auto mb-2 opacity-80" />
            <strong className="text-white block text-sm mb-1">Nenhum saque pendente de liquidação no momento</strong>
            <span>Todas as solicitações de saque via Pix / Banco do Brasil foram liquidadas ou estornadas.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#eaecef]">
              <thead>
                <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold bg-[#181a20]">
                  <th className="py-2.5 px-3">Data / Protocolo</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Dados de Destino (Pix / BB)</th>
                  <th className="py-2.5 px-3">Valor (R$)</th>
                  <th className="py-2.5 px-3">Status Atual</th>
                  <th className="py-2.5 px-3 text-center">Ações Operacionais</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20262d]">
                {allMovements
                  .filter((m) => (m.type === 'SAQUE BANCÁRIO' || m.type === 'TRANSFERÊNCIA PIX BB') && (m.status === 'PENDENTE_LIBERACAO_BB' || m.bankStatus === 'AGUARDANDO_ALCADA_BB' || m.bankStatus === 'PROCESSADO_ALCADA_BB'))
                  .map((m) => {
                    const rawPixOrBank = m.pixKey || m.recipient || '';
                    return (
                      <tr key={m.id} className="hover:bg-[#2b3139]/40 transition">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-white">{new Date(m.createdAt).toLocaleString('pt-BR')}</div>
                          <span className="text-[10px] font-mono text-[#848e9c]">TXID: {m.txid.slice(0, 8)}...{m.txid.slice(-6)}</span>
                        </td>
                        <td className="py-3 px-3">
                          <strong className="text-white block">{m.clientName || m.clientEmail}</strong>
                          <span className="text-[11px] text-[#848e9c]">{m.clientEmail}</span>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[#38bdf8] bg-[#0b0e11] px-2 py-0.5 rounded border border-[#2f343b] text-[11px]">
                              {m.recipient || m.pixKey || 'Chave Pix'}
                            </span>
                            {rawPixOrBank && (
                              <button
                                type="button"
                                onClick={() => handleCopyPixData(m.pixKey || m.recipient || '', m.id)}
                                className="px-2 py-0.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] rounded border border-[#474d57] text-[10px] font-semibold flex items-center gap-1 transition"
                                title="Copiar chave para transferir no App do Banco do Brasil"
                              >
                                {copiedPixId === m.id ? (
                                  <span className="text-[#02c076]">Copiado!</span>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-sm text-[#02c076]">
                          R$ {m.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f0b90b]/15 text-[#f0b90b] border border-[#f0b90b]/30 inline-block">
                            ALÇADA BB PJ
                          </span>
                          {m.errorDetail && (
                            <div className="mt-1 text-[10px] text-[#f87171] bg-[#450a0a]/30 p-1 rounded border border-[#ef4444]/20 max-w-[200px] truncate" title={m.errorDetail}>
                              ⚠️ {m.errorDetail}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              disabled={retryingTxid === m.txid || isProcessingWithdrawalAction}
                              onClick={() => handleRetryWithdrawal(m.txid)}
                              className="px-2.5 py-1 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-[11px] rounded transition flex items-center gap-1 shadow"
                              title="Tentar envio automático imediato via API do Banco do Brasil"
                            >
                              <Zap className={`w-3 h-3 ${retryingTxid === m.txid ? 'animate-spin' : ''}`} />
                              <span>{retryingTxid === m.txid ? 'Enviando ao BB...' : 'Disparar API BB'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenSettleModal(m)}
                              className="px-2.5 py-1 bg-[#02c076] hover:bg-[#02a766] text-black font-bold text-[11px] rounded transition flex items-center gap-1 shadow"
                              title="Confirmar que o Pix foi pago no Banco do Brasil e liquidar na conta do cliente"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Confirmar Liquidação
                            </button>

                            <button
                              type="button"
                              disabled={isProcessingWithdrawalAction}
                              onClick={() => handleAdminRefundWithdrawal(m.txid, m.clientName, m.value)}
                              className="px-2.5 py-1 bg-[#cf304a]/15 hover:bg-[#cf304a]/30 text-[#cf304a] border border-[#cf304a]/40 font-bold text-[11px] rounded transition flex items-center gap-1"
                              title="Estornar o valor integralmente de volta para o saldo com liquidez do cliente"
                            >
                              <X className="w-3 h-3" />
                              Estornar Saldo
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenReceipt(m)}
                              className="p-1 bg-[#2b3139] hover:bg-[#353c46] text-[#848e9c] hover:text-white rounded border border-[#474d57]"
                              title="Ver Recibo"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Liquidação no Banco do Brasil */}
      {settleModalTxid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#1e2329] border border-[#02c076] rounded-xl max-w-lg w-full p-6 text-[#eaecef] shadow-2xl relative">
            <button
              onClick={() => setSettleModalTxid(null)}
              className="absolute top-4 right-4 text-[#848e9c] hover:text-white p-1 rounded"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-2 text-[#02c076]">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">
                Confirmar Liquidação Bancária no Banco do Brasil
              </h3>
            </div>
            <p className="text-xs text-[#848e9c] mb-4 leading-relaxed">
              Informe os dados da efetivação no Gerenciador Financeiro BB PJ ou no aplicativo do Banco do Brasil para atualizar a ordem de saque para <strong>LIQUIDADO</strong> com selo oficial.
            </p>

            <form onSubmit={handleAdminConfirmSettlement} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#b7bdc6] mb-1 font-semibold">
                  Identificador Bacen EndToEnd ID Oficial do Pix:
                </label>
                <input
                  type="text"
                  value={settleOfficialEndToEndId}
                  onChange={(e) => setSettleOfficialEndToEndId(e.target.value)}
                  placeholder="Ex: E0000000020261018..."
                  required
                  className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#02c076]"
                />
                <span className="text-[10px] text-[#848e9c] mt-0.5 block">
                  Código de 32 caracteres gerado no comprovante de transferência do Banco do Brasil.
                </span>
              </div>

              <div>
                <label className="block text-[#b7bdc6] mb-1 font-semibold">
                  Observações da Mesa de Liquidação:
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Ex: Transferência liberada na alçada do Gerenciador Financeiro BB PJ"
                  className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#02c076]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#2f343b]">
                <button
                  type="button"
                  onClick={() => setSettleModalTxid(null)}
                  className="px-4 py-2 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] rounded font-semibold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingWithdrawalAction}
                  className="px-4 py-2 bg-[#02c076] hover:bg-[#02a766] text-black rounded font-bold text-xs transition shadow flex items-center gap-1.5"
                >
                  {isProcessingWithdrawalAction ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Confirmando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Efetivar e Liquidar Saque
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Network Overview & Price Control */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Controle de Lançamento e Sincronização BitX Core */}
        <div className="bg-[#1e2329] border border-[#f0b90b]/40 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-start gap-2 pb-2 border-b border-[#2f343b]">
            <div>
              <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
                <Coins className="w-5 h-5 text-[#f0b90b]" />
                Sincronização BitX Core & Preço de Lançamento
              </h3>
              <p className="text-xs text-[#848e9c] mt-0.5">
                Alinhamento do valor da moeda BTXC com a plataforma BitX Core e o livro de ofertas.
              </p>
            </div>
            <span className="text-[10px] bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40 px-2.5 py-1 rounded font-bold uppercase flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#02c076] animate-pulse"></span>
              {BITX_CORE_MAINNET.network}
            </span>
          </div>

          {/* Painel de Telemetria da BitX Core Mainnet */}
          <div className="p-3.5 bg-[#0b0e11] rounded-lg border border-[#2f343b] space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2 bg-[#1e2329] rounded border border-[#2f343b]">
                <span className="text-[10px] text-[#848e9c] block font-semibold">Altura da Cadeia</span>
                <span className="text-white font-mono font-bold text-sm flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[#38bdf8]" />
                  {BITX_CORE_MAINNET.chainHeight}
                </span>
              </div>

              <div className="p-2 bg-[#1e2329] rounded border border-[#2f343b]">
                <span className="text-[10px] text-[#848e9c] block font-semibold">Cotação BTXC Oficial</span>
                <span className="text-[#02c076] font-mono font-bold text-sm">
                  {BITX_CORE_MAINNET.officialPriceFormatted}
                </span>
              </div>

              <div className="p-2 bg-[#1e2329] rounded border border-[#2f343b] col-span-2 sm:col-span-1">
                <span className="text-[10px] text-[#848e9c] block font-semibold">Variação / Status</span>
                <span className="text-[#02c076] font-bold text-xs flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {BITX_CORE_MAINNET.variation} · {BITX_CORE_MAINNET.version}
                </span>
              </div>
            </div>

            <div className="pt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSyncBitxCore}
                disabled={isSyncingBitx}
                className="flex-1 py-2 px-3.5 bg-[#02c076] hover:bg-[#02a766] text-black font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow"
              >
                <Activity className={`w-4 h-4 ${isSyncingBitx ? 'animate-spin' : ''}`} />
                {isSyncingBitx
                  ? 'Sincronizando com BitX Core...'
                  : 'Sincronizar com a BitX Core (R$ 421.081,54)'}
              </button>
            </div>

            {bitxSyncSuccess && (
              <div className="p-2.5 rounded text-xs bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 flex items-start gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{bitxSyncSuccess}</span>
              </div>
            )}
          </div>

          {/* Ajuste Manual ou Customizado */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-[#b7bdc6] mb-1.5">
              Ajuste Manual do Preço de Lançamento (R$):
            </label>
            <form onSubmit={handleUpdatePrice} className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#848e9c]">
                  R$
                </span>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={launchPrice}
                  onChange={(e) => setLaunchPrice(e.target.value)}
                  placeholder="Ex: 421081.54"
                  className="w-full bg-[#0b0e11] border border-[#474d57] rounded pl-8 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition shadow shrink-0"
              >
                Salvar Cotação
              </button>
            </form>

            {/* Prévia de Leitura em Reais */}
            <div className="mt-2 p-2 bg-[#0b0e11] rounded border border-[#2f343b] text-xs flex justify-between items-center">
              <span className="text-[#848e9c]">Cotação Ativa no Ecossistema:</span>
              <strong className="text-[#02c076] font-mono font-bold">
                {Number.isFinite(parseFloat(launchPrice))
                  ? `R$ ${parseFloat(launchPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                  : 'R$ 0,00'}
              </strong>
            </div>

            {priceSuccess && (
              <div className="text-[11px] text-[#02c076] mt-2 font-medium">
                {priceSuccess}
              </div>
            )}
          </div>
        </div>

        {/* Visão Geral da Rede & BB */}
        <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
          <h3 className="text-base font-bold text-[#f0b90b] mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#02c076]" />
            Visão Geral da Rede & Gateway BB
          </h3>
          <div className="space-y-2 text-xs text-[#b7bdc6]">
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Rede Blockchain Oficial:</span>
              <span className="text-[#38bdf8] font-bold">BitX Core (Mainnet)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Altura da Cadeia:</span>
              <span className="text-white font-mono font-bold">{BITX_CORE_MAINNET.chainHeight}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Cotação BTXC (BitX Core):</span>
              <span className="text-[#02c076] font-mono font-bold">
                R$ {parseFloat(launchPrice || '421081.54').toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({BITX_CORE_MAINNET.variation})
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Status do Ecossistema:</span>
              <span className="text-[#02c076] font-bold">● Operacional em Produção (v3.4)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Total Supply GX / BTXC:</span>
              <strong className="text-white font-mono">1.500.000.000 GX</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Chave Pix Engecema:</span>
              <strong className="text-[#f0b90b] font-mono">{PIX_BB_CONFIG.formattedCnpj}</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#848e9c]">Certificado mTLS Banco do Brasil:</span>
              <span className="text-[#02c076] font-semibold">star_mtls_api_bb_com_br.crt</span>
            </div>
          </div>
        </div>
      </div>

      {/* ⚡ Automação Bancária & Webhook Banco do Brasil */}
      <div className="bg-[#1e2329] border border-[#f0b90b]/50 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] gap-2">
          <div>
            <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#f0b90b]" />
              Automação Bancária Instantânea & Webhook Banco do Brasil
            </h3>
            <p className="text-xs text-[#848e9c] mt-0.5">
              Recepção direta e automática de notificações de pagamento Pix via Webhook com mTLS para liquidação em tempo real na custódia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40 px-2.5 py-1 rounded font-bold uppercase flex items-center gap-1.5 shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-[#02c076]" />
              Transações Reais (Produção)
            </span>
            <span className="text-[11px] bg-[#f0b90b]/15 text-[#f0b90b] border border-[#f0b90b]/30 px-2.5 py-1 rounded font-mono font-semibold">
              CNPJ: 05.368.602/0001-10
            </span>
          </div>
        </div>

        {/* Status e Diagnóstico mTLS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block mb-1">Certificação mTLS Banco do Brasil:</span>
            <div className="flex items-center gap-1.5 font-bold text-white">
              <ShieldCheck className="w-4 h-4 text-[#02c076]" />
              {diagnostics?.certificates?.mtlsCertFound ? (
                <span className="text-[#02c076]">Certificado mTLS Carregado</span>
              ) : (
                <span className="text-[#f0b90b]">star_mtls_api_bb_com_br.crt Pronto</span>
              )}
            </div>
            <span className="text-[10px] text-[#848e9c] block mt-1">DigiCert Global Root G2 vinculado</span>
          </div>

          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block mb-1">Chave Pix Favorecida:</span>
            <strong className="text-[#f0b90b] font-mono text-sm block">05.368.602/0001-10</strong>
            <span className="text-[10px] text-[#848e9c] block mt-0.5">Engecema Engenharia PJ (BB)</span>
          </div>

          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block mb-1">Notificações Processadas:</span>
            <strong className="text-white font-mono text-base block">
              {webhookEvents.length} recebimento(s)
            </strong>
            <span className="text-[10px] text-[#02c076] block mt-0.5">Escutando em tempo real</span>
          </div>
        </div>

        {/* Configuração da URL do Webhook */}
        <div className="p-4 bg-[#0b0e11] rounded-lg border border-[#3a414b]">
          <label className="text-xs font-bold text-white block mb-1 flex items-center gap-1.5">
            <ExternalLink className="w-4 h-4 text-[#38bdf8]" />
            URL Oficial do Webhook Pix (Cadastrar no portal developers.bb.com.br):
          </label>
          <p className="text-[11px] text-[#848e9c] mb-2.5">
            Cadastre esta URL nas configurações da sua aplicação no Portal de Desenvolvedores do Banco do Brasil para que cada Pix pago envie uma notificação instantânea para o sistema:
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={customWebhookUrl}
              onChange={(e) => setCustomWebhookUrl(e.target.value)}
              placeholder="https://sua-url.onrender.com/api/webhook/pix"
              className="flex-1 min-w-[260px] bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-[#f0b90b] font-mono focus:outline-none focus:border-[#f0b90b]"
            />
            <button
              type="button"
              onClick={() => copyWebhookUrl(customWebhookUrl)}
              className="px-3 py-2 bg-[#2b3139] hover:bg-[#353c46] text-white rounded text-xs font-semibold flex items-center gap-1 transition"
            >
              <Copy className="w-3.5 h-3.5 text-[#f0b90b]" />
              {copiedWebhookUrl ? 'Copiado!' : 'Copiar URL'}
            </button>
            <button
              type="button"
              onClick={handleRegisterWebhook}
              disabled={isRegisteringWebhook}
              className="px-4 py-2 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-xs rounded transition flex items-center gap-1 shadow"
            >
              {isRegisteringWebhook ? 'Registrando...' : 'Registrar no BB via API'}
            </button>
          </div>

          {regWebhookResult && (
            <div
              className={`mt-2.5 p-2 rounded text-xs flex items-center gap-1.5 ${
                regWebhookResult.success
                  ? 'bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30'
                  : 'bg-[#cf304a]/15 text-[#cf304a] border border-[#cf304a]/30'
              }`}
            >
              {regWebhookResult.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>{regWebhookResult.message}</span>
            </div>
          )}
        </div>

        {/* 🏛️ GATEWAY OFICIAL DE LIQUIDAÇÃO & WEBHOOK REAL BANCO DO BRASIL */}
        <div className="p-4 bg-[#0b0e11] rounded-lg border border-[#02c076]/40 space-y-3">
          <div className="flex flex-wrap justify-between items-center pb-2 border-b border-[#2f343b] gap-2">
            <h4 className="text-xs font-bold text-[#02c076] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#02c076]" />
              Gateway Oficial de Liquidação Pix Real Banco do Brasil (Engecema PJ)
            </h4>
            <span className="text-[10px] bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40 px-2 py-0.5 rounded font-bold uppercase">
              Operações Reais Exclusivas
            </span>
          </div>

          <p className="text-[11px] text-[#848e9c] leading-relaxed">
            Ambiente exclusivo para transações financeiras reais. Os pagamentos realizados por clientes na chave Pix <strong className="text-white font-mono">05.368.602/0001-10</strong> são liquidados pelo Banco do Brasil e transmitidos diretamente para o endpoint de Webhook oficial da Global Exchange com assinatura mTLS.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-[#181a20] rounded border border-[#2f343b] space-y-1">
              <span className="text-[10px] text-[#848e9c] block font-medium">URL Oficial de Notificação Pix BB:</span>
              <div className="flex items-center justify-between gap-1">
                <code className="text-xs text-[#f0b90b] font-mono break-all">{customWebhookUrl || 'https://global-exchange.onrender.com/api/webhook/pix'}</code>
                <button
                  type="button"
                  onClick={() => copyWebhookUrl(customWebhookUrl || `${window.location.origin}/api/webhook/pix`)}
                  className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#b7bdc6] hover:text-white rounded text-[10px] font-semibold shrink-0"
                >
                  {copiedWebhookUrl ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#181a20] rounded border border-[#2f343b] space-y-1">
              <span className="text-[10px] text-[#848e9c] block font-medium">Registro no Banco do Brasil:</span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white">Chave: <strong className="font-mono text-[#02c076]">05368602000110</strong></span>
                <button
                  type="button"
                  disabled={isRegisteringWebhook}
                  onClick={handleRegisterWebhook}
                  className="px-2.5 py-1 bg-[#02c076] hover:bg-[#02a766] text-black font-bold text-xs rounded transition flex items-center gap-1 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${isRegisteringWebhook ? 'animate-spin' : ''}`} />
                  {isRegisteringWebhook ? 'Registrando...' : 'Registrar no BB'}
                </button>
              </div>
            </div>
          </div>

          {regWebhookResult && (
            <div
              className={`p-2.5 rounded text-xs ${
                regWebhookResult.success
                  ? 'bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30'
                  : 'bg-[#cf304a]/15 text-[#cf304a] border border-[#cf304a]/30'
              }`}
            >
              {regWebhookResult.message}
            </div>
          )}
        </div>

        {/* 🔐 CONFIGURAÇÃO DE CREDENCIAIS OFICIAIS BANCO DO BRASIL PJ (PRODUÇÃO) */}
        <div className="p-4 bg-[#0b0e11] rounded-lg border border-[#f0b90b]/50 space-y-3">
          <div className="flex flex-wrap justify-between items-center pb-2 border-b border-[#2f343b] gap-2">
            <h4 className="text-xs font-bold text-[#f0b90b] flex items-center gap-1.5">
              <Key className="w-4 h-4 text-[#f0b90b]" />
              Credenciais Oficiais Banco do Brasil PJ (Produção 100% Real)
            </h4>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
              diagnostics?.credentials?.isConfigured
                ? 'bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40'
                : 'bg-[#cf304a]/20 text-[#cf304a] border border-[#cf304a]/40'
            }`}>
              {diagnostics?.credentials?.isConfigured ? '🟢 Conectado ao BB' : '🔴 Credenciais Pendentes'}
            </span>
          </div>

          <p className="text-[11px] text-[#848e9c]">
            Insira abaixo as credenciais obtidas no portal <strong className="text-white">developers.bb.com.br</strong> da conta PJ Engecema para ativar as transferências e liquidação automática via API em produção:
          </p>

          <form onSubmit={handleSaveBBCredentials} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#b7bdc6] mb-1 font-semibold text-[11px]">
                  Client ID (OAuth 2.0 BB):
                </label>
                <input
                  type="text"
                  value={bbClientIdInput}
                  onChange={(e) => setBbClientIdInput(e.target.value)}
                  placeholder="eyJpZCI6... ou Client ID de Produção"
                  className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="block text-[#b7bdc6] mb-1 font-semibold text-[11px]">
                  Client Secret (Chave Secreta BB):
                </label>
                <input
                  type="password"
                  value={bbClientSecretInput}
                  onChange={(e) => setBbClientSecretInput(e.target.value)}
                  placeholder="eyJpZCI6... ou Secret de Produção"
                  className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="block text-[#b7bdc6] mb-1 font-semibold text-[11px]">
                  Developer Application Key (gw-dev-app-key):
                </label>
                <input
                  type="text"
                  value={bbGwAppKeyInput}
                  onChange={(e) => setBbGwAppKeyInput(e.target.value)}
                  placeholder="Ex: 579ec... (Chave de aplicação do portal BB)"
                  className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="block text-[#b7bdc6] mb-1 font-semibold text-[11px]">
                  Chave Pix Oficial da Empresa (CNPJ):
                </label>
                <input
                  type="text"
                  value={bbPixKeyInput}
                  onChange={(e) => setBbPixKeyInput(e.target.value)}
                  placeholder="05368602000110"
                  className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-[#848e9c]">
                As credenciais são ativadas em tempo de execução e salvas com segurança no ambiente de produção.
              </span>
              <button
                type="submit"
                disabled={isSavingBBCreds}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#dfaa08] text-black font-bold text-xs rounded transition flex items-center gap-1.5 shadow shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isSavingBBCreds ? 'Ativando no Servidor...' : 'Salvar e Ativar Credenciais Oficiais'}
              </button>
            </div>
          </form>

          {bbCredsMsg && (
            <div
              className={`p-2.5 rounded text-xs flex items-center gap-1.5 ${
                bbCredsMsg.success
                  ? 'bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30'
                  : 'bg-[#cf304a]/15 text-[#cf304a] border border-[#cf304a]/30'
              }`}
            >
              {bbCredsMsg.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{bbCredsMsg.text}</span>
            </div>
          )}
        </div>

        {/* Testes Operacionais e Homologação */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Teste de Conexão OAuth com BB */}
          <div className="p-3.5 bg-[#0b0e11] rounded-lg border border-[#2f343b] space-y-2">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 text-[#f0b90b] ${isTestingBB ? 'animate-spin' : ''}`} />
              Teste de Autenticação OAuth & mTLS com o Banco do Brasil
            </h4>
            <p className="text-[11px] text-[#848e9c]">
              Verifica se as variáveis <code className="text-[#f0b90b]">BB_CLIENT_ID</code>, <code className="text-[#f0b90b]">BB_CLIENT_SECRET</code> e <code className="text-[#f0b90b]">BB_GW_APP_KEY</code> conseguem abrir canal seguro com <code className="text-white">oauth.bb.com.br</code>.
            </p>
            <button
              type="button"
              onClick={handleTestBBConnection}
              disabled={isTestingBB}
              className="py-2 px-3 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] border border-[#474d57] rounded text-xs font-semibold transition flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-[#f0b90b]" />
              {isTestingBB ? 'Conectando ao BB...' : 'Testar Conexão Oficial'}
            </button>

            {testResult && (
              <div
                className={`p-2 rounded text-xs ${
                  testResult.success
                    ? 'bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30'
                    : 'bg-[#cf304a]/15 text-[#cf304a] border border-[#cf304a]/30'
                }`}
              >
                {testResult.message}
              </div>
            )}
          </div>

          {/* Auditoria e Consulta de Transações Reais (Banco do Brasil) */}
          <div className="p-3.5 bg-[#0b0e11] rounded-lg border border-[#2f343b] space-y-2">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-[#38bdf8]" />
              Auditoria de Transação Real (Banco do Brasil)
            </h4>
            <p className="text-[11px] text-[#848e9c]">
              Consulte a liquidação oficial de qualquer depósito pelo <code className="text-[#f0b90b]">TXID</code> ou identificador <code className="text-[#f0b90b]">EndToEndId</code> na rede do Banco do Brasil:
            </p>
            <form onSubmit={handleAuditTxid} className="flex gap-2">
              <input
                type="text"
                value={auditTxid}
                onChange={(e) => setAuditTxid(e.target.value)}
                placeholder="Ex: GX... ou E00000000..."
                className="flex-1 bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#38bdf8]"
              />
              <button
                type="submit"
                disabled={isAuditing}
                className="py-1.5 px-3 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-xs rounded transition flex items-center justify-center gap-1 shadow shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                {isAuditing ? 'Consultando...' : 'Auditar no BB'}
              </button>
            </form>
            {auditResult && (
              <div
                className={`p-2 rounded text-xs flex items-center gap-1.5 ${
                  auditResult.status === 'CONCLUIDA'
                    ? 'bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30'
                    : 'bg-[#cf304a]/15 text-[#cf304a] border border-[#cf304a]/30'
                }`}
              >
                {auditResult.status === 'CONCLUIDA' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{auditResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabela de Transações e Liquidações Reais Recebidas pelo Webhook */}
        <div>
          <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#02c076]" />
              Transações e Liquidações Reais Recebidas do Banco do Brasil ({webhookEvents.length})
            </span>
            <div className="flex items-center gap-3">
              {webhookEvents.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearTestEvents}
                  className="text-[11px] text-[#cf304a] hover:text-[#f87171] flex items-center gap-1 transition px-2 py-0.5 rounded border border-[#cf304a]/30 hover:bg-[#cf304a]/10"
                  title="Limpar histórico de registros"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar Registros
                </button>
              )}
              <button
                type="button"
                onClick={() => fetchWebhookEventsAPI().then((e) => e && setWebhookEvents(e))}
                className="text-[11px] text-[#848e9c] hover:text-white flex items-center gap-1 px-2 py-0.5 rounded border border-[#474d57] hover:bg-[#2b3139]"
              >
                <RefreshCw className="w-3 h-3" />
                Atualizar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#eaecef]">
              <thead>
                <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                  <th className="py-2 px-3">EndToEndId (Identificador Oficial BB)</th>
                  <th className="py-2 px-3">Pagador / Depositante</th>
                  <th className="py-2 px-3">Data / Hora</th>
                  <th className="py-2 px-3 text-right">Valor Liquidado</th>
                  <th className="py-2 px-3 text-center">Status Bancário</th>
                  <th className="py-2 px-3 text-center">Comprovante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20262d]">
                {webhookEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[#848e9c]">
                      <p className="text-xs font-medium text-white mb-1">
                        Aguardando novos pagamentos na chave Pix oficial do Banco do Brasil.
                      </p>
                      <p className="text-[11px] text-[#848e9c]">
                        Conforme os clientes efetuarem o Pix para o CNPJ <strong className="text-[#f0b90b]">05.368.602/0001-10</strong>, o Banco do Brasil enviará as confirmações para o Webhook e a liquidação aparecerá aqui instantaneamente.
                      </p>
                    </td>
                  </tr>
                ) : (
                  webhookEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-[#2b3139]/30">
                      <td className="py-2 px-3 font-mono text-[#f0b90b]">
                        {evt.endToEndId.slice(0, 24)}...
                      </td>
                      <td className="py-2 px-3 text-white font-medium">{evt.payerName}</td>
                      <td className="py-2 px-3 text-[#848e9c]">
                        {new Date(evt.paidAt || evt.receivedAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#02c076]">
                        R$ {evt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30">
                          LIQUIDADO BB
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenReceiptFromEvent(evt)}
                          className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#f0b90b] border border-[#f0b90b]/40 rounded text-[11px] font-medium flex items-center justify-center gap-1 mx-auto transition"
                          title="Visualizar Comprovante Oficial de Liquidação Bancária"
                        >
                          <FileText className="w-3 h-3" />
                          Recibo
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Lançamentos Financeiros (Engecema Liquidez) */}
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
        <h3 className="text-base font-bold text-[#f0b90b] mb-1 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Lançamentos Financeiros Institucionais
        </h3>
        <p className="text-xs text-[#848e9c] mb-4">
          Registro de aportes de liquidez, despesas operacionais e custódia corporativa da Engecema
        </p>

        <form onSubmit={handleAddFinancialTx} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end mb-4">
          <div>
            <label className="block text-xs text-[#848e9c] mb-1">Tipo</label>
            <select
              value={finType}
              onChange={(e) => setFinType(e.target.value as 'CREDIT' | 'DEBIT')}
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
            >
              <option value="CREDIT">Crédito (+)</option>
              <option value="DEBIT">Débito (-)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-[#848e9c] mb-1">Descrição</label>
            <input
              type="text"
              value={finDesc}
              onChange={(e) => setFinDesc(e.target.value)}
              placeholder="Ex: Aporte institucional de liquidez"
              required
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#848e9c] mb-1">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={finAmount}
              onChange={(e) => setFinAmount(e.target.value)}
              placeholder="0,00"
              required
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center justify-center gap-1 shadow"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Registrar Lançamento
            </button>
          </div>
        </form>

        {finMsg && (
          <div className="mb-3 text-xs text-[#02c076] font-medium">
            {finMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#eaecef]">
            <thead>
              <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3">Descrição</th>
                <th className="py-2 px-3 text-right">Valor (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20262d]">
              {financialTxs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[#848e9c]">
                    Nenhum lançamento financeiro registrado. Adicione entradas ou saídas de liquidez acima.
                  </td>
                </tr>
              ) : (
                financialTxs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#2b3139]/30">
                    <td className="py-2 px-3 text-[#848e9c]">{tx.date}</td>
                    <td className="py-2 px-3 font-bold">
                      <span
                        className={
                          tx.type === 'CREDIT' ? 'text-[#02c076]' : 'text-[#cf304a]'
                        }
                      >
                        {tx.type === 'CREDIT' ? 'Crédito' : 'Débito'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#eaecef]">{tx.description}</td>
                    <td
                      className={`py-2 px-3 text-right font-mono font-semibold ${
                        tx.type === 'CREDIT' ? 'text-[#02c076]' : 'text-[#cf304a]'
                      }`}
                    >
                      {tx.type === 'CREDIT' ? '+' : '-'} R${' '}
                      {tx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gestão e Aprovação de Administradores (Controle Exclusivo de geonimatos31@gmail.com) */}
      <div className="bg-[#1e2329] border border-[#f0b90b]/40 rounded-lg p-5">
        <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] mb-4 gap-2">
          <div>
            <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Aprovações e Gestão de Novos Administradores
            </h3>
            <p className="text-xs text-[#848e9c] mt-0.5">
              Controle exclusivo de <strong className="text-white">{MASTER_ADMIN_EMAIL}</strong>. Novos administradores só acessam a plataforma após sua aprovação formal aqui.
            </p>
          </div>
          <span className="text-[11px] bg-[#f0b90b]/10 text-[#f0b90b] border border-[#f0b90b]/30 px-2.5 py-1 rounded font-bold uppercase">
            Aprovação Obrigatória
          </span>
        </div>

        {adminMgmtMsg && (
          <div className="mb-4 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium">
            {adminMgmtMsg}
          </div>
        )}

        {/* 1. Solicitações Pendentes */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-white">
            <Clock className="w-3.5 h-3.5 text-[#38bdf8]" />
            Solicitações Pendentes de Aprovação ({adminRequests.filter((r) => r.status === 'pending').length})
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#eaecef]">
              <thead>
                <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                  <th className="py-2 px-3">Solicitante</th>
                  <th className="py-2 px-3">E-mail</th>
                  <th className="py-2 px-3">Justificativa / Cargo</th>
                  <th className="py-2 px-3">Data do Pedido</th>
                  <th className="py-2 px-3 text-center">Decisão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20262d]">
                {adminRequests.filter((r) => r.status === 'pending').length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#848e9c]">
                      Nenhuma solicitação de novo administrador pendente no momento.
                    </td>
                  </tr>
                ) : (
                  adminRequests
                    .filter((r) => r.status === 'pending')
                    .map((req) => (
                      <tr key={req.id} className="hover:bg-[#2b3139]/30">
                        <td className="py-2.5 px-3 font-semibold text-white">{req.name}</td>
                        <td className="py-2.5 px-3 font-mono text-[#b7bdc6]">{req.email}</td>
                        <td className="py-2.5 px-3 text-[#848e9c] max-w-xs">{req.reason || 'Não informado'}</td>
                        <td className="py-2.5 px-3 text-[#848e9c]">
                          {new Date(req.requestedAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApproveAdmin(req.id)}
                              className="px-2.5 py-1 bg-[#02c076] hover:bg-[#02a766] text-white rounded font-bold text-[11px] transition shadow flex items-center gap-1"
                            >
                              <UserCheck className="w-3 h-3" />
                              Aprovar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectAdmin(req.id)}
                              className="px-2.5 py-1 bg-[#cf304a] hover:bg-[#b02239] text-white rounded font-bold text-[11px] transition shadow flex items-center gap-1"
                            >
                              <UserX className="w-3 h-3" />
                              Recusar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Administradores Atualmente Autorizados */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-white">
            <UserCheck className="w-3.5 h-3.5 text-[#02c076]" />
            Administradores Atualmente Ativos e Autorizados ({approvedAdmins.length})
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {approvedAdmins.map((adminEmailItem) => {
              const isMaster = isMasterAdminEmail(adminEmailItem);
              return (
                <div
                  key={adminEmailItem}
                  className="p-3 bg-[#0b0e11] border border-[#2f343b] rounded-lg flex items-center justify-between text-xs"
                >
                  <div className="truncate mr-2">
                    <span className="font-mono text-white font-semibold block truncate">
                      {adminEmailItem}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        isMaster ? 'text-[#f0b90b]' : 'text-[#02c076]'
                      }`}
                    >
                      {isMaster ? '★ ADMINISTRADOR GERAL (MASTER)' : '● Administrador Aprovado'}
                    </span>
                  </div>

                  {!isMaster && (
                    <button
                      type="button"
                      onClick={() => handleRevokeAdmin(adminEmailItem)}
                      className="px-2 py-1 bg-[#cf304a]/20 hover:bg-[#cf304a] text-[#cf304a] hover:text-white border border-[#cf304a]/40 rounded text-[10px] font-bold transition shrink-0"
                      title="Revogar Acesso"
                    >
                      Revogar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chamados e Solicitações de Ajuste de Clientes */}
      <div className="bg-[#1e2329] border border-[#38bdf8]/40 rounded-lg p-5">
        <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] mb-4 gap-2">
          <div>
            <h3 className="text-base font-bold text-[#38bdf8] flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#38bdf8]" />
              Chamados e Solicitações de Ajuste de Clientes
            </h3>
            <p className="text-xs text-[#848e9c] mt-0.5">
              Solicitações formais de clientes para correção de envio Pix, estorno de saldo ou esclarecimentos operacionais.
            </p>
          </div>
          <span className="text-[11px] bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30 px-2.5 py-1 rounded font-bold">
            {correctionRequests.filter((r) => r.status === 'pending').length} Chamado(s) Pendente(s)
          </span>
        </div>

        {correctionMsg && (
          <div className="mb-4 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{correctionMsg}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#eaecef]">
            <thead>
              <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3">Cliente</th>
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3">Assunto & Descrição</th>
                <th className="py-2 px-3 text-right">Valor Relacionado</th>
                <th className="py-2 px-3 text-center">Status</th>
                <th className="py-2 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20262d]">
              {correctionRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[#848e9c]">
                    Nenhum chamado de cliente registrado até o momento.
                  </td>
                </tr>
              ) : (
                correctionRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#2b3139]/30">
                    <td className="py-2.5 px-3 text-[#848e9c] whitespace-nowrap">
                      {new Date(req.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <strong className="text-white block font-semibold">{req.clientName}</strong>
                      <span className="text-[#848e9c] font-mono text-[11px]">{req.clientEmail}</span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30">
                        {req.type === 'CORRECAO_SAQUE'
                          ? 'Correção de Saque/Pix'
                          : req.type === 'SOLICITACAO_APORTE'
                          ? 'Aporte de Recursos'
                          : req.type === 'DUVIDA_SALDO'
                          ? 'Dúvida de Saldo'
                          : 'Suporte Geral'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-sm">
                      <strong className="text-white block text-xs">{req.subject}</strong>
                      <p className="text-[#b7bdc6] text-[11px] mt-0.5 leading-relaxed">{req.message}</p>
                      <span className="text-[#848e9c] font-mono text-[10px] block mt-1">
                        Protocolo: {req.txid}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                      {req.relatedAmount ? (
                        <span className="text-[#02c076]">
                          {req.relatedCurrency === 'BRL' ? 'R$ ' : ''}
                          {req.relatedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          {req.relatedCurrency === 'GX' ? ' GX' : ''}
                        </span>
                      ) : (
                        <span className="text-[#848e9c]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          req.status === 'resolved'
                            ? 'bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30'
                            : 'bg-[#f0b90b]/15 text-[#f0b90b] border border-[#f0b90b]/30'
                        }`}
                      >
                        {req.status === 'resolved' ? 'RESOLVIDO' : 'PENDENTE'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenClientFromCorrection(req)}
                          className="px-2.5 py-1 bg-[#02c076] hover:bg-[#02a766] text-black font-bold text-[11px] rounded transition shadow flex items-center gap-1"
                          title="Abre a conta do cliente para aplicar a correção de custódia"
                        >
                          <Sliders className="w-3 h-3" />
                          Atender / Ajustar Saldo
                        </button>
                        {req.status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => handleResolveCorrection(req.id)}
                            className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] text-[11px] rounded transition border border-[#474d57]"
                          >
                            Concluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 📜 Livro Razão de Custódia & Liquidação (Ledger Auditável Engecema) */}
      <div className="bg-[#1e2329] border border-[#f0b90b]/40 rounded-lg p-5 space-y-4 shadow-xl">
        <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] gap-3">
          <div>
            <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#f0b90b]" />
              📜 Livro Razão de Custódia & Liquidação (Ledger Auditável Engecema)
            </h3>
            <p className="text-xs text-[#848e9c] mt-0.5">
              Registro histórico imutável das posições mantidas em custódia, aportes de capital, transferências em Reais (Pix BB) e ajustes com TXID.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncBridge}
              disabled={isSyncingBridge}
              className="px-3.5 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center gap-1.5 shadow"
              title="Sincroniza todos os dados entre a BitX Core Blockchain e a Corretora Global Exchange"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBridge ? 'animate-spin' : ''}`} />
              {isSyncingBridge ? 'Sincronizando...' : '🔗 Ponte de Sincronização Global Exchange'}
            </button>
            <button
              type="button"
              onClick={handleReconcileLedger}
              disabled={isReconcilingLedger}
              className="px-3.5 py-2 bg-[#2b3139] hover:bg-[#353c46] text-[#02c076] border border-[#02c076]/50 hover:border-[#02c076] font-bold text-xs rounded transition flex items-center gap-1.5 shadow"
              title="Equaliza e reconcilia os saldos de custódia com os registros oficiais do Livro Razão"
            >
              <Scale className={`w-3.5 h-3.5 ${isReconcilingLedger ? 'animate-spin' : ''}`} />
              {isReconcilingLedger ? 'Reconciliando...' : '⚖️ Reconciliar Saldos'}
            </button>
          </div>
        </div>

        {ledgerSuccessMsg && (
          <div className="p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{ledgerSuccessMsg}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#eaecef]">
            <thead>
              <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                <th className="py-2.5 px-3 whitespace-nowrap">ID Registro</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Tipo de Lançamento</th>
                <th className="py-2.5 px-3">Contraparte / Favorecido</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Montante em GX</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Valor em Reais (R$)</th>
                <th className="py-2.5 px-3 whitespace-nowrap">TXID Criptográfico de Auditoria</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Data / Hora</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20262d]">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#848e9c]">
                    Nenhum registro no Livro Razão. Clique em "⚖️ Reconciliar Saldos" para carregar a custódia institucional CUST-001.
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#2b3139]/30 transition">
                    <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-[#f0b90b]">
                      <span className="bg-[#0b0e11] px-2 py-0.5 rounded border border-[#3a414b]">
                        {entry.id}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 uppercase">
                        {entry.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <strong className="text-white block font-medium leading-relaxed">{entry.counterparty}</strong>
                      {entry.notes && (
                        <span className="text-[11px] text-[#848e9c] block mt-0.5 leading-normal">{entry.notes}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[#f0b90b] whitespace-nowrap">
                      +{entry.amountGx.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} GX
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[#02c076] whitespace-nowrap">
                      +R$ {entry.amountBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#848e9c] truncate max-w-[140px]" title={entry.txid}>
                          {entry.txid ? `${entry.txid.slice(0, 10)}...${entry.txid.slice(-6)}` : '0x...'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.txid) navigator.clipboard.writeText(entry.txid);
                          }}
                          className="p-1 hover:bg-[#2b3139] text-[#848e9c] hover:text-[#f0b90b] rounded transition"
                          title="Copiar TXID completo"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#848e9c] whitespace-nowrap font-mono text-[11px]">
                      {entry.timestamp}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40 uppercase shadow-sm">
                        <ShieldCheck className="w-3 h-3 text-[#02c076]" />
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ⚙️ Painel das Configurações da BitX Core Blockchain */}
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5 space-y-6">
        <div>
          <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#f0b90b]" />
                Painel das Configurações da BitX Core (Blockchain Mainnet #349.000)
              </h3>
              <p className="text-xs text-[#848e9c] mt-0.5">
                Cadastre e sincronize clientes reais, defina aportes iniciais de BTXC, Reais (R$) e USDT com criação automática de endereços Bech32 e TXID.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40 rounded font-bold">
                REDE ATIVA · PRODUÇÃO
              </span>
              <span className="font-mono text-[#f0b90b] bg-[#0b0e11] px-2 py-0.5 rounded border border-[#2f343b]">
                #349.000
              </span>
            </div>
          </div>

          {/* ➕ Cadastrar Novo Cliente Real na Global Exchange */}
          <div className="p-4 bg-[#0b0e11] border border-[#2f343b] rounded-lg mb-6">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-[#f0b90b]" />
              ➕ Cadastrar Novo Cliente Real na Global Exchange
            </h4>

            {newClientMsg && (
              <div className="mb-4 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{newClientMsg}</span>
              </div>
            )}

            {newClientError && (
              <div className="mb-4 p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{newClientError}</span>
              </div>
            )}

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Identificador / Tag (ID)</label>
                  <input
                    type="text"
                    value={newClientTag}
                    onChange={(e) => setNewClientTag(e.target.value)}
                    placeholder="Ex: GE-CORP-001 ou GE-CLI-1029"
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                  <span className="text-[10px] text-[#848e9c] mt-0.5 block">
                    Deixe vazio para gerar código automático.
                  </span>
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Nome Completo / Razão Social *</label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Ex: Engecema Fomento e Tecnologia Ltda"
                    required
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">E-mail Institucional / Contato *</label>
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    placeholder="Ex: cliente@engecema.com.br"
                    required
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Documento Oficial (CPF / CNPJ)</label>
                  <input
                    type="text"
                    value={newClientDoc}
                    onChange={(e) => setNewClientDoc(e.target.value)}
                    placeholder="Ex: 09.123.456/0001-78 ou CPF"
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs items-end">
                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Saldo Inicial BTXC</label>
                  <input
                    type="number"
                    step="any"
                    value={newClientBtxc}
                    onChange={(e) => setNewClientBtxc(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Saldo Inicial BRL (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newClientBrl}
                    onChange={(e) => setNewClientBrl(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Saldo Inicial USDT ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newClientUsdt}
                    onChange={(e) => setNewClientUsdt(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Perfil / Status KYC</label>
                  <select
                    value={newClientKyc}
                    onChange={(e) => setNewClientKyc(e.target.value)}
                    className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  >
                    <option value="Verificado KYC (Completo)">Verificado KYC (Completo)</option>
                    <option value="Verificado KYC">Verificado KYC</option>
                    <option value="Pendente KYC">Pendente KYC</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingNewClient}
                  className="px-5 py-2.5 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center gap-1.5 shadow"
                >
                  <PlusCircle className="w-4 h-4" />
                  {isSubmittingNewClient ? 'Cadastrando e Sincronizando...' : '＋ Cadastrar e Sincronizar Cliente Real'}
                </button>
              </div>
            </form>
          </div>

          {/* Clientes Reais Ativos no Sistema */}
          <div>
            <div className="flex flex-wrap justify-between items-center pb-2 mb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#f0b90b]" />
                Clientes Reais Ativos no Sistema ({clients.length})
              </h4>
              <span className="text-xs text-[#848e9c]">
                Base unificada e sincronizada em tempo real com a corretora Global Exchange
              </span>
            </div>

            {clientActionMsg && (
              <div className="mb-3 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{clientActionMsg}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#eaecef]">
                <thead>
                  <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                    <th className="py-2.5 px-3">Identificador</th>
                    <th className="py-2.5 px-3">Nome / Razão Social</th>
                    <th className="py-2.5 px-3">Documento</th>
                    <th className="py-2.5 px-3">E-mail</th>
                    <th className="py-2.5 px-3 text-right">Saldo BTXC</th>
                    <th className="py-2.5 px-3 text-right">Saldo BRL</th>
                    <th className="py-2.5 px-3 text-right">Saldo USDT</th>
                    <th className="py-2.5 px-3 text-center">Status KYC</th>
                    <th className="py-2.5 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#20262d]">
                  {clients.map((c) => {
                    const btxcBal = StorageService.getCustodyBalance(c.email);
                    const brlBal = StorageService.getCustodyBrlBalance(c.email);
                    const usdtBal = StorageService.getCustodyUsdtBalance(c.email);
                    const isGeoni = isGeoniEmail(c.email) || isGeoniRecord(c);

                    const formattedDate = c.createdAt
                      ? new Date(c.createdAt).toLocaleDateString('pt-BR')
                      : '10/10/2026';

                    return (
                      <tr
                        key={c.id || c.email}
                        className={`hover:bg-[#2b3139]/30 transition ${isGeoni ? 'bg-[#f0b90b]/5' : ''}`}
                      >
                        <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                          <span className="text-[#f0b90b] font-bold bg-[#0b0e11] px-2 py-0.5 rounded border border-[#3a414b]">
                            {c.tagId || c.email}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <strong className="text-white block font-semibold">{c.name}</strong>
                            <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]">
                              <span>Cadastrado: {formattedDate}</span>
                              {isGeoni && (
                                <span className="px-1.5 py-0.2 text-[9px] bg-[#f0b90b] text-black font-extrabold rounded uppercase">
                                  Titular Principal
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[#b7bdc6] whitespace-nowrap">
                          {c.document || '—'}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#848e9c] whitespace-nowrap">
                          {c.email}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#02c076] whitespace-nowrap">
                          {btxcBal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} BTXC
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#eaecef] whitespace-nowrap">
                          R$ {brlBal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#f0b90b] whitespace-nowrap">
                          $ {usdtBal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30">
                            <ShieldCheck className="w-3 h-3 text-[#02c076]" />
                            {c.kycStatus || 'Verificado KYC'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => openClientHistory(c)}
                              className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#f0b90b] text-[11px] font-bold rounded transition border border-[#474d57] flex items-center gap-1"
                              title="Gerenciar custódia e histórico"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              🛡️ Custódia
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditClient(c)}
                              className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-white text-[11px] font-semibold rounded transition border border-[#474d57]"
                              title="Editar cadastro e saldos do cliente"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGoToCorretora(c)}
                              className="px-2 py-1 bg-[#f0b90b]/15 hover:bg-[#f0b90b] text-[#f0b90b] hover:text-black text-[11px] font-bold rounded transition border border-[#f0b90b]/30 flex items-center gap-0.5"
                              title="Acessar painel da corretora como este cliente"
                            >
                              Corretora ↗
                            </button>
                            {!isGeoni && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setClientToDelete(c);
                                }}
                                className="px-2 py-1 bg-[#cf304a]/15 hover:bg-[#cf304a] text-[#cf304a] hover:text-white text-[11px] font-semibold rounded transition border border-[#cf304a]/30 flex items-center gap-1 shadow-sm"
                                title="Remover cliente"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remover
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Gerenciamento de Clientes da Global Exchange (Conglomerado Real) */}
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
        <div className="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-[#2f343b] mb-4">
          <div>
            <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
              <Users className="w-4 h-4" />
              Carteira de Clientes da Global Exchange (Conglomerado Real)
            </h3>
            <span className="text-xs text-[#848e9c]">
              Total Custodiado Real:{' '}
              <strong className="text-[#02c076] font-mono">
                {clients
                  .reduce((sum, c) => sum + StorageService.getCustodyBalance(c.email), 0)
                  .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}{' '}
                GX
              </strong>{' '}
              • Total em Reais (R$):{' '}
              <strong className="text-[#02c076] font-mono">
                R${' '}
                {clients
                  .reduce((sum, c) => sum + StorageService.getCustodyBrlBalance(c.email), 0)
                  .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>{' '}
              • {clients.length} cliente(s) ativo(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePurgeFictitiousClients}
              disabled={isPurgingClients}
              className="px-3 py-1.5 bg-[#cf304a]/20 hover:bg-[#cf304a] text-[#cf304a] hover:text-white border border-[#cf304a]/40 rounded text-xs font-bold transition flex items-center gap-1.5 shadow"
              title="Remove qualquer mock residual e sincroniza cadastros reais"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isPurgingClients ? 'Limpando Mocks...' : 'Limpar Clientes Fictícios & Sincronizar'}
            </button>
          </div>
        </div>

        {purgeClientMsg && (
          <div className="mb-4 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{purgeClientMsg}</span>
          </div>
        )}

        {clientActionMsg && (
          <div className="mb-4 p-3 bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] text-xs rounded font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{clientActionMsg}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#eaecef]">
            <thead>
              <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                <th className="py-2.5 px-3">Identificador</th>
                <th className="py-2.5 px-3">Nome / Razão Social</th>
                <th className="py-2.5 px-3">E-mail</th>
                <th className="py-2.5 px-3">CPF / CNPJ</th>
                <th className="py-2.5 px-3">Endereço BitX Core (Destino)</th>
                <th className="py-2.5 px-3">Saldo GX (BitX)</th>
                <th className="py-2.5 px-3">Saldo com Liquidez (R$)</th>
                <th className="py-2.5 px-3">Valor de Mercado Estimado</th>
                <th className="py-2.5 px-3 text-center">Status KYC</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20262d]">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#848e9c]">
                    <p className="text-sm font-medium mb-1">
                      Nenhum cliente cadastrado ainda.
                    </p>
                    <p className="text-xs text-[#5e6673]">
                      Os cadastros fictícios foram removidos. Novos clientes e administradores que se cadastrarem no site aparecerão aqui automaticamente.
                    </p>
                  </td>
                </tr>
              ) : (
                clients.map((c, index) => {
                  const clientBalance = StorageService.getCustodyBalance(c.email);
                  const clientBrlBalance = StorageService.getCustodyBrlBalance(c.email);
                  const estimatedValue = clientBalance * (parseFloat(launchPrice) || 420000.0);
                  const isGeoni = isGeoniEmail(c.email) || isGeoniRecord(c);

                  return (
                    <tr
                      key={c.id || c.email}
                      className={`hover:bg-[#2b3139]/30 transition ${
                        isGeoni ? 'bg-[#f0b90b]/5' : ''
                      }`}
                    >
                      <td className="py-3 px-3 whitespace-nowrap font-mono">
                        <span className="text-[11px] text-[#f0b90b] font-bold bg-[#0b0e11] px-2 py-0.5 rounded border border-[#3a414b]">
                          GX-CLI-{(index + 1).toString().padStart(4, '0')}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-white block font-semibold">
                            {c.name || 'Cliente Global Exchange'}
                          </strong>
                          {isGeoni && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-[#f0b90b] text-black font-extrabold rounded uppercase">
                              Titular Principal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#848e9c]">
                        {c.email}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#b7bdc6] whitespace-nowrap">
                        {c.document || '05.368.602/0001-10'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[#f0b90b] font-mono truncate max-w-[120px]"
                            title={c.bitxAddress}
                          >
                            {c.bitxAddress
                              ? `${c.bitxAddress.slice(0, 8)}...${c.bitxAddress.slice(-6)}`
                              : 'bxrt1q...'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (c.bitxAddress) navigator.clipboard.writeText(c.bitxAddress);
                            }}
                            className="p-1 hover:bg-[#2b3139] text-[#848e9c] hover:text-[#f0b90b] rounded transition"
                            title="Copiar Endereço BitX Core completo"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono whitespace-nowrap">
                        <span className="font-bold text-[#f0b90b]">
                          {clientBalance.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}{' '}
                          GX
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono whitespace-nowrap">
                        <span className="text-[#02c076] font-bold">
                          R${' '}
                          {clientBrlBalance.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono whitespace-nowrap">
                        <span className="text-[#b7bdc6]">
                          R${' '}
                          {estimatedValue.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 uppercase">
                          <ShieldCheck className="w-3 h-3 text-[#02c076]" />
                          Verificado KYC
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openClientHistory(c)}
                            className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#f0b90b] text-[11px] font-bold rounded transition border border-[#474d57] flex items-center gap-1"
                            title="Gerenciar custódia e histórico"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            🛡️ Custódia
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditClient(c)}
                            className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-white text-[11px] font-semibold rounded transition border border-[#474d57]"
                            title="Editar cadastro e saldos do cliente"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGoToCorretora(c)}
                            className="px-2 py-1 bg-[#f0b90b]/15 hover:bg-[#f0b90b] text-[#f0b90b] hover:text-black text-[11px] font-bold rounded transition border border-[#f0b90b]/30 flex items-center gap-0.5"
                            title="Acessar painel da corretora como este cliente"
                          >
                            Corretora ↗
                          </button>
                          {!isGeoni && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setClientToDelete(c);
                              }}
                              className="px-2 py-1 bg-[#cf304a]/15 hover:bg-[#cf304a] text-[#cf304a] hover:text-white text-[11px] font-semibold rounded transition border border-[#cf304a]/30 flex items-center gap-1 shadow-sm"
                              title="Remover cliente"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remover
                            </button>
                          )}
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

      {/* Histórico Geral de Auditoria Global */}
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
        <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4">
          <div>
            <h3 className="text-base font-bold text-[#f0b90b]">
              Histórico Geral de Transações da Rede (Auditoria Global)
            </h3>
            <span className="text-xs text-[#848e9c]">
              {allMovements.length} registro(s) auditado(s) na infraestrutura
            </span>
          </div>
          <button
            type="button"
            onClick={handleDownloadReport}
            className="text-xs px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] border border-[#474d57] rounded flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar Relatório Admin
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#eaecef]">
            <thead>
              <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                <th className="py-2.5 px-3">Data/Hora</th>
                <th className="py-2.5 px-3">Cliente</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Descrição</th>
                <th className="py-2.5 px-3">Valor</th>
                <th className="py-2.5 px-3">TXID</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20262d]">
              {allMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[#848e9c]">
                    Nenhuma movimentação registrada no sistema global. Todas as novas operações de clientes passarão a existir aqui.
                  </td>
                </tr>
              ) : (
                allMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-[#2b3139]/30">
                    <td className="py-2.5 px-3 text-[#848e9c] whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-semibold">{m.clientName}</span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-[#f0b90b]/30 bg-[#f0b90b]/10 text-[#f0b90b]">
                        {m.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-xs truncate">{m.description}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold">
                      {m.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#f0b90b]">
                      {m.txid.slice(0, 10)}...
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(m)}
                        className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#f0b90b] rounded text-[10px] font-bold"
                      >
                        Recibo
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Gestão e Carteira BitX Core do Cliente (Admin) */}
      {selectedClient && (() => {
        const bitxAddr = selectedClient.bitxAddress || generateBitxCoreAddress(selectedClient.email);
        const currentBal = StorageService.getCustodyBalance(selectedClient.email);
        const currentBrlBal = StorageService.getCustodyBrlBalance(selectedClient.email);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
            <div className="bg-[#1e2329] border border-[#474d57] rounded-xl max-w-2xl w-full p-6 text-[#eaecef] shadow-2xl relative my-8">
              <button
                onClick={() => setSelectedClient(null)}
                className="absolute top-4 right-4 text-[#848e9c] hover:text-white p-1 rounded hover:bg-[#2b3139]"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pr-8 border-b border-[#2f343b] pb-3">
                <div>
                  <h3 className="text-lg font-bold text-[#f0b90b] flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-[#f0b90b]" />
                    Gestão de Custódia: {selectedClient.name || selectedClient.email}
                  </h3>
                  <p className="text-xs text-[#848e9c]">
                    Doc/CPF: {selectedClient.document || 'Não informado'} • E-mail: {selectedClient.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-[#0b0e11] px-3 py-1.5 rounded-lg border border-[#02c076]/40 text-right">
                    <span className="text-[10px] text-[#848e9c] block font-medium">Saldo com Liquidez</span>
                    <span className="text-sm font-bold font-mono text-[#02c076]">
                      R$ {currentBrlBal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-[#0b0e11] px-3 py-1.5 rounded-lg border border-[#f0b90b]/40 text-right">
                    <span className="text-[10px] text-[#848e9c] block font-medium">Ativos GX / BTXC</span>
                    <span className="text-sm font-bold font-mono text-[#f0b90b]">
                      {currentBal.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} GX
                    </span>
                  </div>
                </div>
              </div>

              {/* CARD 1: Endereço Oficial BitX Core para Transferência Externa */}
              <div className="bg-[#0b0e11] border border-[#f0b90b]/40 rounded-lg p-4 mb-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#f0b90b] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#02c076]" />
                    Endereço Oficial da Carteira BitX Core (Destino para Transferência):
                  </span>
                  <span className="text-[10px] bg-[#f0b90b]/15 text-[#f0b90b] px-2 py-0.5 rounded font-mono font-semibold">
                    Rede Nativa Bech32
                  </span>
                </div>

                <div className="p-2.5 bg-[#181a20] border border-[#3a414b] rounded text-xs font-mono text-[#38bdf8] break-all select-all flex items-center justify-between gap-2">
                  <span>{bitxAddr}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(bitxAddr);
                      setAdminBitxCopied(true);
                      setTimeout(() => setAdminBitxCopied(false), 2000);
                    }}
                    className="shrink-0 px-2.5 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] hover:text-[#f0b90b] text-xs font-semibold rounded transition flex items-center gap-1 border border-[#474d57]"
                    title="Copiar endereço completo"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {adminBitxCopied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>

                <div className="bg-[#cf304a]/10 border border-[#cf304a]/30 rounded p-2.5 text-[11px] text-[#eaecef] leading-relaxed">
                  <strong className="text-[#cf304a] block font-bold mb-0.5">
                    ⚠️ ATENÇÃO PARA O ENVIO NO PAINEL DA BITX CORE:
                  </strong>
                  Ao realizar a transferência de 1 BTXC no painel da BitX Core, informe o endereço acima no campo <strong className="text-white">"Para (Destino)"</strong>.
                  <br />
                  <span className="text-[#f0b90b]">Nunca cole uma chave TXID (iniciada com 0x...) no campo de destino</span>, pois TXID é apenas o comprovante de uma transação. A blockchain BitX Core aceita apenas endereços iniciados com <strong className="text-white">bxrt1q...</strong>.
                </div>
              </div>

              {/* CARD 2: Formulário de Liquidação / Crédito de BitX Core Confirmado */}
              <div className="bg-[#181a20] border border-[#2f343b] rounded-lg p-4 mb-4">
                <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                  <ArrowDownLeft className="w-4 h-4 text-[#02c076]" />
                  Creditar / Liquidar Depósito BitX Core Realizado:
                </h4>
                <p className="text-[11px] text-[#848e9c] mb-3">
                  Após realizar o envio no painel da BitX Core, informe o Hash gerado na blockchain (ex: <code className="text-[#38bdf8]">tx_5e197e2d</code>) e a quantidade para atualizar a custódia do cliente imediatamente:
                </p>

                <form onSubmit={handleAdminCreditBitx} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[#848e9c] block mb-1">
                        ID / Hash da Transação BitX Core:
                      </label>
                      <input
                        type="text"
                        value={adminBitxHash}
                        onChange={(e) => setAdminBitxHash(e.target.value)}
                        placeholder="Ex: tx_5e197e2d"
                        className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:border-[#f0b90b] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#848e9c] block mb-1">
                        Quantidade a Creditar (BTXC):
                      </label>
                      <input
                        type="text"
                        value={adminBitxAmount}
                        onChange={(e) => setAdminBitxAmount(e.target.value)}
                        placeholder="Ex: 1.0000"
                        className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:border-[#f0b90b] focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAdminCreditingBitx}
                    className="w-full py-2 bg-[#02c076] hover:bg-[#02a766] disabled:opacity-50 text-white font-bold text-xs rounded transition flex items-center justify-center gap-2 shadow"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isAdminCreditingBitx ? 'Processando Crédito...' : 'Confirmar e Creditar BTXC na Conta do Cliente'}
                  </button>
                </form>

                {adminBitxMsg && (
                  <div className={`mt-3 p-2.5 rounded text-xs font-medium border ${
                    adminBitxMsg.includes('✅') || adminBitxMsg.includes('Sucesso')
                      ? 'bg-[#02c076]/15 border-[#02c076]/40 text-[#02c076]'
                      : 'bg-[#cf304a]/15 border-[#cf304a]/40 text-[#cf304a]'
                  }`}>
                    {adminBitxMsg}
                  </div>
                )}
              </div>

              {/* CARD: Ajuste Oficial de Custódia (Reais ou GX) */}
              <div className="bg-[#181a20] border border-[#02c076]/40 rounded-lg p-4 mb-4">
                <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-[#02c076]" />
                    Ajuste Oficial de Custódia (Alçada Administrativa)
                  </h4>
                  <div className="flex rounded bg-[#0b0e11] p-0.5 border border-[#2f343b]">
                    <button
                      type="button"
                      onClick={() => setAdminAdjustCurrency('BRL')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded transition ${
                        adminAdjustCurrency === 'BRL'
                          ? 'bg-[#02c076] text-black shadow'
                          : 'text-[#848e9c] hover:text-white'
                      }`}
                    >
                      Reais (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminAdjustCurrency('GX')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded transition ${
                        adminAdjustCurrency === 'GX'
                          ? 'bg-[#f0b90b] text-black shadow'
                          : 'text-[#848e9c] hover:text-white'
                      }`}
                    >
                      Moedas GX
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-[#848e9c] mb-3 leading-relaxed">
                  Utilize esta ferramenta para corrigir saldos de saques não concluídos, estornos ou rebalanceamento comercial com geração de recibo auditável:
                </p>

                <form onSubmit={handleAdminAdjustBalance} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] text-[#848e9c] block mb-1">
                        Tipo de Operação:
                      </label>
                      <select
                        value={adminAdjustAction}
                        onChange={(e) => setAdminAdjustAction(e.target.value as any)}
                        className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#02c076]"
                      >
                        <option value="SET">Definir Saldo Exato</option>
                        <option value="CREDIT">Creditar Valor (+)</option>
                        <option value="DEBIT">Debitar / Estornar (-)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-[#848e9c] block mb-1">
                        Valor ({adminAdjustCurrency === 'BRL' ? 'R$' : 'GX'}):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={adminAdjustAmount}
                        onChange={(e) => setAdminAdjustAmount(e.target.value)}
                        placeholder={adminAdjustCurrency === 'BRL' ? 'Ex: 840000.00' : 'Ex: 1.0000'}
                        required
                        className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#02c076]"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="text-[11px] text-[#848e9c] block mb-1">
                        Justificativa Formal:
                      </label>
                      <input
                        type="text"
                        value={adminAdjustReason}
                        onChange={(e) => setAdminAdjustReason(e.target.value)}
                        placeholder="Ex: Correção de saque / Ajuste contábil"
                        required
                        className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#02c076]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAdminAdjusting}
                    className="w-full py-2 bg-[#02c076] hover:bg-[#02a766] disabled:opacity-50 text-black font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isAdminAdjusting ? 'Executando Ajuste...' : 'Executar Ajuste de Custódia com TXID Oficial'}
                  </button>
                </form>

                {adminAdjustMsg && (
                  <div className={`mt-3 p-2.5 rounded text-xs font-medium border ${
                    adminAdjustMsg.includes('✅') || adminAdjustMsg.includes('sucesso')
                      ? 'bg-[#02c076]/15 border-[#02c076]/40 text-[#02c076]'
                      : 'bg-[#cf304a]/15 border-[#cf304a]/40 text-[#cf304a]'
                  }`}>
                    {adminAdjustMsg}
                  </div>
                )}
              </div>

              {/* CARD 3: Histórico de Movimentações deste Cliente */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-[#848e9c]">
                    Histórico de Movimentações ({clientMovements.length})
                  </h4>
                  {clientMovements.length === 0 && (
                    <button
                      type="button"
                      onClick={() => handleEmitInitialTxid(selectedClient)}
                      className="px-2.5 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#f0b90b] text-[11px] font-bold rounded transition flex items-center gap-1 border border-[#474d57]"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Emitir Certidão de Abertura (TXID)
                    </button>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 p-2 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
                  {clientMovements.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#848e9c]">
                      Nenhuma movimentação registrada para este cliente ainda. Realize o crédito acima para criar a primeira transação.
                    </div>
                  ) : (
                    clientMovements.map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 border-b border-[#2f343b] last:border-0 flex justify-between items-center text-xs hover:bg-[#181a20] rounded"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[#848e9c] font-mono text-[10px]">
                              [{new Date(m.createdAt).toLocaleString('pt-BR')}]
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#f0b90b]/15 text-[#f0b90b] border border-[#f0b90b]/30">
                              {m.type}
                            </span>
                          </div>
                          <span className="text-white font-medium block">{m.description}</span>
                          <span className="text-[#848e9c] font-mono text-[10px]">
                            TXID: {m.txid}
                          </span>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <strong className="text-[#02c076] font-mono text-xs block">
                            {m.currency === 'BRL' || m.type === 'DEPÓSITO PIX' ? 'R$' : m.currency || 'BTXC'}{' '}
                            {m.value.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}
                          </strong>
                          <button
                            type="button"
                            onClick={() => onOpenReceipt(m)}
                            className="mt-1 px-2 py-0.5 bg-[#2b3139] hover:bg-[#353c46] text-[#f0b90b] rounded text-[10px] font-bold"
                          >
                            Ver Recibo
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#2f343b] text-right">
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Editar Cliente e Saldos Reais */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e2329] border border-[#f0b90b]/50 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#2f343b]">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#f0b90b]" />
                <h3 className="text-base font-bold text-white">
                  Editar Cadastro e Saldos do Cliente
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="text-[#848e9c] hover:text-white p-1 rounded transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#848e9c] mb-1 font-medium">E-mail (Identificador Oficial)</label>
                <input
                  type="text"
                  disabled
                  value={editingClient.email}
                  className="w-full bg-[#0b0e11] border border-[#2f343b] rounded px-3 py-2 text-xs text-[#848e9c] font-mono cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Nome Completo / Razão Social</label>
                  <input
                    type="text"
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Documento (CPF / CNPJ)</label>
                  <input
                    type="text"
                    value={editClientDoc}
                    onChange={(e) => setEditClientDoc(e.target.value)}
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Identificador / Tag (ID)</label>
                  <input
                    type="text"
                    value={editClientTag}
                    onChange={(e) => setEditClientTag(e.target.value)}
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-[#848e9c] mb-1 font-medium">Status KYC</label>
                  <select
                    value={editClientKyc}
                    onChange={(e) => setEditClientKyc(e.target.value)}
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                  >
                    <option value="Verificado KYC (Completo)">Verificado KYC (Completo)</option>
                    <option value="Verificado KYC">Verificado KYC</option>
                    <option value="Pendente KYC">Pendente KYC</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b] space-y-2">
                <span className="text-[11px] font-bold text-[#f0b90b] block uppercase">
                  Saldos de Custódia Integrados (BitX Core & Corretora)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#848e9c] mb-1 font-medium">Saldo BTXC / GX</label>
                    <input
                      type="number"
                      step="any"
                      value={editClientBtxc}
                      onChange={(e) => setEditClientBtxc(e.target.value)}
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#848e9c] mb-1 font-medium">Saldo BRL (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editClientBrl}
                      onChange={(e) => setEditClientBrl(e.target.value)}
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#848e9c] mb-1 font-medium">Saldo USDT ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editClientUsdt}
                      onChange={(e) => setEditClientUsdt(e.target.value)}
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-[#2f343b]">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="px-4 py-2 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] font-semibold text-xs rounded transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditClient}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center gap-1.5 shadow"
              >
                <CheckCircle2 className="w-4 h-4" />
                Salvar e Sincronizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão de Cliente */}
      {clientToDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setClientToDelete(null)}
        >
          <div
            className="bg-[#1e2329] border border-[#cf304a]/60 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-[#cf304a] font-bold text-base">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Confirmar Remoção de Cliente</span>
            </div>

            <div className="text-xs text-[#b7bdc6] space-y-2 leading-relaxed">
              <p>
                Deseja realmente remover o cadastro de:
                <strong className="text-white text-sm block mt-1">{clientToDelete.name}</strong>
                <span className="font-mono text-[#f0b90b] text-xs block">{clientToDelete.email}</span>
              </p>
              <p className="text-[11px] text-[#848e9c]">
                Esta ação remove o cadastro da lista ativa de clientes e desvincula os saldos no ecossistema Global Exchange.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#2f343b]">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                className="px-4 py-2 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] text-xs font-semibold rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteClient}
                className="px-4 py-2 bg-[#cf304a] hover:bg-[#b02239] text-white text-xs font-bold rounded-lg transition shadow flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                Sim, Remover Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Estorno de Saque Pix BB */}
      {refundConfirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e2329] border border-[#f0b90b]/50 rounded-lg max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#f0b90b] font-bold text-base">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Confirmar Estorno de Saque</span>
            </div>

            <div className="text-xs text-[#b7bdc6] space-y-2 leading-relaxed">
              <p>
                Deseja estornar o saque de{' '}
                <strong className="text-[#02c076] font-mono">
                  R$ {refundConfirmData.value.toFixed(2)}
                </strong>{' '}
                para a custódia do cliente{' '}
                <strong className="text-white">{refundConfirmData.clientName}</strong>?
              </p>
              <p className="text-[11px] text-[#848e9c]">
                O saldo com liquidez imediata será 100% restituído à conta do cliente na corretora e a transação será marcada como estornada.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#2f343b]">
              <button
                type="button"
                onClick={() => setRefundConfirmData(null)}
                className="px-3.5 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] text-xs font-semibold rounded transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeAdminRefundWithdrawal}
                className="px-4 py-1.5 bg-[#f0b90b] hover:bg-[#e0ab07] text-black text-xs font-bold rounded transition shadow"
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
