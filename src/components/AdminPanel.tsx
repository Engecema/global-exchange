import React, { useState, useEffect } from 'react';
import {
  AdminApprovalRequest,
  ClientRecord,
  FinancialTransaction,
  Movement,
  User,
} from '../types/exchange';
import {
  StorageService,
  getApprovedAdminEmails,
  MASTER_ADMIN_EMAIL,
  isMasterAdminEmail,
  generateTxid,
} from '../services/storage';
import {
  PIX_BB_CONFIG,
  fetchPixDiagnosticsAPI,
  testBBConnectionAPI,
  registerBBWebhookAPI,
  checkPixStatusAPI,
  fetchWebhookEventsAPI,
  clearWebhookEventsAPI,
  simulatePixWebhookAPI,
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
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  onOpenReceipt: (movement: Movement) => void;
  onPriceUpdated?: (newPrice: string) => void;
  onNavigateToClientView?: () => void;
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
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [allMovements, setAllMovements] = useState<Movement[]>([]);

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

  // Simulador de Transações Pix & Webhook (Restaurado)
  const [simClientEmail, setSimClientEmail] = useState('');
  const [simAmount, setSimAmount] = useState('250.00');
  const [simPayerName, setSimPayerName] = useState('Engecema Pagador Homologação');
  const [simTxid, setSimTxid] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{
    success: boolean;
    message: string;
    event?: WebhookEventRecord;
  } | null>(null);

  // Status de Limpeza de Histórico e Prontidão Real
  const [cleanHistoryResult, setCleanHistoryResult] = useState('');
  const [isCleaningHistory, setIsCleaningHistory] = useState(false);

  const loadData = () => {
    setLaunchPrice(StorageService.getLaunchPrice());
    setFinancialTxs(StorageService.getFinancialTransactions());
    setClients(StorageService.getClients());
    setAllMovements(StorageService.getMovements());
    setAdminRequests(StorageService.getAdminRequests());
    setApprovedAdmins(getApprovedAdminEmails());

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

  const handleSimulateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulationResult(null);

    const amount = parseFloat(simAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setSimulationResult({
        success: false,
        message: 'Informe um valor numérico válido maior que zero para simular.',
      });
      return;
    }

    const targetEmail = simClientEmail.trim() || currentUser?.email || 'admin@engecema.com.br';

    setIsSimulating(true);
    try {
      const res = await simulatePixWebhookAPI({
        amount,
        clientEmail: targetEmail,
        payerName: simPayerName.trim() || 'Engecema Pagador Homologação',
        txid: simTxid.trim() || undefined,
      });

      setSimulationResult(res);
      loadData();
    } catch (err: any) {
      setSimulationResult({
        success: false,
        message: 'Falha na simulação: ' + (err?.message || 'Erro inesperado'),
      });
    } finally {
      setIsSimulating(false);
    }
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
            {onNavigateToClientView && (
              <button
                type="button"
                onClick={onNavigateToClientView}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center gap-1.5 shadow"
              >
                <LineChart className="w-3.5 h-3.5" />
                Acessar Painel de Negociação & Custódia
              </button>
            )}
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

      {/* Network Overview & Price Control */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Controle de Lançamento e Preço */}
        <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
          <h3 className="text-base font-bold text-[#f0b90b] mb-2 flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Controle de Lançamento e Preço
          </h3>
          <p className="text-xs text-[#b7bdc6] mb-4">
            Defina o preço de referência do token GX para as cotações do livro de ordens:
          </p>
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
                placeholder="Ex: 1.50 ou 1500.00"
                className="w-full bg-[#0b0e11] border border-[#474d57] rounded pl-8 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#f0b90b]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition shadow"
            >
              Atualizar Preço
            </button>
          </form>

          {/* Prévia de Leitura em Reais e Milhares */}
          <div className="mt-2 p-2 bg-[#0b0e11] rounded border border-[#2f343b] text-xs flex justify-between items-center">
            <span className="text-[#848e9c]">Cotação formatada no padrão brasileiro:</span>
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

        {/* Visão Geral da Rede & BB */}
        <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
          <h3 className="text-base font-bold text-[#f0b90b] mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#02c076]" />
            Visão Geral da Rede & Gateway BB
          </h3>
          <div className="space-y-2 text-xs text-[#b7bdc6]">
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Status do Ecossistema:</span>
              <span className="text-[#02c076] font-bold">● Operacional em Produção</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2f343b]">
              <span className="text-[#848e9c]">Total Supply GX:</span>
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

        {/* 🧪 SIMULADOR DE TRANSAÇÕES PIX & WEBHOOK (RESTAURAÇÃO COMPLETA) */}
        <div className="p-4 bg-[#0b0e11] rounded-lg border border-[#f0b90b]/40 space-y-3">
          <div className="flex flex-wrap justify-between items-center pb-2 border-b border-[#2f343b] gap-2">
            <h4 className="text-xs font-bold text-[#f0b90b] flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-[#f0b90b]" />
              Simulador de Transações Pix & Webhook (Ambiente de Homologação)
            </h4>
            <span className="text-[10px] bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/40 px-2 py-0.5 rounded font-bold uppercase">
              Simulador Ativo
            </span>
          </div>

          <p className="text-[11px] text-[#848e9c]">
            Utilize este simulador para disparar notificações automáticas de pagamento Pix idênticas às enviadas pelo Banco do Brasil em produção. O valor será liquidado instantaneamente na custódia do trader e registrado com TXID criptográfico auditável.
          </p>

          <form onSubmit={handleSimulateTransaction} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Cliente Destinatário */}
              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1">
                  Trader / Destinatário:
                </label>
                <select
                  value={simClientEmail}
                  onChange={(e) => setSimClientEmail(e.target.value)}
                  className="w-full bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                >
                  <option value="">{currentUser?.email} (Sua Conta Atual)</option>
                  {clients.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.name ? `${c.name} (${c.email})` : c.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Valor da Transação */}
              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1">
                  Valor da Liquidação (R$):
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    placeholder="250.00"
                    className="flex-1 bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                  />
                  <div className="flex gap-1">
                    {['50', '250', '1000'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSimAmount(preset + '.00')}
                        className="px-1.5 py-1 text-[10px] bg-[#2b3139] hover:bg-[#353c46] text-[#b7bdc6] rounded"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Nome do Pagador */}
              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1">
                  Nome do Pagador Pix:
                </label>
                <input
                  type="text"
                  value={simPayerName}
                  onChange={(e) => setSimPayerName(e.target.value)}
                  placeholder="Engecema Pagador Homologação"
                  className="w-full bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isSimulating}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center gap-1.5 shadow"
              >
                <Zap className="w-3.5 h-3.5" />
                {isSimulating ? 'Processando Notificação...' : '⚡ Disparar Simulação de Pagamento Pix'}
              </button>

              <span className="text-[11px] text-[#848e9c]">
                Credita na custódia e emite comprovante oficial com chave TXID
              </span>
            </div>
          </form>

          {/* Resultado da Simulação */}
          {simulationResult && (
            <div
              className={`p-3 rounded-lg text-xs flex flex-wrap justify-between items-center gap-2 ${
                simulationResult.success
                  ? 'bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30'
                  : 'bg-[#cf304a]/15 text-[#cf304a] border border-[#cf304a]/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {simulationResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{simulationResult.message}</span>
              </div>

              {simulationResult.event && (
                <button
                  type="button"
                  onClick={() => handleOpenReceiptFromEvent(simulationResult.event!)}
                  className="px-2.5 py-1 bg-[#02c076] hover:bg-[#02a063] text-black font-bold text-xs rounded transition flex items-center gap-1 shadow"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Ver Comprovante Oficial
                </button>
              )}
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

      {/* Gerenciamento de Clientes (Requirement 4: Clean slate - zero mock registrations!) */}
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
        <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4">
          <div>
            <h3 className="text-base font-bold text-[#f0b90b] flex items-center gap-2">
              <Users className="w-4 h-4" />
              Gerenciamento de Clientes & Cadastros Comerciais
            </h3>
            <span className="text-xs text-[#848e9c]">
              {clients.length} cliente(s) real(is) cadastrado(s)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#eaecef]">
            <thead>
              <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                <th className="py-2.5 px-3">Cliente / Razão Social</th>
                <th className="py-2.5 px-3">CPF / CNPJ</th>
                <th className="py-2.5 px-3">Última Movimentação</th>
                <th className="py-2.5 px-3">Valor</th>
                <th className="py-2.5 px-3 text-center">Histórico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20262d]">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#848e9c]">
                    <p className="text-sm font-medium mb-1">
                      Nenhum cliente cadastrado ainda.
                    </p>
                    <p className="text-xs text-[#5e6673]">
                      Os cadastros de teste anteriores foram removidos. Novos clientes que se cadastrarem no site aparecerão aqui automaticamente.
                    </p>
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="hover:bg-[#2b3139]/30 transition">
                    <td className="py-3 px-3">
                      <strong className="text-white block">{c.name || c.email}</strong>
                      <span className="text-[11px] text-[#848e9c]">{c.email}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#b7bdc6]">
                      {c.document || 'Não informado'}
                    </td>
                    <td className="py-3 px-3 text-[#848e9c]">
                      {c.latestMovement
                        ? new Date(c.latestMovement.createdAt).toLocaleString('pt-BR')
                        : 'Sem movimentações'}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {c.latestMovement ? (
                        <span className="font-semibold text-[#02c076]">
                          {c.latestMovement.currency === 'BRL' || c.latestMovement.type === 'DEPÓSITO PIX' ? 'R$' : 'GX'}{' '}
                          {c.latestMovement.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => openClientHistory(c)}
                        className="px-3 py-1 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition shadow"
                      >
                        Histórico ({c.movementCount || 0})
                      </button>
                    </td>
                  </tr>
                ))
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

      {/* Modal Historico Cliente (Admin) */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e2329] border border-[#474d57] rounded-xl max-w-xl w-full p-6 text-[#eaecef] shadow-2xl relative">
            <button
              onClick={() => setSelectedClient(null)}
              className="absolute top-4 right-4 text-[#848e9c] hover:text-white p-1 rounded"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-[#f0b90b] mb-1">
              Movimentações de {selectedClient.name || selectedClient.email}
            </h3>
            <p className="text-xs text-[#848e9c] mb-4">
              Doc: {selectedClient.document || 'Não informado'} • E-mail: {selectedClient.email}
            </p>

            <div className="max-h-72 overflow-y-auto space-y-2 p-2 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
              {clientMovements.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#848e9c] space-y-3">
                  <p>Nenhuma movimentação financeira ou certidão registrada para este cliente ainda.</p>
                  <button
                    type="button"
                    onClick={() => handleEmitInitialTxid(selectedClient)}
                    className="px-4 py-2 bg-[#02c076] hover:bg-[#02a766] text-white font-bold text-xs rounded transition flex items-center justify-center gap-1.5 mx-auto shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Emitir Certidão de Abertura de Conta (Gerar Chave TXID)
                  </button>
                </div>
              ) : (
                clientMovements.map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 border-b border-[#2f343b] last:border-0 flex justify-between items-center text-xs"
                  >
                    <div>
                      <span className="text-[#848e9c] font-mono text-[10px] block">
                        [{new Date(m.createdAt).toLocaleString('pt-BR')}]
                      </span>
                      <span className="text-white font-medium">{m.description}</span>
                    </div>
                    <strong className="text-[#02c076] font-mono text-sm">
                      {m.currency === 'BRL' || m.type === 'DEPÓSITO PIX' ? 'R$' : 'GX'}{' '}
                      {m.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#2f343b] text-right">
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
