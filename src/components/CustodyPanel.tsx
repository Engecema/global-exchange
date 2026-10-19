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
  cancelWithdrawalAPI,
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
  FileText,
  RefreshCw,
  Clock,
} from 'lucide-react';

interface CustodyPanelProps {
  currentUser: User;
  custodyBalance: number;
  custodyBrlBalance?: number;
  launchPrice?: string;
  onBalanceChange: (newBalance: number, movement: Movement, currencyType?: 'GX' | 'BRL') => void;
  onOpenReceipt?: (movement: Movement) => void;
}

export const CustodyPanel: React.FC<CustodyPanelProps> = ({
  currentUser,
  custodyBalance,
  custodyBrlBalance,
  launchPrice,
  onBalanceChange,
  onOpenReceipt,
}) => {
  const [balanceTab, setBalanceTab] = useState<'brl_liquid' | 'gx_crypto' | 'total_equity'>('brl_liquid');
  const [activeTab, setActiveTab] = useState<'withdraw' | 'pix' | 'send' | 'receive'>('withdraw');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportType, setSupportType] = useState<'CORRECAO_SAQUE' | 'SOLICITACAO_APORTE' | 'DUVIDA_SALDO' | 'OUTRO'>('CORRECAO_SAQUE');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportAmount, setSupportAmount] = useState('');
  const [supportCurrency, setSupportCurrency] = useState<'BRL' | 'GX'>('BRL');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportReceipt, setSupportReceipt] = useState<{
    txid: string;
    protocol: string;
    type: string;
    subject: string;
    createdAt: string;
  } | null>(null);
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [localReceipt, setLocalReceipt] = useState<Movement | null>(null);
  const [custodyResetSuccessMsg, setCustodyResetSuccessMsg] = useState('');
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  const confirmResetCustodyToZero = () => {
    setShowResetConfirmModal(false);
    StorageService.resetAllBalancesAndMovementsToZero();
    onBalanceChange(0.0, {
      id: 'RESET',
      txid: 'RESET',
      clientId: currentUser.email,
      clientEmail: currentUser.email,
      clientName: currentUser.name || currentUser.email,
      type: 'AJUSTE CUSTÓDIA',
      description: 'Zerar custódia e histórico para ativação de modo de liquidez 100% real',
      value: 0,
      status: 'CONFIRMADO',
      createdAt: new Date().toISOString(),
    }, 'BRL');
    onBalanceChange(0.0, {
      id: 'RESET',
      txid: 'RESET',
      clientId: currentUser.email,
      clientEmail: currentUser.email,
      clientName: currentUser.name || currentUser.email,
      type: 'AJUSTE CUSTÓDIA',
      description: 'Zerar custódia e histórico para ativação de modo de liquidez 100% real',
      value: 0,
      status: 'CONFIRMADO',
      createdAt: new Date().toISOString(),
    }, 'GX');
    setCustodyResetSuccessMsg('✅ Todos os saldos e movimentações foram zerados com sucesso! Modo de liquidez 100% real ativado.');
    setTimeout(() => setCustodyResetSuccessMsg(''), 7000);
  };

  const launchPriceNum = parseFloat(launchPrice || StorageService.getLaunchPrice()) || 421081.54;

  // 1. Saldo Real com Liquidez Imediata (R$) - proveniente de vendas executadas ou depósitos via Pix
  const liquidBrlBalance = (() => {
    if (typeof custodyBrlBalance === 'number' && Number.isFinite(custodyBrlBalance)) {
      return custodyBrlBalance;
    }
    return StorageService.getCustodyBrlBalance(currentUser.email);
  })();

  // 2. Valor Estimado de Mercado das Moedas Cripto (GX / BitX Core) em Reais
  const estimatedCryptoBrlValue = custodyBalance * launchPriceNum;

  // 3. Patrimônio Total Consolidado (Saldo com Liquidez em R$ + Valor Estimado das Moedas)
  const totalConsolidatedEquity = liquidBrlBalance + estimatedCryptoBrlValue;

  const [isLiquidating, setIsLiquidating] = useState(false);
  const [liquidationSuccessMsg, setLiquidationSuccessMsg] = useState('');

  // Executa Venda Rápida da moeda GX para gerar Saldo Real com Liquidez Imediata em Reais (R$)
  const handleQuickLiquidate = (fraction: number = 1.0) => {
    setErrorMsg('');
    setLiquidationSuccessMsg('');
    const amountToSell = custodyBalance * fraction;
    if (amountToSell <= 0) {
      setErrorMsg('Você não possui saldo em GX para vender no momento.');
      return;
    }

    setIsLiquidating(true);
    setTimeout(() => {
      const res = StorageService.liquidateGxToBrl({
        clientEmail: currentUser.email,
        amountGx: amountToSell,
        pricePerGx: launchPriceNum,
      });

      setIsLiquidating(false);
      if (!res.success || !res.movement || res.newBrlBalance === undefined || res.newGxBalance === undefined) {
        setErrorMsg(res.error || 'Erro ao processar venda no mercado.');
        return;
      }

      setLiquidationSuccessMsg(
        `✅ Venda executada com sucesso! ${amountToSell.toFixed(4)} GX vendidos a R$ ${launchPriceNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. R$ ${(amountToSell * launchPriceNum).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} creditados no seu SALDO REAL COM LIQUIDEZ. Pronto para saque Pix para o Banco do Brasil!`
      );
      onBalanceChange(res.newBrlBalance, res.movement, 'BRL');
      onBalanceChange(res.newGxBalance, res.movement, 'GX');
    }, 350);
  };

  // Envio Imediato via Pix & Transferência Conta Corrente BB
  const [withdrawDestinationType, setWithdrawDestinationType] = useState<'pix' | 'bb_account'>('pix');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPixKey, setWithdrawPixKey] = useState(() => {
    try {
      return localStorage.getItem('gx_saved_pix_key') || '';
    } catch {
      return '';
    }
  });
  const [withdrawPixKeyType, setWithdrawPixKeyType] = useState<'cpf' | 'cnpj' | 'phone' | 'email' | 'random'>('cpf');
  const [withdrawBankAgency, setWithdrawBankAgency] = useState(() => {
    try {
      return localStorage.getItem('gx_saved_bb_agency') || '0001';
    } catch {
      return '0001';
    }
  });
  const [withdrawBankAccount, setWithdrawBankAccount] = useState(() => {
    try {
      return localStorage.getItem('gx_saved_bb_account') || '';
    } catch {
      return '';
    }
  });
  const [withdrawAccountDigit, setWithdrawAccountDigit] = useState(() => {
    try {
      return localStorage.getItem('gx_saved_bb_digit') || '';
    } catch {
      return '';
    }
  });
  const [withdrawRecipientName, setWithdrawRecipientName] = useState(currentUser.name || '');
  const [withdrawRecipientDoc, setWithdrawRecipientDoc] = useState(currentUser.document || '');
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);
  const [withdrawErrorMsg, setWithdrawErrorMsg] = useState('');
  const [withdrawSuccessReceipt, setWithdrawSuccessReceipt] = useState<{
    txid: string;
    endToEndId: string;
    amount: number;
    destDesc: string;
    movement: Movement;
    isDirectBbApi?: boolean;
    executedAt: string;
  } | null>(null);

  // BitX Core Wallet & Deposit Fields
  const [bitxCopied, setBitxCopied] = useState(false);
  const [externalTxHash, setExternalTxHash] = useState('');
  const [externalTxAmount, setExternalTxAmount] = useState('1.0000');
  const [bitxSubmitMsg, setBitxSubmitMsg] = useState('');
  const [isSubmittingBitx, setIsSubmittingBitx] = useState(false);
  const qrBitxCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const clientBitxAddress = currentUser.bitxAddress || generateBitxCoreAddress(currentUser.email);

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

  // Handle Envio Imediato via Pix / Transferência Automática Banco do Brasil
  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawErrorMsg('');
    setErrorMsg('');
    setWithdrawSuccessReceipt(null);

    const amount = parseFloat(withdrawAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawErrorMsg('Informe um valor de envio ou saque válido maior que zero.');
      return;
    }

    if (amount > liquidBrlBalance) {
      setWithdrawErrorMsg(
        `Saldo Real com Liquidez insuficiente para envio via Pix. Saldo líquido disponível: R$ ${liquidBrlBalance.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}. ${
          custodyBalance > 0
            ? `Você possui ${custodyBalance.toFixed(4)} GX custodiados (avaliados em R$ ${estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Venda suas moedas na boleta de venda para liberar Saldo Real com Liquidez para saque Pix.`
            : 'Deposite recursos via Pix ou venda moedas no livro de ofertas para obter liquidez.'
        }`
      );
      return;
    }

    if (withdrawDestinationType === 'pix') {
      if (!withdrawPixKey.trim()) {
        setWithdrawErrorMsg('Informe a Chave Pix de destino do favorecido.');
        return;
      }
    } else {
      if (!withdrawBankAgency.trim() || !withdrawBankAccount.trim()) {
        setWithdrawErrorMsg('Informe a Agência e a Conta Corrente do Banco do Brasil.');
        return;
      }
    }

    setIsSubmittingWithdrawal(true);
    try {
      const res = await executeInstantPixWithdrawalAPI({
        amount,
        clientEmail: currentUser.email,
        clientName: withdrawRecipientName.trim() || currentUser.name || currentUser.email,
        destinationType: withdrawDestinationType,
        pixKey: withdrawPixKey.trim(),
        pixKeyType: withdrawPixKeyType,
        bankAgency: withdrawBankAgency.trim(),
        bankAccount: withdrawBankAccount.trim(),
        accountDigit: withdrawAccountDigit.trim(),
        recipientName: withdrawRecipientName.trim() || currentUser.name,
        recipientDoc: withdrawRecipientDoc.trim() || currentUser.document,
      });

      // Salva dados bancários/Pix no storage para agilizar próximas operações
      try {
        if (withdrawDestinationType === 'pix' && withdrawPixKey.trim()) {
          localStorage.setItem('gx_saved_pix_key', withdrawPixKey.trim());
        } else if (withdrawDestinationType === 'bb_account') {
          localStorage.setItem('gx_saved_bb_agency', withdrawBankAgency.trim());
          localStorage.setItem('gx_saved_bb_account', withdrawBankAccount.trim());
          localStorage.setItem('gx_saved_bb_digit', withdrawAccountDigit.trim());
        }
      } catch {}

      const destDesc =
        withdrawDestinationType === 'pix'
          ? `Chave Pix ${withdrawPixKey.trim()} (${withdrawPixKeyType.toUpperCase()})`
          : `Banco do Brasil Ag: ${withdrawBankAgency.trim()} C/C: ${withdrawBankAccount.trim()}${
              withdrawAccountDigit.trim() ? `-${withdrawAccountDigit.trim()}` : ''
            }`;

      setWithdrawSuccessReceipt({
        txid: res.txid,
        endToEndId: res.endToEndId,
        amount: res.amount,
        destDesc,
        movement: res.movement,
        isDirectBbApi: res.isDirectBbApi,
        executedAt: new Date().toISOString(),
      });

      setWithdrawAmount('');
      if (res.movement && res.newBalance !== undefined) {
        onBalanceChange(res.newBalance, res.movement, 'BRL');
      }
    } catch (err: any) {
      console.error('Falha no saque/envio imediato:', err);
      setWithdrawErrorMsg(err?.message || 'Erro ao processar transferência instantânea no Banco do Brasil.');
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  const [cancellingTxid, setCancellingTxid] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');
  const [pendingCancelWithdrawalTxid, setPendingCancelWithdrawalTxid] = useState<string | null>(null);

  const handleCancelWithdrawal = (txid: string) => {
    setPendingCancelWithdrawalTxid(txid);
  };

  const confirmExecuteCancelWithdrawal = async () => {
    if (!pendingCancelWithdrawalTxid) return;
    const txid = pendingCancelWithdrawalTxid;
    setPendingCancelWithdrawalTxid(null);
    setCancellingTxid(txid);
    setCancelSuccessMsg('');
    setWithdrawErrorMsg('');
    try {
      const res = await cancelWithdrawalAPI({
        txid,
        reason: 'Cancelado pelo cliente no painel de custódia',
        cancelledBy: currentUser.email,
      });
      if (res.newBalance !== undefined) {
        const mov = StorageService.getMovements(currentUser.email).find((m) => m.txid === txid);
        if (mov) {
          onBalanceChange(res.newBalance, mov, 'BRL');
        }
      }
      setCancelSuccessMsg(res.message || 'Saque cancelado com sucesso e saldo restituído!');
      if (withdrawSuccessReceipt?.txid === txid) {
        setWithdrawSuccessReceipt(null);
      }
      setTimeout(() => setCancelSuccessMsg(''), 6000);
    } catch (err: any) {
      setWithdrawErrorMsg(err?.message || 'Erro ao cancelar ordem de saque.');
    } finally {
      setCancellingTxid(null);
    }
  };

  const clientPendingWithdrawals = StorageService.getPendingWithdrawals(currentUser.email);


  // Envio de Solicitação de Ajuste / Suporte Formal à Administração da Corretora
  const handleSubmitSupportRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!supportSubject.trim()) {
      setErrorMsg('Informe o assunto da solicitação.');
      return;
    }
    if (!supportMessage.trim()) {
      setErrorMsg('Descreva detalhadamente o ocorrido ou o ajuste solicitado.');
      return;
    }

    setIsSubmittingSupport(true);
    setTimeout(() => {
      const relAmount = parseFloat(supportAmount.replace(',', '.'));
      const req = StorageService.addCorrectionRequest({
        clientEmail: currentUser.email,
        clientName: currentUser.name || currentUser.email,
        clientDocument: currentUser.document,
        type: supportType,
        subject: supportSubject,
        message: supportMessage,
        relatedAmount: Number.isFinite(relAmount) && relAmount > 0 ? relAmount : undefined,
        relatedCurrency: supportCurrency,
      });

      setIsSubmittingSupport(false);
      setSupportReceipt({
        txid: req.txid,
        protocol: req.txid,
        type: req.type,
        subject: req.subject,
        createdAt: req.createdAt,
      });
    }, 350);
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

    const currentBrlBal = StorageService.getCustodyBrlBalance(currentUser.email);
    const newBrlBal = currentBrlBal + amount;
    StorageService.setCustodyBrlBalance(currentUser.email, newBrlBal);

    const movement = StorageService.addMovement({
      clientId: currentUser.id,
      clientEmail: currentUser.email,
      clientName: currentUser.name || currentUser.email,
      type: 'DEPÓSITO PIX',
      description: `Depósito via Pix Banco do Brasil (Engecema PJ - R$ ${amount.toFixed(2)})`,
      value: amount,
      currency: 'BRL',
    });

    setPixStatusMsg(`✅ Depósito de R$ ${amount.toFixed(2)} liquidado com sucesso na custódia em Reais (R$)!`);
    onBalanceChange(newBrlBal, movement, 'BRL');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] mb-4 gap-2">
        <div>
          <h3 className="text-base font-bold text-[#f0b90b]">
            Painel de Custódia
          </h3>
          <span className="text-[11px] text-[#848e9c]">
            Gestão de Ativos BitX Core e Saldo Fiduciário com Liquidez Imediata
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowResetConfirmModal(true)}
            className="text-xs px-2.5 py-1.5 bg-[#cf304a]/15 hover:bg-[#cf304a]/25 text-[#cf304a] border border-[#cf304a]/30 rounded flex items-center gap-1.5 transition font-semibold shadow-sm"
            title="Zerar todos os saldos e movimentações para iniciar modo de liquidez real"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Zerar Custódia (Modo Real)
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSupportModal(true);
              setSupportReceipt(null);
            }}
            className="text-xs px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#38bdf8] border border-[#38bdf8]/50 rounded flex items-center gap-1.5 transition font-semibold shadow-sm"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#38bdf8]" />
            Solicitar Correção / Suporte
          </button>
        </div>
      </div>

      {custodyResetSuccessMsg && (
        <div className="mb-4 p-3 rounded text-xs bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{custodyResetSuccessMsg}</span>
        </div>
      )}

      {/* Abas de Saldo da Custódia: Saldo Real com Liquidez (R$) vs Saldo em GX vs Patrimônio Consolidado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-[#181a20] rounded-lg border border-[#2f343b] mb-4">
        {/* Aba 1: Saldo Real com Liquidez (R$) */}
        <button
          type="button"
          onClick={() => {
            setBalanceTab('brl_liquid');
          }}
          className={`py-2 px-3 rounded-md text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
            balanceTab === 'brl_liquid'
              ? 'bg-[#02c076] text-black shadow-md font-extrabold ring-2 ring-[#02c076]/40'
              : 'text-[#848e9c] hover:text-white hover:bg-[#2b3139]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            <span>Aba Saldo com Liquidez (R$)</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
              balanceTab === 'brl_liquid' ? 'bg-black/20 text-black' : 'bg-[#2b3139] text-[#02c076]'
            }`}
          >
            R$ {liquidBrlBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </button>

        {/* Aba 2: Saldo em Moedas GX */}
        <button
          type="button"
          onClick={() => {
            setBalanceTab('gx_crypto');
          }}
          className={`py-2 px-3 rounded-md text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
            balanceTab === 'gx_crypto'
              ? 'bg-[#f0b90b] text-black shadow-md font-extrabold ring-2 ring-[#f0b90b]/40'
              : 'text-[#848e9c] hover:text-white hover:bg-[#2b3139]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" />
            <span>Aba Saldo em GX (Ativo)</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
              balanceTab === 'gx_crypto' ? 'bg-black/20 text-black' : 'bg-[#2b3139] text-[#f0b90b]'
            }`}
          >
            {custodyBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} GX
          </span>
        </button>

        {/* Aba 3: Patrimônio Total Consolidado */}
        <button
          type="button"
          onClick={() => {
            setBalanceTab('total_equity');
          }}
          className={`py-2 px-3 rounded-md text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
            balanceTab === 'total_equity'
              ? 'bg-[#3b82f6] text-white shadow-md font-extrabold ring-2 ring-[#3b82f6]/40'
              : 'text-[#848e9c] hover:text-white hover:bg-[#2b3139]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>Patrimônio Total (R$)</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
              balanceTab === 'total_equity' ? 'bg-black/30 text-white' : 'bg-[#2b3139] text-[#3b82f6]'
            }`}
          >
            R$ {totalConsolidatedEquity.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </button>
      </div>

      {liquidationSuccessMsg && (
        <div className="mb-4 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{liquidationSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setLiquidationSuccessMsg('')}
            className="text-xs hover:underline text-white font-bold"
          >
            OK
          </button>
        </div>
      )}

      {/* Card Dinâmico da Aba Selecionada */}
      {balanceTab === 'brl_liquid' && (
        <div className="bg-gradient-to-r from-[#163d31] via-[#1e2924] to-[#1e2329] p-4 rounded-lg mb-4 border border-[#02c076]/50 shadow-sm space-y-3">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[#848e9c] mb-0.5 font-medium">
                <Banknote className="w-3.5 h-3.5 text-[#02c076]" />
                <span className="font-bold text-[#eaecef]">Saldo Real com Liquidez Imediata (R$)</span>
              </div>
              <strong className="text-2xl sm:text-3xl font-mono text-[#02c076] tracking-tight block font-black">
                R$ {liquidBrlBalance.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
              <span className="text-[11px] text-[#848e9c] block mt-0.5">
                Recursos em dinheiro fiduciário (BRL) 100% disponíveis para saque imediato via Pix para o Banco do Brasil.
              </span>
            </div>

            <div className="text-right">
              <span className="bg-[#02c076]/20 text-[#02c076] text-[11px] px-2.5 py-1 rounded font-bold border border-[#02c076]/40 inline-flex items-center gap-1 uppercase">
                <Zap className="w-3 h-3" />
                DISPONÍVEL PARA SAQUE PIX
              </span>
              <span className="block text-[10px] text-[#848e9c] mt-1">
                Banco do Brasil • Pix Bacen Instantâneo
              </span>
            </div>
          </div>

          {/* Assistente de Liquidez: Se o cliente tem GX custodiados e precisa de liquidez */}
          {custodyBalance > 0 && (
            <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#f0b90b]/40 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#f0b90b] flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5" />
                  Obter Mais Liquidez em Reais (Venda de Ativos)
                </span>
                <span className="text-[10px] text-[#848e9c] font-mono">
                  1 GX = R$ {launchPriceNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-[#b7bdc6] text-[11px] leading-relaxed">
                Você possui <strong className="text-white font-mono">{custodyBalance.toFixed(4)} GX</strong> em custódia (avaliados em <strong className="text-[#02c076] font-mono">R$ {estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>). Para transformar suas moedas em saldo líquido transferível para sua conta bancária, execute a venda a mercado:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={isLiquidating}
                  onClick={() => handleQuickLiquidate(1.0)}
                  className="px-3 py-1.5 bg-[#02c076] hover:bg-[#02a766] text-black font-extrabold rounded text-xs transition flex items-center gap-1 shadow"
                >
                  {isLiquidating ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Liquidando...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" />
                      <span>Vender 100% ({custodyBalance.toFixed(2)} GX → R$ {estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                    </>
                  )}
                </button>
                {custodyBalance > 1 && (
                  <button
                    type="button"
                    disabled={isLiquidating}
                    onClick={() => handleQuickLiquidate(0.5)}
                    className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] font-bold rounded text-xs transition border border-[#474d57]"
                  >
                    Vender 50% ({(custodyBalance * 0.5).toFixed(2)} GX)
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-[#2f343b] flex flex-wrap justify-between items-center text-[11px] text-[#b7bdc6] gap-2">
            <span className="flex items-center gap-1 text-[#02c076]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Recursos prontos para transferência imediata na aba "Envio Pix / Saque" abaixo.
            </span>
            <button
              type="button"
              onClick={() => {
                setBalanceTab('gx_crypto');
              }}
              className="text-[#f0b90b] hover:underline flex items-center gap-1 font-semibold"
            >
              Ver Saldo em Moedas ({custodyBalance.toFixed(2)} GX) →
            </button>
          </div>
        </div>
      )}

      {balanceTab === 'gx_crypto' && (
        <div className="bg-[#2b3139] p-4 rounded-lg mb-4 border border-[#f0b90b]/40 shadow-sm space-y-3">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[#848e9c] mb-0.5 font-medium">
                <Coins className="w-3.5 h-3.5 text-[#f0b90b]" />
                <span className="font-bold text-[#eaecef]">Saldo em Criptoativos (BitX Core - BTXC / GX)</span>
              </div>
              <strong className="text-2xl sm:text-3xl font-mono text-[#f0b90b] tracking-tight block font-black">
                {custodyBalance.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}{' '}
                BTXC
              </strong>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="bg-[#0b0e11] px-2 py-0.5 rounded border border-[#2f343b] font-mono text-[11px] text-[#02c076] font-bold">
                  Valor Estimado: R$ {estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-[#848e9c]">
                  (Cotação oficial: 1 BTXC = R$ {launchPriceNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} [+0.42%])
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="bg-[#f0b90b]/15 text-[#f0b90b] text-[11px] px-2.5 py-1 rounded font-bold border border-[#f0b90b]/30 inline-block uppercase">
                ATIVO EM CUSTÓDIA
              </span>
              <span className="block text-[10px] text-[#848e9c] mt-1">
                Blockchain BitX Core
              </span>
            </div>
          </div>

          {/* Alerta de Compliance Bacen & Liquidez */}
          <div className="p-3 bg-[#181a20] rounded-lg border border-[#3a414b] text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-[#f0b90b] font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Regra de Liquidez e Negociação</span>
            </div>
            <p className="text-[#b7bdc6] text-[11px] leading-relaxed">
              O valor acima é a cotação patrimonial do criptoativo mantido sob custódia. <strong>Para o cliente ter liquidez e transferir o dinheiro para sua conta corrente no Banco do Brasil</strong>, é necessário vender as moedas no Livro de Ofertas da corretora. O montante da venda se torna <strong>Saldo Real com Liquidez (R$)</strong> imediatamente.
            </p>
            {custodyBalance > 0 && (
              <button
                type="button"
                disabled={isLiquidating}
                onClick={() => handleQuickLiquidate(1.0)}
                className="mt-1 px-3 py-1.5 bg-[#02c076] hover:bg-[#02a766] text-black font-extrabold rounded text-xs transition flex items-center gap-1 shadow"
              >
                {isLiquidating ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Processando Venda...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3" />
                    <span>Vender GX Agora e Obter Saldo Real com Liquidez (R$ {estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-[#3a414b] flex flex-wrap justify-between items-center text-[11px] text-[#b7bdc6] gap-2">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#f0b90b]" />
              Ativo seguro com endereço BitX Core e chave TXID de registro.
            </span>
            <button
              type="button"
              onClick={() => {
                setBalanceTab('brl_liquid');
              }}
              className="text-[#02c076] hover:underline flex items-center gap-1 font-semibold"
            >
              Ver Saldo Real com Liquidez (R$ {liquidBrlBalance.toFixed(2)}) →
            </button>
          </div>
        </div>
      )}

      {balanceTab === 'total_equity' && (
        <div className="bg-[#181a20] p-4 rounded-lg mb-4 border border-[#3b82f6]/40 shadow-sm space-y-3">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[#848e9c] mb-0.5 font-medium">
                <Building2 className="w-3.5 h-3.5 text-[#3b82f6]" />
                <span className="font-bold text-[#eaecef]">Patrimônio Total Consolidado em Custódia</span>
              </div>
              <strong className="text-2xl sm:text-3xl font-mono text-[#3b82f6] tracking-tight block font-black">
                R$ {totalConsolidatedEquity.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
              <span className="text-[11px] text-[#848e9c] block mt-0.5">
                Consolidação contábil transparente: Saldo Líquido em Reais + Avaliação dos Ativos GX em Custódia.
              </span>
            </div>

            <div className="text-right">
              <span className="bg-[#3b82f6]/15 text-[#3b82f6] text-[11px] px-2.5 py-1 rounded font-bold border border-[#3b82f6]/30 inline-block uppercase">
                AUDITORIA PATRIMONIAL
              </span>
              <span className="block text-[10px] text-[#848e9c] mt-1">
                Global Exchange Engecema
              </span>
            </div>
          </div>

          {/* Discriminativo em 2 Colunas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div className="p-3 bg-[#1e2329] rounded border border-[#02c076]/30 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#848e9c] font-medium flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5 text-[#02c076]" />
                  1. Saldo Real com Liquidez
                </span>
                <span className="text-[10px] bg-[#02c076]/10 text-[#02c076] px-1.5 py-0.5 rounded font-bold">
                  Disponível Saque
                </span>
              </div>
              <div className="text-lg font-mono font-bold text-[#02c076]">
                R$ {liquidBrlBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-[#848e9c]">
                Pronto para envio imediato via Pix para sua conta corrente BB.
              </p>
            </div>

            <div className="p-3 bg-[#1e2329] rounded border border-[#f0b90b]/30 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#848e9c] font-medium flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-[#f0b90b]" />
                  2. Criptoativos GX em Custódia
                </span>
                <span className="text-[10px] bg-[#f0b90b]/10 text-[#f0b90b] px-1.5 py-0.5 rounded font-bold">
                  Requer Venda
                </span>
              </div>
              <div className="text-lg font-mono font-bold text-[#f0b90b]">
                {custodyBalance.toFixed(4)} GX <span className="text-xs text-[#848e9c] font-normal">(R$ {estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
              </div>
              <p className="text-[10px] text-[#848e9c]">
                Venda na corretora para transferir para seu Saldo Real com Liquidez.
              </p>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded font-medium">
          {errorMsg}
        </div>
      )}

      {/* Form: Collapsible Edit Saldo (Suporta R$ e GX) */}
      {/* Modal: Solicitação de Correção / Suporte Operacional à Administração */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#1e2329] border border-[#38bdf8]/50 rounded-xl max-w-lg w-full p-6 text-[#eaecef] shadow-2xl relative my-8">
            <button
              onClick={() => {
                setShowSupportModal(false);
                setSupportReceipt(null);
              }}
              className="absolute top-4 right-4 text-[#848e9c] hover:text-white p-1 rounded hover:bg-[#2b3139]"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-5 h-5 text-[#38bdf8]" />
              <h3 className="text-base font-bold text-white">
                Solicitação de Ajuste / Suporte da Custódia
              </h3>
            </div>
            <p className="text-xs text-[#848e9c] mb-4">
              Por regras de conformidade e segurança bancária, o cliente não altera saldos diretamente. Qualquer necessidade de correção de envio Pix, ajuste de saldo ou suporte operacional é encaminhada para a Administração da Global Exchange com emissão de protocolo auditável.
            </p>

            {supportReceipt ? (
              <div className="space-y-4">
                <div className="p-4 bg-[#02c076]/15 border border-[#02c076]/40 rounded-lg text-xs space-y-2">
                  <div className="flex items-center gap-2 text-[#02c076] font-bold">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Chamado Registrado com Sucesso!</span>
                  </div>
                  <p className="text-[#eaecef] text-[11px] leading-relaxed">
                    Sua solicitação foi enviada diretamente para a Mesa de Operações e Administração Geral (<strong className="text-white">geonimatos31@gmail.com</strong>). O administrador revisará seu chamado no Painel de Administração para aplicar a correção cabível.
                  </p>
                  <div className="p-2.5 bg-[#0b0e11] rounded border border-[#2f343b] space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#848e9c]">Protocolo / TXID:</span>
                      <span className="text-[#f0b90b] font-bold select-all break-all">{supportReceipt.txid}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#848e9c]">Data / Hora:</span>
                      <span className="text-white">{new Date(supportReceipt.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#848e9c]">Assunto:</span>
                      <span className="text-white">{supportReceipt.subject}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSupportModal(false);
                      setSupportReceipt(null);
                    }}
                    className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition"
                  >
                    Concluir e Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitSupportRequest} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-[#b7bdc6] mb-1 font-semibold">
                    Tipo de Solicitação:
                  </label>
                  <select
                    value={supportType}
                    onChange={(e) => setSupportType(e.target.value as any)}
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#38bdf8]"
                  >
                    <option value="CORRECAO_SAQUE">Correção de Envio Pix / Saque Bancário não concluído</option>
                    <option value="SOLICITACAO_APORTE">Solicitação de Aporte / Crédito de Recursos</option>
                    <option value="DUVIDA_SALDO">Dúvida ou Verificação de Saldo / Ativos</option>
                    <option value="OUTRO">Outro Suporte Operacional</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#b7bdc6] mb-1 font-semibold">
                    Assunto Resumido:
                  </label>
                  <input
                    type="text"
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    placeholder="Ex: Correção de saldo referente ao envio Pix de R$ 35.000"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#38bdf8]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[#b7bdc6] mb-1 font-semibold">
                      Valor Relacionado (Opcional):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={supportAmount}
                      onChange={(e) => setSupportAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#38bdf8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#b7bdc6] mb-1 font-semibold">
                      Moeda:
                    </label>
                    <select
                      value={supportCurrency}
                      onChange={(e) => setSupportCurrency(e.target.value as 'BRL' | 'GX')}
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#38bdf8]"
                    >
                      <option value="BRL">Reais com Liquidez (R$)</option>
                      <option value="GX">BitX Core / Moedas GX</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#b7bdc6] mb-1 font-semibold">
                    Descrição Detalhada da Situação:
                  </label>
                  <textarea
                    rows={4}
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder="Ex: Tentei realizar um saque via Pix que não foi concluído na minha conta corrente do Banco do Brasil. Gostaria que a administração estornasse o valor ou ajustasse a custódia para o montante correto."
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded p-2.5 text-xs text-white focus:outline-none focus:border-[#38bdf8] resize-none leading-relaxed"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmittingSupport}
                    className="flex-1 py-2.5 bg-[#38bdf8] hover:bg-[#0284c7] disabled:opacity-50 text-black font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSubmittingSupport ? 'Enviando...' : 'Enviar Chamado para Administração da Corretora'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSupportModal(false)}
                    className="px-4 py-2.5 bg-[#2b3139] hover:bg-[#353c46] text-white text-xs font-semibold rounded transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Tabs: Envio Pix / Saque BB (R$) | Depósito Pix BB | Enviar GX | Receber BitX */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setActiveTab('withdraw');
            setErrorMsg('');
            setWithdrawErrorMsg('');
          }}
          className={`py-2.5 px-2 rounded font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            activeTab === 'withdraw'
              ? 'bg-[#02c076] text-black shadow font-black ring-2 ring-[#02c076]/40'
              : 'bg-[#183a2c] text-[#02c076] hover:bg-[#1f4a38] border border-[#02c076]/40'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Envio Pix / Saque</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('pix');
            setErrorMsg('');
          }}
          className={`py-2.5 px-2 rounded font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            activeTab === 'pix'
              ? 'bg-[#f0b90b] text-black shadow'
              : 'bg-[#2b3139] text-[#b7bdc6] hover:text-white'
          }`}
        >
          <QrCodeIcon className="w-3.5 h-3.5" />
          <span>Depósito Pix</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('send');
            setErrorMsg('');
          }}
          className={`py-2.5 px-2 rounded font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            activeTab === 'send'
              ? 'bg-[#f0b90b] text-black shadow'
              : 'bg-[#2b3139] text-[#b7bdc6] hover:text-white'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Transferir GX</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('receive');
            setErrorMsg('');
          }}
          className={`py-2.5 px-2 rounded font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            activeTab === 'receive'
              ? 'bg-[#f0b90b] text-black shadow'
              : 'bg-[#2b3139] text-[#b7bdc6] hover:text-white'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Receber BitX</span>
        </button>
      </div>

      {/* Tab: Envio Imediato via Pix & Conta Corrente Banco do Brasil (Saque em Reais R$) */}
      {activeTab === 'withdraw' && (
        <div className="space-y-4">
          {/* Header informativo */}
          <div className="p-3.5 bg-gradient-to-r from-[#163d31] to-[#1e2924] border border-[#02c076]/40 rounded-lg text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-[#02c076]">
                <Zap className="w-4 h-4 text-[#02c076]" />
                <span>Envio Imediato via Pix & Transferência Bancária em Real (R$)</span>
              </div>
              <span className="bg-[#02c076]/20 text-[#02c076] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                Mesa de Liquidação Engecema
              </span>
            </div>
            <p className="text-[#eaecef] text-[11px] leading-relaxed">
              Envie recursos do seu <strong>Saldo com Liquidez (R$)</strong> diretamente para a conta corrente no <strong>Banco do Brasil</strong> ou via <strong>Chave Pix em Real Brasileiro (R$)</strong>. Como em qualquer corretora, os saques são processados pelo banco na alçada corporativa Engecema PJ. Você pode acompanhar ou cancelar seu saque a qualquer momento.
            </p>
          </div>

          {cancelSuccessMsg && (
            <div className="p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{cancelSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setCancelSuccessMsg('')}
                className="text-white hover:underline text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Ordens de Saque em Andamento / Aguardando Liquidação no Banco */}
          {clientPendingWithdrawals.length > 0 && (
            <div className="p-3.5 bg-[#181a20] border-2 border-[#f0b90b] rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#f0b90b]">
                  <Clock className="w-4 h-4 text-[#f0b90b] animate-pulse" />
                  <span>Saques em Liquidação Bancária ({clientPendingWithdrawals.length} pendente(s))</span>
                </div>
                <span className="text-[10px] bg-[#f0b90b]/15 text-[#f0b90b] px-2 py-0.5 rounded border border-[#f0b90b]/30 font-bold uppercase">
                  Alçada Banco do Brasil PJ
                </span>
              </div>

              <div className="space-y-2">
                {clientPendingWithdrawals.map((pending) => (
                  <div
                    key={pending.id}
                    className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <strong className="text-[#02c076] font-mono text-sm">
                          R$ {pending.value.toFixed(2)}
                        </strong>
                        <span className="text-[#848e9c] text-[11px]">
                          • {pending.recipient || 'Destinatário informado'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#848e9c] flex items-center gap-2">
                        <span>Solicitado em: {new Date(pending.createdAt).toLocaleString('pt-BR')}</span>
                        <span>• Protocolo TXID: {pending.txid.slice(0, 10)}...</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenReceipt) onOpenReceipt(pending);
                          else setLocalReceipt(pending);
                        }}
                        className="px-2.5 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] rounded text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Comprovante
                      </button>

                      <button
                        type="button"
                        disabled={cancellingTxid === pending.txid}
                        onClick={() => handleCancelWithdrawal(pending.txid)}
                        className="px-2.5 py-1.5 bg-[#cf304a]/15 hover:bg-[#cf304a]/30 text-[#cf304a] border border-[#cf304a]/40 rounded text-xs font-bold flex items-center gap-1 transition"
                        title="Cancelar e estornar o valor imediatamente de volta para a sua custódia"
                      >
                        {cancellingTxid === pending.txid ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Estornando...
                          </>
                        ) : (
                          <>
                            <span>✕</span>
                            Cancelar e Devolver Saldo
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleExecuteWithdrawal} className="space-y-4">
            {/* Escolha do Método de Destino: Chave Pix OU Conta Corrente BB */}
            <div>
              <label className="block text-xs text-[#b7bdc6] mb-1.5 font-medium">
                Selecione o Destino dos Recursos:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWithdrawDestinationType('pix');
                    setWithdrawErrorMsg('');
                  }}
                  className={`p-3 rounded-lg border text-left flex items-start gap-2.5 transition ${
                    withdrawDestinationType === 'pix'
                      ? 'bg-[#0b0e11] border-[#02c076] text-white shadow'
                      : 'bg-[#2b3139] border-[#3a414b] text-[#848e9c] hover:text-[#eaecef]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      withdrawDestinationType === 'pix'
                        ? 'border-[#02c076] bg-[#02c076]'
                        : 'border-[#474d57]'
                    }`}
                  >
                    {withdrawDestinationType === 'pix' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-black"></span>
                    )}
                  </div>
                  <div>
                    <strong className="text-xs text-white block flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-[#02c076]" />
                      Chave Pix (Envio Imediato)
                    </strong>
                    <span className="text-[11px] text-[#848e9c] block mt-0.5">
                      Qualquer banco (CPF, CNPJ, Celular, E-mail ou Chave Aleatória)
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWithdrawDestinationType('bb_account');
                    setWithdrawErrorMsg('');
                  }}
                  className={`p-3 rounded-lg border text-left flex items-start gap-2.5 transition ${
                    withdrawDestinationType === 'bb_account'
                      ? 'bg-[#0b0e11] border-[#f0b90b] text-white shadow'
                      : 'bg-[#2b3139] border-[#3a414b] text-[#848e9c] hover:text-[#eaecef]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      withdrawDestinationType === 'bb_account'
                        ? 'border-[#f0b90b] bg-[#f0b90b]'
                        : 'border-[#474d57]'
                    }`}
                  >
                    {withdrawDestinationType === 'bb_account' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-black"></span>
                    )}
                  </div>
                  <div>
                    <strong className="text-xs text-white block flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-[#f0b90b]" />
                      Conta Corrente Banco do Brasil
                    </strong>
                    <span className="text-[11px] text-[#848e9c] block mt-0.5">
                      Depósito automático via Agência e Conta Corrente BB (001)
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Campos Específicos: Se Chave Pix */}
            {withdrawDestinationType === 'pix' ? (
              <div className="p-3.5 bg-[#0b0e11] rounded-lg border border-[#2f343b] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#b7bdc6] mb-1">
                      Tipo de Chave Pix:
                    </label>
                    <select
                      value={withdrawPixKeyType}
                      onChange={(e) => setWithdrawPixKeyType(e.target.value as any)}
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#02c076]"
                    >
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                      <option value="phone">Celular</option>
                      <option value="email">E-mail</option>
                      <option value="random">Chave Aleatória (EVP)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-[#b7bdc6] mb-1">
                      Chave Pix do Destinatário:
                    </label>
                    <input
                      type="text"
                      value={withdrawPixKey}
                      onChange={(e) => setWithdrawPixKey(e.target.value)}
                      placeholder={
                        withdrawPixKeyType === 'cpf'
                          ? 'Ex: 000.000.000-00'
                          : withdrawPixKeyType === 'cnpj'
                          ? 'Ex: 00.000.000/0001-00'
                          : withdrawPixKeyType === 'phone'
                          ? 'Ex: (11) 99999-9999'
                          : withdrawPixKeyType === 'email'
                          ? 'Ex: cliente@email.com'
                          : 'Ex: 123e4567-e89b-12d3-a456-426614174000'
                      }
                      required
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#02c076]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Campos Específicos: Se Conta Corrente Banco do Brasil */
              <div className="p-3.5 bg-[#0b0e11] rounded-lg border border-[#2f343b] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1e2329] text-xs">
                  <span className="text-[#848e9c] flex items-center gap-1.5 font-medium">
                    <Building2 className="w-3.5 h-3.5 text-[#f0b90b]" />
                    Instituição Financeira de Destino:
                  </span>
                  <span className="text-[#f0b90b] font-bold">
                    001 - Banco do Brasil S.A.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#b7bdc6] mb-1">
                      Agência BB:
                    </label>
                    <input
                      type="text"
                      value={withdrawBankAgency}
                      onChange={(e) => setWithdrawBankAgency(e.target.value)}
                      placeholder="Ex: 0001 ou 3456"
                      required
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#b7bdc6] mb-1">
                      Conta Corrente:
                    </label>
                    <input
                      type="text"
                      value={withdrawBankAccount}
                      onChange={(e) => setWithdrawBankAccount(e.target.value)}
                      placeholder="Ex: 123456"
                      required
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#b7bdc6] mb-1">
                      Dígito da Conta:
                    </label>
                    <input
                      type="text"
                      value={withdrawAccountDigit}
                      onChange={(e) => setWithdrawAccountDigit(e.target.value)}
                      placeholder="Ex: 7 ou X"
                      maxLength={2}
                      className="w-full bg-[#1e2329] border border-[#474d57] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f0b90b]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Dados do Favorecido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[#b7bdc6] mb-1">
                  Nome do Favorecido / Titular da Conta:
                </label>
                <input
                  type="text"
                  value={withdrawRecipientName}
                  onChange={(e) => setWithdrawRecipientName(e.target.value)}
                  placeholder="Nome completo do titular"
                  required
                  className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#02c076]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#b7bdc6] mb-1">
                  CPF ou CNPJ do Favorecido:
                </label>
                <input
                  type="text"
                  value={withdrawRecipientDoc}
                  onChange={(e) => setWithdrawRecipientDoc(e.target.value)}
                  placeholder="000.000.000-00 ou CNPJ"
                  className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#02c076]"
                />
              </div>
            </div>

            {/* Valor do Envio em Real (R$) e Atalhos */}
            <div>
              <div className="flex flex-wrap justify-between items-center mb-1 gap-1">
                <label className="text-xs text-[#b7bdc6] font-medium flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5 text-[#02c076]" />
                  Valor a Enviar em Real Brasileiro (R$):
                </label>
                <div className="text-[11px] text-[#848e9c]">
                  Saldo com Liquidez (R$):{' '}
                  <strong className="text-[#02c076] font-mono">
                    R$ {liquidBrlBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#848e9c] font-bold">
                  R$
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={liquidBrlBalance > 0 ? liquidBrlBalance : undefined}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full bg-[#2b3139] border border-[#474d57] rounded pl-8 pr-3 py-2.5 text-sm text-white font-mono font-bold focus:outline-none focus:border-[#02c076]"
                />
              </div>

              {/* Botões Rápidos de Porcentagem calculados sobre o Saldo com Liquidez */}
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setWithdrawAmount((liquidBrlBalance * 0.25).toFixed(2))}
                  className="py-1 px-2 bg-[#0b0e11] hover:bg-[#2b3139] text-[#b7bdc6] hover:text-white border border-[#3a414b] rounded text-[10px] font-semibold transition"
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount((liquidBrlBalance * 0.50).toFixed(2))}
                  className="py-1 px-2 bg-[#0b0e11] hover:bg-[#2b3139] text-[#b7bdc6] hover:text-white border border-[#3a414b] rounded text-[10px] font-semibold transition"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount((liquidBrlBalance * 0.75).toFixed(2))}
                  className="py-1 px-2 bg-[#0b0e11] hover:bg-[#2b3139] text-[#b7bdc6] hover:text-white border border-[#3a414b] rounded text-[10px] font-semibold transition"
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(liquidBrlBalance.toFixed(2))}
                  className="py-1 px-2 bg-[#0b0e11] hover:bg-[#2b3139] text-[#02c076] hover:text-[#02c076] border border-[#02c076]/40 rounded text-[10px] font-bold transition"
                >
                  100% (Total)
                </button>
              </div>

              {/* Helper caso o saldo de liquidez seja 0 mas tenha moedas GX */}
              {liquidBrlBalance <= 0 && custodyBalance > 0 && (
                <div className="mt-3 p-3 bg-[#0b0e11] rounded-lg border border-[#f0b90b]/50 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-[#f0b90b] font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Atenção: Seu Saldo Real com Liquidez está em R$ 0,00</span>
                  </div>
                  <p className="text-[#b7bdc6] text-[11px] leading-relaxed">
                    Você possui <strong className="text-white font-mono">{custodyBalance.toFixed(4)} GX</strong> em custódia (avaliados em <strong className="text-[#02c076] font-mono">R$ {estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>). Para sacar recursos para sua conta corrente do Banco do Brasil, venda suas moedas na corretora para liberar liquidez:
                  </p>
                  <button
                    type="button"
                    disabled={isLiquidating}
                    onClick={() => handleQuickLiquidate(1.0)}
                    className="w-full py-2 px-3 bg-[#02c076] hover:bg-[#02a766] text-black font-extrabold rounded text-xs transition flex items-center justify-center gap-1.5 shadow"
                  >
                    {isLiquidating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Processando Venda...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Vender {custodyBalance.toFixed(2)} GX Agora e Liberar R$ {estimatedCryptoBrlValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para Saque Pix</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {withdrawErrorMsg && (
              <div className="p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded font-medium flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{withdrawErrorMsg}</span>
              </div>
            )}

            {/* Botão de Envio Imediato */}
            <button
              type="submit"
              disabled={isSubmittingWithdrawal}
              className={`w-full py-3 text-white font-bold rounded text-sm transition shadow flex items-center justify-center gap-2 ${
                withdrawDestinationType === 'pix'
                  ? 'bg-[#02c076] hover:bg-[#02a766] text-black font-black'
                  : 'bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-black'
              }`}
            >
              {isSubmittingWithdrawal ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processando Envio Imediato no Banco do Brasil...</span>
                </>
              ) : withdrawDestinationType === 'pix' ? (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Executar Envio Imediato via Pix em Real (R$)</span>
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4" />
                  <span>Transferir Recursos para Conta Corrente BB</span>
                </>
              )}
            </button>
          </form>

          {/* Recibo Oficial Imediato de Liquidação */}
          {withdrawSuccessReceipt && (
            <div
              className={`p-4 bg-[#181a20] border-2 rounded-lg space-y-3 ${
                withdrawSuccessReceipt.isDirectBbApi ? 'border-[#02c076]' : 'border-[#f0b90b]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`font-bold text-xs flex items-center gap-1.5 ${
                    withdrawSuccessReceipt.isDirectBbApi ? 'text-[#02c076]' : 'text-[#f0b90b]'
                  }`}
                >
                  {withdrawSuccessReceipt.isDirectBbApi ? (
                    <CheckCircle2 className="w-4 h-4 text-[#02c076]" />
                  ) : (
                    <Clock className="w-4 h-4 text-[#f0b90b] animate-pulse" />
                  )}
                  <span>
                    {withdrawSuccessReceipt.isDirectBbApi
                      ? 'Transferência Instantânea Liquidada no Banco do Brasil!'
                      : 'Ordem de Saque Registrada (Em Liquidação Bancária Banco do Brasil)'}
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    withdrawSuccessReceipt.isDirectBbApi
                      ? 'bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40'
                      : 'bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/40'
                  }`}
                >
                  {withdrawSuccessReceipt.isDirectBbApi ? 'Liquidado no BB' : 'Aguardando BB PJ'}
                </span>
              </div>

              <div className="text-xs text-[#eaecef]">
                Operação de saque no valor de{' '}
                <strong
                  className={`font-mono font-bold ${
                    withdrawSuccessReceipt.isDirectBbApi ? 'text-[#02c076]' : 'text-[#f0b90b]'
                  }`}
                >
                  R$ {withdrawSuccessReceipt.amount.toFixed(2)}
                </strong>{' '}
                com destino a{' '}
                <span className="text-white font-semibold">{withdrawSuccessReceipt.destDesc}</span>.
                {!withdrawSuccessReceipt.isDirectBbApi ? (
                  <div className="mt-2 p-2.5 bg-[#0b0e11] rounded border border-[#f0b90b]/40 text-[11px] text-[#f0b90b] leading-relaxed space-y-1">
                    <div>
                      🏛️ <strong>Acompanhamento Bancário:</strong> O valor em Reais foi reservado da sua custódia e está em processo de liquidação bancária. Para segurança institucional, a saída dos fundos da conta corporativa do Banco do Brasil aguarda liberação na alçada do Gerenciador Financeiro BB PJ ou transferência pela Mesa de Operações Engecema.
                    </div>
                    {withdrawSuccessReceipt.movement?.errorDetail && (
                      <div className="text-[10px] text-[#f87171] font-mono bg-[#450a0a]/20 p-1 rounded">
                        Info Técnica Banco do Brasil: {withdrawSuccessReceipt.movement.errorDetail}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 p-2 bg-[#0b0e11] rounded border border-[#02c076]/40 text-[11px] text-[#02c076]">
                    ✅ O Banco do Brasil confirmou a liquidação e o crédito já foi processado na conta de destino.
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                {withdrawSuccessReceipt.isDirectBbApi && withdrawSuccessReceipt.endToEndId ? (
                  <div className="p-2 bg-[#0b0e11] rounded border border-[#2f343b]">
                    <span className="text-[10px] text-[#848e9c] block font-sans">
                      Identificador Bacen EndToEnd ID Oficial:
                    </span>
                    <span className="text-[#02c076] break-all text-[11px]">
                      {withdrawSuccessReceipt.endToEndId}
                    </span>
                  </div>
                ) : (
                  <div className="p-2 bg-[#0b0e11] rounded border border-[#2f343b]">
                    <span className="text-[10px] text-[#848e9c] block font-sans">
                      Protocolo de Liquidação Bancária:
                    </span>
                    <span className="text-[#f0b90b] break-all text-[11px]">
                      {withdrawSuccessReceipt.endToEndId || withdrawSuccessReceipt.txid}
                    </span>
                  </div>
                )}

                <div className="p-2 bg-[#0b0e11] rounded border border-[#2f343b]">
                  <span className="text-[10px] text-[#848e9c] block font-sans">
                    Chave Criptográfica TXID:
                  </span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[#f0b90b] break-all text-[11px]">
                      {withdrawSuccessReceipt.txid}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(withdrawSuccessReceipt.txid)}
                      className="px-2 py-1 bg-[#2b3139] hover:bg-[#353c46] text-[#b7bdc6] hover:text-white rounded text-[11px] font-sans flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenReceipt) {
                      onOpenReceipt(withdrawSuccessReceipt.movement);
                    } else {
                      setLocalReceipt(withdrawSuccessReceipt.movement);
                    }
                  }}
                  className="flex-1 py-2 bg-[#02c076] hover:bg-[#02a766] text-black font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Visualizar Comprovante Oficial
                </button>

                {!withdrawSuccessReceipt.isDirectBbApi && (
                  <button
                    type="button"
                    disabled={cancellingTxid === withdrawSuccessReceipt.txid}
                    onClick={() => handleCancelWithdrawal(withdrawSuccessReceipt.txid)}
                    className="py-2 px-3 bg-[#cf304a]/15 hover:bg-[#cf304a]/30 text-[#cf304a] border border-[#cf304a]/40 font-bold text-xs rounded transition flex items-center justify-center gap-1.5"
                  >
                    {cancellingTxid === withdrawSuccessReceipt.txid ? 'Estornando...' : 'Cancelar e Devolver Saldo'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Certificação mTLS Banco do Brasil */}
          <div className="p-3 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-[#02c076] font-bold">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-[#02c076]" />
                Alçada Corporativa Banco do Brasil S.A.
              </span>
              <span className="text-[10px] text-[#848e9c]">
                CNPJ {PIX_BB_CONFIG.formattedCnpj}
              </span>
            </div>
            <p className="text-[#848e9c] leading-relaxed">
              As ordens de transferência bancária e Pix contam com débito imediato e auditoria automática pelo barramento mTLS oficial da Engecema Tecnologia no Banco do Brasil.
            </p>
          </div>
        </div>
      )}

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

      {/* Comprovante Oficial em Modal */}
      <ReceiptModal
        movement={localReceipt}
        onClose={() => setLocalReceipt(null)}
      />

      {/* Modal de Confirmação: Zerar Custódia */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e2329] border border-[#cf304a]/50 rounded-lg max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-2.5 text-[#cf304a] font-bold text-base mb-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Confirmar Reset de Custódia</span>
            </div>
            <p className="text-xs text-[#b7bdc6] leading-relaxed mb-4">
              Atenção: Deseja zerar todos os saldos de custódia (R$ e BTXC/GX) e movimentações desta conta? Os valores ficarão estritamente em R$ 0,00 e 0,00 BTXC para que todas as movimentações futuras decorram exclusivamente de vendas reais de moedas na corretora ou liquidações oficiais do Banco do Brasil.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] text-xs font-semibold rounded transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmResetCustodyToZero}
                className="px-3.5 py-1.5 bg-[#cf304a] hover:bg-[#b02239] text-white text-xs font-bold rounded transition shadow"
              >
                Sim, Zerar Custódia
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação: Cancelamento de Saque */}
      {pendingCancelWithdrawalTxid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e2329] border border-[#f0b90b]/50 rounded-lg max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-2.5 text-[#f0b90b] font-bold text-base mb-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Confirmar Cancelamento de Saque</span>
            </div>
            <p className="text-xs text-[#b7bdc6] leading-relaxed mb-4">
              Deseja cancelar esta solicitação de saque e estornar 100% do saldo em Reais (R$) de volta para sua custódia com liquidez?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingCancelWithdrawalTxid(null)}
                className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#353c46] text-[#eaecef] text-xs font-semibold rounded transition"
              >
                Manter Saque
              </button>
              <button
                type="button"
                onClick={confirmExecuteCancelWithdrawal}
                className="px-3.5 py-1.5 bg-[#f0b90b] hover:bg-[#e0ab07] text-black text-xs font-bold rounded transition shadow"
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
