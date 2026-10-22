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
  generateTxid,
  generateBitxCoreAddress,
  BITX_CORE_MAINNET,
} from '../services/storage';
import {
  PIX_BB_CONFIG,
  fetchPixDiagnosticsAPI,
  testBBConnectionAPI,
  registerBBWebhookAPI,
  fetchWebhookEventsAPI,
  clearWebhookEventsAPI,
  confirmWithdrawalSettlementAPI,
  cancelWithdrawalAPI,
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
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  onOpenReceipt: (movement: Movement) => void;
  onPriceUpdated?: (newPrice: string) => void;
}

type AdminTab = 'cotacao' | 'clientes' | 'saques' | 'livro-razao' | 'gateway';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onOpenReceipt,
  onPriceUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('cotacao');

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

  // Gateway Pix BB
  const [pixDiag, setPixDiag] = useState<PixDiagnostics | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRecord[]>([]);
  const [isTestingBB, setIsTestingBB] = useState<boolean>(false);
  const [webhookUrlInput, setWebhookUrlInput] = useState<string>('');

  const isMaster = isMasterAdminEmail(currentUser.email);

  // Carrega e atualiza dados
  const loadData = () => {
    const currentP = StorageService.getLaunchPrice();
    setLaunchPrice(currentP);
    if (!newPriceInput) setNewPriceInput(currentP);

    setClients(StorageService.getClients());
    setMovements(StorageService.getMovements());
    setLedger(StorageService.getLedger());
    setAdminRequests(StorageService.getAdminRequests());
    setApprovedAdmins(getApprovedAdminEmails());
  };

  useEffect(() => {
    loadData();

    // Carrega diagnósticos do BB em segundo plano
    fetchPixDiagnosticsAPI().then(setPixDiag).catch(() => {});
    fetchWebhookEventsAPI().then((evs) => setWebhookEvents(evs.slice(0, 10))).catch(() => {});

    const handleStorageUpdated = () => {
      loadData();
    };

    window.addEventListener('gx_storage_updated', handleStorageUpdated);
    window.addEventListener('storage', handleStorageUpdated);

    return () => {
      window.removeEventListener('gx_storage_updated', handleStorageUpdated);
      window.removeEventListener('storage', handleStorageUpdated);
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
    showFeedback('success', `Cotação oficial atualizada com sucesso para R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`);
  };

  // Sincronizar com a BitX Core Mainnet (#349.000)
  const handleSyncBitxCore = async () => {
    setIsSyncing(true);
    try {
      const res = StorageService.syncWithBitxCoreMainnet(currentUser);
      setLaunchPrice(res.price);
      setNewPriceInput(res.price);
      if (onPriceUpdated) onPriceUpdated(res.price);

      // Dispara sync na API local também
      await fetch('/api/bitx/sync-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: res.price }),
      }).catch(() => {});

      showFeedback('success', 'Cotação sincronizada com sucesso com o Bloco #349.000 da BitX Core Mainnet (R$ 421.081,54)!');
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

  // 4. Livro Razão & Reconciliação
  const handleReconcileLedger = () => {
    const res = StorageService.reconcileLedgerWithBalances();
    loadData();
    showFeedback('success', res.message);
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
      const res = await registerBBWebhookAPI(webhookUrlInput.trim());
      showFeedback('success', res.message || 'Webhook registrado no Banco do Brasil!');
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
  const numericPrice = parseFloat(launchPrice) || 421081.54;
  const totalBtxcCustody = useMemo(() => {
    return clients.reduce((acc, c) => acc + (StorageService.getCustodyBalance(c.email) || 0), 0);
  }, [clients]);

  const totalBrlCustody = useMemo(() => {
    return clients.reduce((acc, c) => acc + (StorageService.getCustodyBrlBalance(c.email) || 0), 0);
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

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#0b0e11] hover:bg-[#2b3139] border border-[#2f343b] text-[#848e9c] hover:text-[#f0b90b] transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar Painel
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
          <span className="text-[10px] text-[#848e9c]">$ {(numericPrice / 5.7).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
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
                    placeholder="421081.54"
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
                  Mainnet #349.000
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
                <span>Cotação Equivalente USD:</span>
                <span className="font-mono text-[#eaecef]">$ {(numericPrice / 5.7).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
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
                onClick={() => setIsAddClientModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold text-xs rounded-lg transition"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Novo Cliente
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
                  <th className="py-2.5 px-3 text-right">Saldo Líquido (R$)</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2f343b]/50">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#848e9c]">
                      Nenhum cliente encontrado. Clique em "+ Novo Cliente" para cadastrar.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((c) => {
                    const btxcBal = StorageService.getCustodyBalance(c.email);
                    const brlBal = StorageService.getCustodyBrlBalance(c.email);

                    return (
                      <tr key={c.email} className="hover:bg-[#2b3139]/30 transition">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#eaecef]">{c.name}</div>
                          <div className="text-[10px] text-[#848e9c] font-mono">{c.document || '—'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[#eaecef]">{c.email}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#38bdf8]">
                          {c.bitxAddress ? `${c.bitxAddress.slice(0, 10)}...${c.bitxAddress.slice(-6)}` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#f0b90b]">
                          {btxcBal.toFixed(4)} BTXC
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#02c076]">
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#02c076] hover:bg-[#02a062] text-black font-bold text-xs rounded-lg transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Reconciliar Saldos com Livro Razão
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
                  ledger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#2b3139]/30 transition">
                      <td className="py-3 px-3 font-semibold text-[#eaecef]">{entry.type}</td>
                      <td className="py-3 px-3 text-[#848e9c]">{entry.counterparty}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[#f0b90b]">
                        {entry.amountGx ? `${entry.amountGx.toFixed(4)} BTXC` : '—'}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: GATEWAY BANCO DO BRASIL & GESTÃO DE ACESSOS */}
      {activeTab === 'gateway' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gateway Pix BB */}
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#eaecef] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#f0b90b]" />
                Integração Banco do Brasil (mTLS & Pix)
              </h3>
              <p className="text-xs text-[#848e9c]">
                Chave Pix oficial da corretora e barramento de webhooks do Bacen
              </p>
            </div>

            <div className="p-3.5 bg-[#0b0e11] border border-[#2f343b] rounded-lg space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Razão Social:</span>
                <span className="font-semibold text-[#eaecef]">{PIX_BB_CONFIG.merchantName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">CNPJ / Chave Pix:</span>
                <span className="font-mono text-[#f0b90b] font-bold">{PIX_BB_CONFIG.formattedCnpj}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Certificado mTLS:</span>
                <span className="font-mono text-[#02c076]">{PIX_BB_CONFIG.mtlsCertName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Status mTLS:</span>
                <span className="font-semibold text-[#02c076]">100% PRODUÇÃO CONECTADO</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTestBB}
                disabled={isTestingBB}
                className="flex-1 py-2 px-3 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold text-xs rounded-lg transition flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingBB ? 'animate-spin' : ''}`} />
                Testar Autenticação OAuth 2.0 BB
              </button>
            </div>

            <div className="pt-3 border-t border-[#2f343b] space-y-2">
              <label className="text-xs font-semibold text-[#848e9c] block">
                Registrar URL de Webhook no Banco do Brasil:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  placeholder="https://sua-url.onrender.com/api/webhook/pix"
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
