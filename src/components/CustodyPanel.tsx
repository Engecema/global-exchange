import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Movement, User } from '../types/exchange';
import { StorageService, generateBitxCoreAddress } from '../services/storage';
import {
  generatePixCopiaECola,
  PIX_BB_CONFIG,
  createPixChargeAPI,
  checkPixStatusAPI,
  executeInstantPixWithdrawalAPI,
} from '../services/pixBB';
import { ReceiptModal } from './ReceiptModal';
import {
  Send,
  QrCode as QrCodeIcon,
  Copy,
  CheckCircle2,
  Edit3,
  ShieldCheck,
  Building2,
  ExternalLink,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  AlertCircle,
  HelpCircle,
  Zap,
  Check,
  Banknote,
} from 'lucide-react';

interface CustodyPanelProps {
  currentUser: User;
  custodyBalance: number;
  onBalanceChange: (newBalance: number, movement: Movement) => void;
}

export const CustodyPanel: React.FC<CustodyPanelProps> = ({
  currentUser,
  custodyBalance,
  onBalanceChange,
}) => {
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'pix'>('send');
  const [showEditSaldo, setShowEditSaldo] = useState(false);

  // BitX Core Wallet & Deposit Fields
  const [bitxCopied, setBitxCopied] = useState(false);
  const [externalTxHash, setExternalTxHash] = useState('');
  const [externalTxAmount, setExternalTxAmount] = useState('1.0000');
  const [bitxSubmitMsg, setBitxSubmitMsg] = useState('');
  const [isSubmittingBitx, setIsSubmittingBitx] = useState(false);
  const qrBitxCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const clientBitxAddress = currentUser.bitxAddress || generateBitxCoreAddress(currentUser.email);

  // Edit saldo fields
  const [editSaldoInput, setEditSaldoInput] = useState('');
  const [editSaldoReason, setEditSaldoReason] = useState('');

  // Enviar moeda fields
  const [recipient, setRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendMemo, setSendMemo] = useState('');
  const [sendSuccessReceipt, setSendSuccessReceipt] = useState<{
    desc: string;
    txid: string;
  } | null>(null);

  // Pix BB fields
  const [pixAmount, setPixAmount] = useState('500.00');
  const [pixCopiaECola, setPixCopiaECola] = useState('');
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pixStatusMsg, setPixStatusMsg] = useState('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Error / status
  const [errorMsg, setErrorMsg] = useState('');

  // Handle Edit Saldo (Manual adjustment with TXID)
  const handleSaveSaldo = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const newBal = parseFloat(editSaldoInput);
    if (!Number.isFinite(newBal) || newBal < 0) {
      setErrorMsg('Informe um valor numérico válido maior ou igual a zero.');
      return;
    }

    const oldBal = custodyBalance;
    const diff = newBal - oldBal;

    StorageService.setCustodyBalance(currentUser.email, newBal);

    const movement = StorageService.addMovement({
      clientId: currentUser.id,
      clientEmail: currentUser.email,
      clientName: currentUser.name || currentUser.email,
      type: 'AJUSTE CUSTÓDIA',
      description: `Ajuste manual de custódia: saldo de ${oldBal.toFixed(2)} GX para ${newBal.toFixed(2)} GX${
        editSaldoReason.trim() ? ` (${editSaldoReason.trim()})` : ''
      }`,
      value: Math.abs(diff),
      currency: 'GX',
    });

    setShowEditSaldo(false);
    setEditSaldoInput('');
    setEditSaldoReason('');
    onBalanceChange(newBal, movement);
  };

  // Handle Send Coins
  const handleSendCoins = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSendSuccessReceipt(null);

    const target = recipient.trim();
    const amount = parseFloat(sendAmount);

    if (!target) {
      setErrorMsg('Informe o destinatário (endereço de carteira ou e-mail do trader).');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Informe uma quantidade válida maior que zero.');
      return;
    }
    if (amount > custodyBalance) {
      setErrorMsg(
        `Saldo insuficiente em custódia para envio. Saldo atual: ${custodyBalance.toFixed(2)} GX.`
      );
      return;
    }

    const newBal = custodyBalance - amount;
    StorageService.setCustodyBalance(currentUser.email, newBal);

    const movement = StorageService.addMovement({
      clientId: currentUser.id,
      clientEmail: currentUser.email,
      clientName: currentUser.name || currentUser.email,
      type: 'ENVIO DE MOEDA',
      description: `Transferência de ${amount.toFixed(4)} GX para ${target}${
        sendMemo.trim() ? ` (${sendMemo.trim()})` : ''
      }`,
      value: amount,
      currency: 'GX',
      recipient: target,
      note: sendMemo.trim(),
    });

    setSendSuccessReceipt({
      desc: `Transferência de ${amount.toFixed(4)} GX realizada com sucesso para ${target}`,
      txid: movement.txid,
    });

    setSendAmount('');
    setRecipient('');
    setSendMemo('');
    onBalanceChange(newBal, movement);
  };

  const [currentTxid, setCurrentTxid] = useState<string>('');
  const [isListeningWebhook, setIsListeningWebhook] = useState<boolean>(false);
  const webhookPollRef = useRef<NodeJS.Timeout | null>(null);

  // Limpa o timer de webhook se desmontar ou mudar de aba
  useEffect(() => {
    return () => {
      if (webhookPollRef.current) {
        clearInterval(webhookPollRef.current);
        webhookPollRef.current = null;
      }
    };
  }, []);

  // Generate Pix QR Code and EMV Copia e Cola with Webhook Automation
  const handleGeneratePix = async () => {
    setErrorMsg('');
    setPixStatusMsg('');
    if (webhookPollRef.current) {
      clearInterval(webhookPollRef.current);
      webhookPollRef.current = null;
    }

    const amount = parseFloat(pixAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Informe um valor de depósito maior que zero.');
      return;
    }

    setIsGeneratingPix(true);
    try {
      // Cria a cobrança no backend/API com TXID rastreável
      const chargeRes = await createPixChargeAPI({
        amount,
        clientEmail: currentUser.email,
        clientName: currentUser.name || currentUser.email,
        document: currentUser.document,
      });

      const txid = chargeRes.txid;
      setCurrentTxid(txid);

      const payload = chargeRes.pixCopiaECola || generatePixCopiaECola(amount, txid);
      setPixCopiaECola(payload);

      if (qrCanvasRef.current) {
        await QRCode.toCanvas(qrCanvasRef.current, payload, {
          width: 170,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
      }

      setPixStatusMsg('QR Code gerado! Aguardando notificação automática do Banco do Brasil via Webhook...');
      setIsListeningWebhook(true);

      // Inicia escuta contínua de confirmação via Webhook da API
      webhookPollRef.current = setInterval(async () => {
        const statusData = await checkPixStatusAPI(txid);
        if (statusData && statusData.status === 'CONCLUIDA') {
          if (webhookPollRef.current) {
            clearInterval(webhookPollRef.current);
            webhookPollRef.current = null;
          }
          setIsListeningWebhook(false);

          const paidAmt = statusData.paidAmount || amount;
          const newBal = custodyBalance + paidAmt;
          StorageService.setCustodyBalance(currentUser.email, newBal);

          const movement = StorageService.addMovement({
            clientId: currentUser.id,
            clientEmail: currentUser.email,
            clientName: currentUser.name || currentUser.email,
            type: 'DEPÓSITO PIX',
            description: `Depósito via Webhook Banco do Brasil (EndToEnd: ${(statusData.endToEndId || txid).slice(0, 16)}...)`,
            value: paidAmt,
            currency: 'BRL',
          });

          setPixStatusMsg(`⚡ Pagamento de R$ ${paidAmt.toFixed(2)} CONFIRMADO AUTOMATICAMENTE pelo Webhook do Banco do Brasil!`);
          onBalanceChange(newBal, movement);
        }
      }, 2500);
    } catch (err) {
      console.error('Pix generation error:', err);
      setErrorMsg('Erro ao gerar payload Pix.');
    } finally {
      setIsGeneratingPix(false);
    }
  };

  // Re-render canvas if payload changed and tab is pix
  useEffect(() => {
    if (pixCopiaECola && qrCanvasRef.current && activeTab === 'pix') {
      QRCode.toCanvas(qrCanvasRef.current, pixCopiaECola, {
        width: 170,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    }
  }, [pixCopiaECola, activeTab]);

  // Re-render QR BitX Core Wallet Address
  useEffect(() => {
    if (activeTab === 'receive' && qrBitxCanvasRef.current && clientBitxAddress) {
      QRCode.toCanvas(qrBitxCanvasRef.current, clientBitxAddress, {
        width: 170,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    }
  }, [activeTab, clientBitxAddress]);

  // Handle Registrar Depósito BitX Core Externo (Ex: vindo da carteira tx_...)
  const handleRegisterExternalBitxTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setBitxSubmitMsg('');
    setErrorMsg('');

    const hash = externalTxHash.trim();
    const amount = parseFloat(externalTxAmount.replace(',', '.'));

    if (!hash) {
      setErrorMsg('Informe o ID/Hash da transação BitX Core (ex: tx_5e197e2d).');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Informe uma quantidade de BitX Core válida maior que zero.');
      return;
    }

    setIsSubmittingBitx(true);
    setTimeout(() => {
      const res = StorageService.creditBitxDeposit({
        clientEmail: currentUser.email,
        amount,
        externalTxid: hash,
        note: `Depósito via rede BitX Core para carteira ${clientBitxAddress}`,
      });

      setIsSubmittingBitx(false);

      if (!res.success || !res.movement || res.newBalance === undefined) {
        setErrorMsg(res.error || 'Erro ao processar depósito BitX Core.');
        return;
      }

      setBitxSubmitMsg(
        `✅ Depósito de ${amount.toFixed(4)} BTXC confirmado com sucesso! Saldo creditado na sua custódia e recibo oficial emitido.`
      );
      setExternalTxHash('');
      onBalanceChange(res.newBalance, res.movement);
    }, 350);
  };

  // Confirm Deposit (Manual redundancy fallback)
  const handleConfirmDeposit = () => {
    if (webhookPollRef.current) {
      clearInterval(webhookPollRef.current);
      webhookPollRef.current = null;
    }
    setIsListeningWebhook(false);

    const amount = parseFloat(pixAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Informe um valor de depósito válido.');
      return;
    }

    const newBal = custodyBalance + amount;
    StorageService.setCustodyBalance(currentUser.email, newBal);

    const movement = StorageService.addMovement({
      clientId: currentUser.id,
      clientEmail: currentUser.email,
      clientName: currentUser.name || currentUser.email,
      type: 'DEPÓSITO PIX',
      description: `Depósito via Pix Banco do Brasil (Engecema PJ - R$ ${amount.toFixed(2)})`,
      value: amount,
      currency: 'BRL',
    });

    setPixStatusMsg(`✅ Depósito de R$ ${amount.toFixed(2)} liquidado com sucesso na custódia!`);
    onBalanceChange(newBal, movement);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
      <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4">
        <h3 className="text-base font-bold text-[#f0b90b]">
          Painel de Custódia
        </h3>
        <button
          type="button"
          onClick={() => setShowEditSaldo(!showEditSaldo)}
          className="text-xs px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#f0b90b] border border-[#f0b90b]/60 rounded flex items-center gap-1.5 transition"
        >
          <Edit3 className="w-3.5 h-3.5" />
          {showEditSaldo ? 'Fechar Edição' : 'Editar Saldo'}
        </button>
      </div>

      {/* Custody Balance Display (Requirement 1: starts at 0.00 and strictly tracks client transfers) */}
      <div className="bg-[#2b3139] p-4 rounded-lg mb-4 flex flex-wrap justify-between items-center gap-2 border border-[#3a414b]">
        <div>
          <span className="text-xs text-[#848e9c] block">
            Saldo Disponível em Custódia
          </span>
          <strong className="text-2xl font-mono text-[#02c076] tracking-tight">
            {custodyBalance.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })}{' '}
            GX
          </strong>
        </div>
        <div className="text-right">
          <span className="bg-[#f0b90b]/15 text-[#f0b90b] text-[11px] px-2.5 py-1 rounded font-bold border border-[#f0b90b]/30 inline-block uppercase">
            CUSTÓDIA ENGECEMA
          </span>
          <span className="block text-[10px] text-[#848e9c] mt-1">
            CNPJ: {PIX_BB_CONFIG.formattedCnpj}
          </span>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded font-medium">
          {errorMsg}
        </div>
      )}

      {/* Form: Collapsible Edit Saldo */}
      {showEditSaldo && (
        <div className="mb-4 p-4 bg-[#181a20] border border-[#f0b90b] rounded-lg">
          <h4 className="text-xs font-bold text-[#f0b90b] mb-1 flex items-center gap-1">
            <Edit3 className="w-3.5 h-3.5" />
            Editar Saldo de Custódia (Ajuste Direto com TXID)
          </h4>
          <p className="text-[11px] text-[#848e9c] mb-3">
            Atualize o montante de GX mantido sob custódia para este cliente. Esta operação gera uma chave criptográfica auditável (TXID).
          </p>
          <form onSubmit={handleSaveSaldo} className="space-y-3">
            <div>
              <label className="block text-xs text-[#b7bdc6] mb-1">
                Novo Saldo Total em GX
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={editSaldoInput}
                onChange={(e) => setEditSaldoInput(e.target.value)}
                placeholder="Ex: 2500.00"
                required
                className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#f0b90b]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#b7bdc6] mb-1">
                Motivo / Justificativa
              </label>
              <input
                type="text"
                value={editSaldoReason}
                onChange={(e) => setEditSaldoReason(e.target.value)}
                placeholder="Ex: Aporte inicial de capital, rebalanceamento comercial"
                className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2 bg-[#02c076] hover:bg-[#02a766] text-white font-bold text-xs rounded transition"
              >
                Confirmar Edição
              </button>
              <button
                type="button"
                onClick={() => setShowEditSaldo(false)}
                className="px-4 py-2 bg-[#3a3f47] hover:bg-[#474d57] text-white text-xs rounded transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs: Enviar Moeda / Receber BitX Core / Depósito Pix BB */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setActiveTab('send');
            setErrorMsg('');
          }}
          className={`py-2 px-2 sm:px-3 rounded font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            activeTab === 'send'
              ? 'bg-[#f0b90b] text-black shadow'
              : 'bg-[#2b3139] text-[#b7bdc6] hover:text-white'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Enviar</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('receive');
            setErrorMsg('');
          }}
          className={`py-2 px-2 sm:px-3 rounded font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            activeTab === 'receive'
              ? 'bg-[#f0b90b] text-black shadow'
              : 'bg-[#2b3139] text-[#b7bdc6] hover:text-white'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Receber BitX</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('pix');
            setErrorMsg('');
          }}
          className={`py-2 px-2 sm:px-3 rounded font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            activeTab === 'pix'
              ? 'bg-[#f0b90b] text-black shadow'
              : 'bg-[#2b3139] text-[#b7bdc6] hover:text-white'
          }`}
        >
          <QrCodeIcon className="w-3.5 h-3.5" />
          <span>Pix BB</span>
        </button>
      </div>

      {/* Tab: Receber Moeda (BitX Core - BTXC) */}
      {activeTab === 'receive' && (
        <div className="space-y-4">
          {/* Alerta didático e explicativo importante */}
          <div className="p-3.5 bg-[#f0b90b]/10 border border-[#f0b90b]/30 rounded-lg text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#f0b90b]">
              <HelpCircle className="w-4 h-4 shrink-0 text-[#f0b90b]" />
              <span>Como Receber BitX Core (BTXC) na sua Carteira:</span>
            </div>
            <p className="text-[#eaecef] text-[11px] leading-relaxed">
              Para receber BitX Core (BTXC) de uma carteira externa, utilize o seu <strong className="text-white">Endereço de Carteira BitX Core</strong> abaixo. 
              <br />
              <strong className="text-[#cf304a]">⚠️ Atenção:</strong> Não utilize uma chave <code className="text-[#f0b90b]">TXID</code> no campo de destinatário. A chave TXID é apenas o comprovante de uma transação passada. O campo de destino na BitX Core precisa ser o seu <strong className="text-white">Endereço da Carteira BitX Core (iniciado com bxrt1q...)</strong>.
            </p>
          </div>

          {/* Endereço BitX Core do Cliente e QR Code */}
          <div className="p-4 bg-[#0b0e11] rounded-lg border border-[#3a414b] flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-white p-2 rounded-lg shadow shrink-0">
              <canvas ref={qrBitxCanvasRef} className="rounded" />
            </div>

            <div className="flex-1 w-full space-y-2">
              <span className="text-xs text-[#848e9c] block font-medium">
                Seu Endereço Oficial BitX Core (Destino):
              </span>
              <div className="p-2.5 bg-[#1e2329] border border-[#474d57] rounded text-xs font-mono text-[#f0b90b] break-all select-all">
                {clientBitxAddress}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(clientBitxAddress);
                    setBitxCopied(true);
                    setTimeout(() => setBitxCopied(false), 2000);
                  }}
                  className="px-3 py-1.5 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition flex items-center gap-1 shadow"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {bitxCopied ? 'Endereço Copiado!' : 'Copiar Endereço BitX Core'}
                </button>
                <span className="text-[10px] text-[#02c076] font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Rede BitX Core Nativa
                </span>
              </div>
            </div>
          </div>

          {/* Registro e Liquidação de Depósito Realizado no Painel BitX Core */}
          <div className="p-4 bg-[#181a20] rounded-lg border border-[#2f343b] space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-[#38bdf8]" />
              Já enviou pelo painel da BitX Core? Registre o Hash da Transação:
            </h4>
            <p className="text-[11px] text-[#848e9c]">
              Se você realizou um envio no painel da BitX Core (ex: <code className="text-[#38bdf8]">tx_5e197e2d</code>), confirme os dados abaixo para creditar o saldo na sua custódia:
            </p>

            <form onSubmit={handleRegisterExternalBitxTransfer} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-[#b7bdc6] block mb-1">
                    ID da Transação BitX Core (Hash Externo):
                  </label>
                  <input
                    type="text"
                    value={externalTxHash}
                    onChange={(e) => setExternalTxHash(e.target.value)}
                    placeholder="Ex: tx_5e197e2d"
                    required
                    className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#38bdf8]"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[#b7bdc6] block mb-1">
                    Quantidade Enviada (BTXC):
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={externalTxAmount}
                    onChange={(e) => setExternalTxAmount(e.target.value)}
                    placeholder="1.0000"
                    required
                    className="w-full bg-[#0b0e11] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#38bdf8]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingBitx}
                className="w-full py-2 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isSubmittingBitx ? 'Validando na Rede...' : 'Confirmar e Creditar Depósito BitX Core'}
              </button>
            </form>

            {bitxSubmitMsg && (
              <div className="p-2.5 bg-[#02c076]/15 border border-[#02c076]/30 text-[#02c076] text-xs rounded font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{bitxSubmitMsg}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Enviar Moeda */}
      {activeTab === 'send' && (
        <form onSubmit={handleSendCoins} className="space-y-3.5">
          <div>
            <label className="block text-xs text-[#b7bdc6] mb-1 font-medium">
              Destinatário (Carteira ou E-mail do Trader)
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x... ou destinatario@globalexchange.com"
              required
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-[#b7bdc6] font-medium">
                Quantidade de GX a Enviar
              </label>
              <button
                type="button"
                onClick={() => setSendAmount(custodyBalance.toFixed(4))}
                className="text-[11px] text-[#f0b90b] hover:underline"
              >
                Usar Saldo Máximo
              </button>
            </div>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder="0.0000"
              required
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#f0b90b]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#b7bdc6] mb-1 font-medium">
              Referência / Observação (Opcional)
            </label>
            <input
              type="text"
              value={sendMemo}
              onChange={(e) => setSendMemo(e.target.value)}
              placeholder="Ex: Liquidação de contrato #104"
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#02c076] hover:bg-[#02a766] text-white font-bold rounded text-sm transition shadow flex items-center justify-center gap-1.5 mt-2"
          >
            <Send className="w-4 h-4" />
            Confirmar Envio de Moedas
          </button>

          {/* Recibo Imediato do Envio */}
          {sendSuccessReceipt && (
            <div className="mt-4 p-4 bg-[#181a20] border border-[#02c076] rounded-lg">
              <div className="text-[#02c076] font-bold text-xs flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Envio de Moeda Concluído com Sucesso!
              </div>
              <p className="text-xs text-[#eaecef] mb-2">{sendSuccessReceipt.desc}</p>
              <label className="text-[11px] text-[#848e9c] block mb-1">
                Chave da Transação (TXID):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={sendSuccessReceipt.txid}
                  className="flex-1 bg-[#0b0e11] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-[#f0b90b] font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(sendSuccessReceipt.txid)}
                  className="px-3 py-1.5 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Tab: Depósito Pix BB (Requirement 3: Verified Banco do Brasil production ready) */}
      {activeTab === 'pix' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#b7bdc6] mb-1 font-medium">
              Valor para Depósito Pix BB (Engecema PJ)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#848e9c]">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                min="1.00"
                value={pixAmount}
                onChange={(e) => setPixAmount(e.target.value)}
                placeholder="500.00"
                className="w-full bg-[#2b3139] border border-[#474d57] rounded pl-8 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#f0b90b]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleGeneratePix}
              disabled={isGeneratingPix}
              className="py-2.5 bg-[#2b3139] hover:bg-[#353c46] text-white border border-[#474d57] font-semibold text-xs rounded transition flex items-center justify-center gap-1"
            >
              <QrCodeIcon className="w-3.5 h-3.5 text-[#f0b90b]" />
              {isGeneratingPix ? 'Gerando...' : 'Gerar QR Code Pix'}
            </button>
            <button
              type="button"
              onClick={handleConfirmDeposit}
              className="py-2.5 bg-[#02c076] hover:bg-[#02a766] text-white font-bold text-xs rounded transition shadow flex items-center justify-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Enviar Depósito
            </button>
          </div>

          {/* Pix QR Code Container */}
          {pixCopiaECola && (
            <div className="p-4 bg-[#2b3139] border-2 border-dashed border-[#f0b90b] rounded-lg text-center">
              <div className="flex justify-center my-2">
                <canvas
                  ref={qrCanvasRef}
                  className="rounded bg-white p-1 shadow max-w-[170px]"
                ></canvas>
              </div>

              <div className="text-xs font-semibold text-[#f0b90b] mb-1">
                ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA
              </div>
              <div className="text-[11px] text-[#848e9c] mb-3">
                Chave CNPJ: {PIX_BB_CONFIG.formattedCnpj} • Banco do Brasil
              </div>

              <div className="text-left">
                <label className="text-[11px] text-[#b7bdc6] block mb-1">
                  Código Pix Copia e Cola (EMV Oficial Bacen / BB):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixCopiaECola}
                    className="flex-1 bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pixCopiaECola)}
                    className="px-3 py-1.5 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {pixStatusMsg && (
            <div className="p-2.5 bg-[#0b0e11] border border-[#02c076]/40 text-[#02c076] text-xs rounded text-center font-medium">
              {pixStatusMsg}
            </div>
          )}

          {/* Banco do Brasil Production Certification Badge (Requirement 3) */}
          <div className="p-3 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-[#02c076] font-bold">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-[#02c076]" />
                Banco do Brasil Produção
              </span>
              <span className="bg-[#02c076]/20 text-[#02c076] px-2 py-0.5 rounded text-[10px]">
                Certificado mTLS Pronto
              </span>
            </div>
            <div className="text-[#848e9c] leading-relaxed">
              Os certificados oficiais do Banco do Brasil (
              <code className="text-[#f0b90b]">star_mtls_api_bb_com_br.crt</code> e CA DigiCert Global Root G2) estão integrados ao gateway. Ao configurar as chaves do BB no ambiente (<code className="text-[#f0b90b]">.env</code>), as liquidações operam diretamente no barramento real do Banco do Brasil.
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
