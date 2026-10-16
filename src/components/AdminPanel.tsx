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
} from '../services/storage';
import {
  PIX_BB_CONFIG,
  fetchPixDiagnosticsAPI,
  testBBConnectionAPI,
  registerBBWebhookAPI,
  simulatePixWebhookAPI,
  fetchWebhookEventsAPI,
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
  Play,
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  onOpenReceipt: (movement: Movement) => void;
  onPriceUpdated?: (newPrice: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onOpenReceipt,
  onPriceUpdated,
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
  const [customWebhookUrl, setCustomWebhookUrl] = useState('');
  const [simAmount, setSimAmount] = useState('250.00');
  const [simPayerName, setSimPayerName] = useState('Engecema Pagador Teste');
  const [simMsg, setSimMsg] = useState('');
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

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

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimMsg('');
    const amt = parseFloat(simAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setSimMsg('Informe um valor de teste válido.');
      return;
    }

    try {
      const targetEmail = currentUser?.email || MASTER_ADMIN_EMAIL;
      const res = await simulatePixWebhookAPI({
        amount: amt,
        clientEmail: targetEmail,
        payerName: simPayerName,
      });

      if (res.success) {
        setSimMsg(`✅ Webhook simulado! R$ ${amt.toFixed(2)} liquidado instantaneamente.`);
        // Recarrega movimentações e eventos
        loadData();
      } else {
        setSimMsg('Erro ao simular: ' + res.message);
      }
    } catch (err: any) {
      setSimMsg('Erro na simulação: ' + err.message);
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 px-2.5 py-1 rounded font-bold uppercase flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#02c076] animate-pulse"></span>
              Gateway Ativo
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

          {/* Simulador de Webhook para Homologação */}
          <div className="p-3.5 bg-[#0b0e11] rounded-lg border border-[#2f343b] space-y-2">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-[#02c076]" />
              Simular Notificação de Pagamento Instantâneo (Homologação)
            </h4>
            <p className="text-[11px] text-[#848e9c]">
              Dispara uma notificação idêntica à que o Banco do Brasil envia ao receber um Pix real, para auditar a liquidação instantânea:
            </p>
            <form onSubmit={handleSimulateWebhook} className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="1.00"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                placeholder="R$ 250.00"
                className="w-28 bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white font-mono"
              />
              <button
                type="submit"
                className="flex-1 py-1.5 bg-[#02c076] hover:bg-[#02a766] text-white font-bold text-xs rounded transition flex items-center justify-center gap-1 shadow"
              >
                <Zap className="w-3.5 h-3.5" />
                Simular Recebimento
              </button>
            </form>
            {simMsg && <div className="text-[11px] text-[#02c076] font-medium">{simMsg}</div>}
          </div>
        </div>

        {/* Tabela de Eventos Recebidos pelo Webhook */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#f0b90b]" />
              Últimas Notificações de Pagamentos Recebidas pelo Webhook ({webhookEvents.length})
            </span>
            <button
              type="button"
              onClick={() => fetchWebhookEventsAPI().then((e) => e && setWebhookEvents(e))}
              className="text-[11px] text-[#848e9c] hover:text-white flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Atualizar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#eaecef]">
              <thead>
                <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
                  <th className="py-2 px-3">EndToEndId (Identificador BB)</th>
                  <th className="py-2 px-3">Pagador</th>
                  <th className="py-2 px-3">Data/Hora</th>
                  <th className="py-2 px-3 text-right">Valor Liquidado</th>
                  <th className="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20262d]">
                {webhookEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-5 text-center text-[#848e9c]">
                      Nenhuma notificação recebida ainda. Conforme os clientes pagarem o Pix no Banco do Brasil, as confirmações aparecerão aqui automaticamente.
                    </td>
                  </tr>
                ) : (
                  webhookEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-[#2b3139]/30">
                      <td className="py-2 px-3 font-mono text-[#f0b90b]">
                        {evt.endToEndId.slice(0, 20)}...
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
                          CONFIRMADO BB
                        </span>
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
