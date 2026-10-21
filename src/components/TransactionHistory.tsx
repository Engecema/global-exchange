import React, { useState } from 'react';
import { Movement, User } from '../types/exchange';
import {
  KeyRound,
  Search,
  Copy,
  Check,
  FileText,
  ArrowUpDown,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Coins,
  AlertCircle,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { StorageService } from '../services/storage';

interface TransactionHistoryProps {
  currentUser?: User | null;
  movements: Movement[];
  onOpenReceipt: (movement: Movement) => void;
  onRefresh: () => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  currentUser,
  movements,
  onOpenReceipt,
  onRefresh,
}) => {
  const [searchTxid, setSearchTxid] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState('');
  const [clearMsg, setClearMsg] = useState('');
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  // Estados de Sincronização da BitX Core
  const [isSyncingBitx, setIsSyncingBitx] = useState(false);
  const [syncBitxMsg, setSyncBitxMsg] = useState('');
  const [syncBitxError, setSyncBitxError] = useState('');
  const [latestSyncedMovement, setLatestSyncedMovement] = useState<Movement | null>(null);
  const [showCustomSyncForm, setShowCustomSyncForm] = useState(false);
  const [customTxid, setCustomTxid] = useState('');
  const [customAmount, setCustomAmount] = useState('1.0');

  const handleSyncBitxTransfer = async (amountToSync: number = 1.0, hashOverride?: string) => {
    const userEmail = currentUser?.email || 'geonimatos42@gmail.com';
    setIsSyncingBitx(true);
    setSyncBitxMsg('');
    setSyncBitxError('');

    try {
      const res = await StorageService.syncBitxCoreTransfer({
        clientEmail: userEmail,
        amount: amountToSync,
        txid: hashOverride || undefined,
        note: `Transferência de ${amountToSync} BTXC sincronizada da rede BitX Core (#349.000)`,
      });

      if (res.success && res.movement) {
        setLatestSyncedMovement(res.movement);
        setSyncBitxMsg(res.message);
        onRefresh();
        if (hashOverride) setCustomTxid('');
      } else {
        setSyncBitxError(res.message || 'Não foi possível sincronizar a transferência.');
      }
    } catch (err: any) {
      setSyncBitxError(err?.message || 'Erro ao comunicar com a ponte BitX Core.');
    } finally {
      setIsSyncingBitx(false);
    }
  };

  const confirmClearMovements = () => {
    setShowClearConfirmModal(false);
    StorageService.clearAllMovements();
    onRefresh();
    setClearMsg(
      '✅ Movimentações zeradas com sucesso! O painel está 100% limpo e pronto para receber exclusivamente transações reais e líquidas após venda de moeda na corretora ou integração com o Banco do Brasil.'
    );
    setTimeout(() => setClearMsg(''), 7000);
  };

  const handleCopy = (txid: string) => {
    navigator.clipboard.writeText(txid);
    setCopiedId(txid);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    const query = searchTxid.trim().toLowerCase();
    if (!query) {
      setSearchError('Informe a chave TXID para consulta.');
      return;
    }

    const found = movements.find(
      (m) => m.txid.toLowerCase() === query || m.id.toLowerCase() === query
    );

    if (found) {
      onOpenReceipt(found);
    } else {
      setSearchError('Chave TXID não localizada neste livro de registros.');
    }
  };

  const getTypeBadge = (type: Movement['type']) => {
    switch (type) {
      case 'COMPRA':
        return 'bg-[#02c076]/15 text-[#02c076] border-[#02c076]/30';
      case 'VENDA':
        return 'bg-[#cf304a]/15 text-[#cf304a] border-[#cf304a]/30';
      case 'DEPÓSITO PIX':
      case 'DEPÓSITO BITX CORE':
        return 'bg-[#02c076]/15 text-[#02c076] border-[#02c076]/30';
      case 'SAQUE BANCÁRIO':
      case 'TRANSFERÊNCIA PIX BB':
        return 'bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30';
      case 'ESTORNO DE SAQUE':
        return 'bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/30';
      case 'ENVIO DE MOEDA':
        return 'bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/30';
      case 'AJUSTE CUSTÓDIA':
      case 'ATUALIZAÇÃO DE PREÇO':
        return 'bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30';
      default:
        return 'bg-[#848e9c]/15 text-[#848e9c] border-[#848e9c]/30';
    }
  };

  return (
    <section className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
      {/* Educational Banner: Onde Localizar a Chave de Transação */}
      <div className="bg-gradient-to-r from-[#181a20] to-[#1e242c] border border-[#3a414b] rounded-lg p-4 sm:p-5 mb-5">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#f0b90b]" />
            <h4 className="text-sm sm:text-base font-bold text-[#f0b90b]">
              Onde Localizar a Chave de Transações (TXID)?
            </h4>
          </div>
          <span className="text-[11px] text-[#848e9c] bg-[#0b0e11] px-2.5 py-1 rounded border border-[#2f343b]">
            Protocolo Auditável Engecema
          </span>
        </div>
        <p className="text-xs text-[#b7bdc6] leading-relaxed mb-3">
          Toda transação (Envio de Moeda GX, Depósito Pix, Compra/Venda ou Ajuste de Custódia) gera uma{' '}
          <strong className="text-white">Chave Criptográfica Única de Transação (TXID)</strong> no formato{' '}
          <code className="text-[#f0b90b] font-mono">0x...</code>. Você pode localizá-la de 3 formas:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4 text-xs">
          <div className="bg-[#0b0e11] p-3 rounded-lg border-l-2 border-[#f0b90b]">
            <strong className="text-white block mb-0.5">1. Recibo Imediato</strong>
            <span className="text-[#848e9c]">Exibido na tela na caixa verde logo após enviar moeda ou confirmar depósito.</span>
          </div>
          <div className="bg-[#0b0e11] p-3 rounded-lg border-l-2 border-[#02c076]">
            <strong className="text-white block mb-0.5">2. Tabela de Histórico</strong>
            <span className="text-[#848e9c]">Na coluna "Chave TXID" da tabela abaixo, com botão <strong>Copiar</strong>.</span>
          </div>
          <div className="bg-[#0b0e11] p-3 rounded-lg border-l-2 border-[#38bdf8]">
            <strong className="text-white block mb-0.5">3. Comprovante Oficial</strong>
            <span className="text-[#848e9c]">Ao clicar em <strong>"Ver Recibo"</strong> ou ao pesquisar pelo TXID abaixo.</span>
          </div>
        </div>

        <div className="bg-[#cf304a]/10 border border-[#cf304a]/40 rounded-lg p-3 text-xs mb-4 text-[#eaecef]">
          <strong className="text-[#cf304a] block font-bold mb-1">
            ⚠️ Atenção: A Chave TXID NÃO é um Endereço de Carteira BitX Core!
          </strong>
          <span className="text-[#b7bdc6] leading-relaxed">
            A chave <code className="text-[#f0b90b] font-mono">TXID</code> (iniciada com <code className="text-[#f0b90b]">0x...</code>) é exclusivamente o recibo/comprovante criptográfico de uma transação já ocorrida. <strong>Nunca insira uma chave TXID no campo "Para (Destino)" ao fazer transferências na rede BitX Core</strong>. Para transferir ou receber moedas BitX Core, o campo de destino deve ser sempre o seu <strong>Endereço de Carteira BitX Core</strong> (formato <code className="text-[#38bdf8] font-mono">bxrt1q...</code>), localizado na aba <strong>"Receber BitX"</strong> do painel de Custódia.
          </span>
        </div>

        {/* Search TXID */}
        <form onSubmit={handleSearch} className="bg-[#0b0e11] p-3 rounded-lg border border-[#2f343b]">
          <label className="text-xs text-[#f0b90b] font-bold block mb-1.5">
            🔍 Consultar Comprovante Oficial por Chave TXID:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTxid}
              onChange={(e) => setSearchTxid(e.target.value)}
              placeholder="Cole a chave TXID aqui (ex: 0x...)"
              className="flex-1 bg-[#1e2329] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center gap-1 shadow"
            >
              <Search className="w-3.5 h-3.5" />
              Consultar
            </button>
          </div>
          {searchError && (
            <div className="text-[11px] text-[#cf304a] mt-2 font-medium">
              {searchError}
            </div>
          )}
        </form>
      </div>

      {/* 🔗 Ponte de Sincronização com o Repositório BitX Core */}
      <div className="bg-[#181a20] border border-[#f0b90b]/40 rounded-lg p-4 sm:p-5 mb-5 shadow-lg">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-[#f0b90b]" />
            <h4 className="text-sm sm:text-base font-bold text-white">
              Sincronização com a Rede BitX Core (Transferências Blockchain)
            </h4>
          </div>
          <span className="text-[11px] font-bold text-[#02c076] bg-[#02c076]/10 px-2.5 py-1 rounded border border-[#02c076]/30 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Ponte Mainnet #349.000
          </span>
        </div>

        <p className="text-xs text-[#b7bdc6] leading-relaxed mb-3">
          Fez uma transferência dentro do repositório <strong className="text-white">BitX Core</strong> para o seu endereço de recebimento? 
          Clique no botão abaixo para puxar a transferência de <strong className="text-[#f0b90b]">1.0000 BTXC</strong> diretamente para a sua custódia e registrar a movimentação oficial com recibo.
        </p>

        {syncBitxMsg && (
          <div className="mb-3 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#02c076]" />
              <span>{syncBitxMsg}</span>
            </div>
            {latestSyncedMovement && (
              <button
                type="button"
                onClick={() => onOpenReceipt(latestSyncedMovement)}
                className="px-2.5 py-1 bg-[#02c076] hover:bg-[#02a766] text-black font-bold text-xs rounded transition flex items-center gap-1 shrink-0"
              >
                <FileText className="w-3.5 h-3.5" />
                Ver Recibo Emitido
              </button>
            )}
          </div>
        )}

        {syncBitxError && (
          <div className="mb-3 p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded-lg font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{syncBitxError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleSyncBitxTransfer(1.0)}
            disabled={isSyncingBitx}
            className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBitx ? 'animate-spin' : ''}`} />
            {isSyncingBitx ? 'Sincronizando com a BitX Core...' : '⚡ Sincronizar Transferência de 1 BTXC da BitX Core'}
          </button>

          <button
            type="button"
            onClick={() => setShowCustomSyncForm(!showCustomSyncForm)}
            className="px-3 py-2 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] border border-[#474d57] font-semibold text-xs rounded-lg transition flex items-center gap-1"
          >
            <Zap className="w-3.5 h-3.5 text-[#38bdf8]" />
            {showCustomSyncForm ? 'Ocultar Sincronização por Hash' : 'Informar Hash / TXID da BitX Core'}
          </button>
        </div>

        {showCustomSyncForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const num = parseFloat(customAmount.replace(',', '.')) || 1.0;
              handleSyncBitxTransfer(num, customTxid.trim());
            }}
            className="mt-3 pt-3 border-t border-[#2f343b] space-y-2.5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-[11px] text-[#848e9c] block mb-1 font-medium">
                  ID / Hash da Transação gerada na BitX Core (ex: tx_... ou 0x...):
                </label>
                <input
                  type="text"
                  value={customTxid}
                  onChange={(e) => setCustomTxid(e.target.value)}
                  placeholder="Ex: tx_5e197e2dfa4891c2 ou 0x9891c2bf..."
                  className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1 font-medium">
                  Quantidade (BTXC):
                </label>
                <input
                  type="text"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="1.0"
                  className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isSyncingBitx}
              className="px-4 py-1.5 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-xs rounded transition flex items-center gap-1 shadow"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isSyncingBitx ? 'Processando...' : 'Confirmar e Importar Transferência'}
            </button>
          </form>
        )}
      </div>

      {/* Header and refresh */}
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] mb-4 gap-2">
        <div>
          <h3 className="text-base font-bold text-[#f0b90b]">
            Histórico Geral de Transações & Chaves TXID
          </h3>
          <span className="text-xs text-[#848e9c]">
            {movements.length} registro(s) auditável(is) nesta conta · Modo Real & Líquido
          </span>
        </div>
        <div className="flex items-center gap-2">
          {movements.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirmModal(true)}
              className="text-xs px-3 py-1.5 bg-[#cf304a]/15 hover:bg-[#cf304a]/25 text-[#cf304a] border border-[#cf304a]/30 rounded flex items-center gap-1.5 transition font-semibold"
              title="Zerar todas as movimentações de teste para receber apenas transações reais"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Zerar Movimentações
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] border border-[#474d57] rounded flex items-center gap-1.5 transition font-semibold"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Atualizar Lista
          </button>
        </div>
      </div>

      {clearMsg && (
        <div className="mb-4 p-3 rounded text-xs bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{clearMsg}</span>
        </div>
      )}

      {/* Table (Requirement 2: Starts completely clean and displays real client transactions) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-[#eaecef]">
          <thead>
            <tr className="border-b border-[#2f343b] text-[#848e9c] font-semibold">
              <th className="py-2.5 px-3">Data / Hora</th>
              <th className="py-2.5 px-3">Tipo</th>
              <th className="py-2.5 px-3">Descrição da Operação</th>
              <th className="py-2.5 px-3">Valor</th>
              <th className="py-2.5 px-3">Chave TXID</th>
              <th className="py-2.5 px-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#20262d]">
            {movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[#848e9c]">
                  <div className="max-w-md mx-auto space-y-2">
                    <span className="inline-flex items-center justify-center p-2.5 rounded-full bg-[#02c076]/10 text-[#02c076] mb-1 border border-[#02c076]/20">
                      <ShieldCheck className="w-6 h-6" />
                    </span>
                    <p className="text-sm font-bold text-[#eaecef]">
                      Painel de Movimentações Zerado (Modo Real & Líquido)
                    </p>
                    <p className="text-xs text-[#848e9c] leading-relaxed">
                      Nenhuma movimentação pendente ou simulada nesta conta. Assim que você realizar ordens de venda da moeda <strong className="text-white">BTXC / GX</strong> na corretora para gerar saldo com liquidez em Reais (R$), ou conectar a aplicação no portal <strong className="text-white">Developers Banco do Brasil</strong>, todas as transações 100% reais e líquidas serão registradas aqui em tempo real com certificação TXID auditável.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id} className="hover:bg-[#2b3139]/30 transition">
                  <td className="py-3 px-3 text-[#848e9c] whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getTypeBadge(
                          m.type
                        )}`}
                      >
                        {m.type}
                      </span>
                      {(m.type === 'SAQUE BANCÁRIO' || m.type === 'TRANSFERÊNCIA PIX BB') && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            m.status === 'ESTORNADO' || m.bankStatus === 'ESTORNADO_CUSTODIA'
                              ? 'bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30'
                              : m.bankStatus === 'LIQUIDADO_BANCO_DO_BRASIL' || m.status === 'CONFIRMADO'
                              ? 'bg-[#02c076]/10 text-[#02c076] border-[#02c076]/30'
                              : 'bg-[#f0b90b]/10 text-[#f0b90b] border-[#f0b90b]/30'
                          }`}
                        >
                          {m.status === 'ESTORNADO' || m.bankStatus === 'ESTORNADO_CUSTODIA'
                            ? 'ESTORNADO'
                            : m.bankStatus === 'LIQUIDADO_BANCO_DO_BRASIL' || m.status === 'CONFIRMADO'
                            ? 'LIQUIDADO BB'
                            : 'ALÇADA BB PJ'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 max-w-xs truncate" title={m.description}>
                    {m.description}
                  </td>
                  <td className="py-3 px-3 font-mono font-semibold whitespace-nowrap">
                    {m.currency === 'BRL' || m.type === 'DEPÓSITO PIX' || m.type === 'SAQUE BANCÁRIO' || m.type === 'TRANSFERÊNCIA PIX BB' ? 'R$' : 'GX'}{' '}
                    {m.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#f0b90b] bg-[#181a20] px-2 py-0.5 rounded border border-[#3a414b]">
                        {m.txid.slice(0, 8)}...{m.txid.slice(-6)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(m.txid)}
                        className="p-1 bg-[#2b3139] hover:bg-[#353c46] text-[#b7bdc6] hover:text-white rounded border border-[#474d57]"
                        title="Copiar Chave TXID"
                      >
                        {copiedId === m.txid ? (
                          <Check className="w-3 h-3 text-[#02c076]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenReceipt(m)}
                      className="px-2.5 py-1 bg-[#2b3139] hover:bg-[#f0b90b] hover:text-black text-[#eaecef] rounded font-semibold text-[11px] transition flex items-center gap-1 mx-auto"
                    >
                      <FileText className="w-3 h-3" />
                      Ver Recibo
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
