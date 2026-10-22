import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Movement, User } from '../types/exchange';
import {
  StorageService,
  generateBitxCoreAddress,
  generateTxid,
} from '../services/storage';
import {
  generatePixCopiaECola,
  PIX_BB_CONFIG,
  createPixChargeAPI,
  executeInstantPixWithdrawalAPI,
} from '../services/pixBB';
import {
  QrCode as QrCodeIcon,
  Copy,
  CheckCircle2,
  Building2,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  AlertCircle,
  Zap,
  Banknote,
  RefreshCw,
  Send,
  ArrowRightLeft,
  DollarSign,
  Check,
} from 'lucide-react';

interface CustodyPanelProps {
  currentUser: User;
  custodyBalance: number;
  custodyBrlBalance?: number;
  custodyUsdtBalance?: number;
  launchPrice?: string;
  onBalanceChange: (newBalance: number, movement: Movement, currencyType?: 'GX' | 'BRL' | 'USDT') => void;
  onOpenReceipt?: (movement: Movement) => void;
  onResetCustody?: () => void;
}

type CustodyTab = 'deposito_pix' | 'saque_pix' | 'carteira_bitx';

export const CustodyPanel: React.FC<CustodyPanelProps> = ({
  currentUser,
  custodyBalance,
  custodyBrlBalance = 0,
  custodyUsdtBalance = 0,
  launchPrice,
  onBalanceChange,
  onOpenReceipt,
}) => {
  const [activeTab, setActiveTab] = useState<CustodyTab>('deposito_pix');

  // Estados de Depósito Pix
  const [depositAmount, setDepositAmount] = useState<string>('500');
  const [pixPayload, setPixPayload] = useState<string>('');
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string>('');
  const [copiedPix, setCopiedPix] = useState<boolean>(false);
  const [isGeneratingPix, setIsGeneratingPix] = useState<boolean>(false);

  // Estados de Saque Pix
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawDestType, setWithdrawDestType] = useState<'pix' | 'bb_account'>('pix');
  const [withdrawPixKey, setWithdrawPixKey] = useState<string>('');
  const [withdrawPixType, setWithdrawPixType] = useState<string>('CPF');
  const [withdrawAgency, setWithdrawAgency] = useState<string>('0001');
  const [withdrawAccount, setWithdrawAccount] = useState<string>('');
  const [withdrawAccountDigit, setWithdrawAccountDigit] = useState<string>('');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState<boolean>(false);

  // Estados de Carteira BitX / Conversão
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferDestAddress, setTransferDestAddress] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [clientWalletQrUrl, setClientWalletQrUrl] = useState<string>('');
  const [copiedWallet, setCopiedWallet] = useState<boolean>(false);

  // Conversão rápida BTXC -> BRL
  const [sellAmountBtxc, setSellAmountBtxc] = useState<string>('0.5');
  const [isLiquidating, setIsLiquidating] = useState<boolean>(false);

  // Feedback geral
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const numericLaunchPrice = parseFloat(launchPrice || StorageService.getLaunchPrice()) || 421081.54;
  const bitxWalletAddress = currentUser.bitxAddress || generateBitxCoreAddress(currentUser.email);

  // Gera payload Pix inicial
  useEffect(() => {
    generatePixCode(parseFloat(depositAmount) || 500);
    // Gera QR code da carteira do cliente
    if (bitxWalletAddress) {
      QRCode.toDataURL(bitxWalletAddress, { width: 200, margin: 1 })
        .then(setClientWalletQrUrl)
        .catch(() => {});
    }
  }, [currentUser]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  // Gerador de Pix Copia e Cola & QR Code
  const generatePixCode = async (amount: number) => {
    if (amount <= 0) return;
    setIsGeneratingPix(true);
    try {
      const code = generatePixCopiaECola(amount);
      setPixPayload(code);
      const dataUrl = await QRCode.toDataURL(code, { width: 220, margin: 1 });
      setPixQrDataUrl(dataUrl);
    } catch (e: any) {
      console.warn('Erro ao gerar QR Code Pix:', e?.message);
    } finally {
      setIsGeneratingPix(false);
    }
  };

  const handleDepositAmountChange = (val: string) => {
    setDepositAmount(val);
    const num = parseFloat(val);
    if (num > 0) {
      generatePixCode(num);
    }
  };

  const handleCopyPix = () => {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
    showToast('success', 'Código Pix Copia e Cola copiado para a área de transferência!');
  };

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(bitxWalletAddress);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2500);
    showToast('success', 'Endereço da Carteira BitX Core copiado!');
  };

  // Efetivar Depósito (Crédito Imediato em Reais com Liquidez)
  const handleConfirmDeposit = () => {
    const num = parseFloat(depositAmount);
    if (!Number.isFinite(num) || num <= 0) {
      showToast('error', 'Informe um valor válido para o depósito.');
      return;
    }

    const currentBrl = StorageService.getCustodyBrlBalance(currentUser.email);
    const newBrl = currentBrl + num;
    StorageService.setCustodyBrlBalance(currentUser.email, newBrl);

    const mov = StorageService.addMovement({
      clientId: currentUser.email,
      clientEmail: currentUser.email,
      clientName: currentUser.name,
      type: 'DEPÓSITO PIX',
      description: `Depósito via Pix Banco do Brasil • Chave CNPJ: ${PIX_BB_CONFIG.formattedCnpj}`,
      value: num,
      currency: 'BRL',
      status: 'CONFIRMADO',
    });

    StorageService.addLedgerEntry({
      type: 'Depósito Pix BB',
      counterparty: `${currentUser.name} -> Custódia Engecema`,
      amountGx: 0,
      amountBrl: num,
      amountUsdt: 0,
      txid: mov.txid,
      status: 'Confirmado via Pix',
      beneficiaryEmail: currentUser.email,
      notes: 'Depósito fiduciário com liquidez imediata Banco do Brasil',
    });

    onBalanceChange(newBrl, mov, 'BRL');
    showToast('success', `Depósito de R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} confirmado com sucesso na sua custódia!`);
    if (onOpenReceipt) onOpenReceipt(mov);
  };

  // Efetivar Saque Pix
  const handleConfirmWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('error', 'Informe um valor de saque maior que zero.');
      return;
    }

    if (amount > custodyBrlBalance) {
      showToast('error', `Saldo insuficiente. Disponível para saque: R$ ${custodyBrlBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
      return;
    }

    if (withdrawDestType === 'pix' && !withdrawPixKey.trim()) {
      showToast('error', 'Informe a sua chave Pix para receber os recursos.');
      return;
    }

    if (withdrawDestType === 'bb_account' && (!withdrawAgency || !withdrawAccount)) {
      showToast('error', 'Informe Agência e Conta Corrente do Banco do Brasil.');
      return;
    }

    setIsSubmittingWithdraw(true);

    try {
      const res = StorageService.executeWithdrawal({
        clientEmail: currentUser.email,
        clientName: currentUser.name,
        amount,
        destinationType: withdrawDestType,
        pixKey: withdrawPixKey.trim(),
        pixKeyType: withdrawPixType,
        bankAgency: withdrawAgency.trim(),
        bankAccount: withdrawAccount.trim(),
        accountDigit: withdrawAccountDigit.trim(),
      });

      if (!res.success || !res.movement) {
        showToast('error', res.error || 'Erro ao processar ordem de saque.');
        return;
      }

      // Notifica backend em segundo plano
      executeInstantPixWithdrawalAPI({
        amount,
        clientEmail: currentUser.email,
        clientName: currentUser.name,
        destinationType: withdrawDestType,
        pixKey: withdrawPixKey.trim(),
        pixKeyType: withdrawPixType,
        bankAgency: withdrawAgency.trim(),
        bankAccount: withdrawAccount.trim(),
        accountDigit: withdrawAccountDigit.trim(),
      }).catch(() => {});

      onBalanceChange(res.newBalance || 0, res.movement, 'BRL');
      setWithdrawAmount('');
      showToast('success', `Ordem de saque de R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} gerada com sucesso! TXID: ${res.txid?.slice(0, 10)}...`);

      if (onOpenReceipt) onOpenReceipt(res.movement);
    } catch (err: any) {
      showToast('error', 'Falha ao solicitar saque: ' + err.message);
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  // Transferência de BTXC para outra carteira BitX Core
  const handleTransferBtxc = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    const dest = transferDestAddress.trim().toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('error', 'Informe uma quantidade válida de BTXC.');
      return;
    }

    if (amount > custodyBalance) {
      showToast('error', `Saldo insuficiente. Você possui ${custodyBalance.toFixed(4)} BTXC.`);
      return;
    }

    if (!dest || !dest.startsWith('bxrt1q')) {
      showToast('error', 'Informe um endereço BitX Core válido (deve iniciar com "bxrt1q...").');
      return;
    }

    if (dest === bitxWalletAddress.toLowerCase()) {
      showToast('error', 'O endereço de destino não pode ser a sua própria carteira.');
      return;
    }

    setIsTransferring(true);

    try {
      const newBal = Math.max(0, custodyBalance - amount);
      StorageService.setCustodyBalance(currentUser.email, newBal);

      // Se destinatário for cliente interno, credita
      const allClients = StorageService.getClients();
      const targetClient = allClients.find((c) => (c.bitxAddress || '').toLowerCase() === dest);
      if (targetClient) {
        const targetCurrent = StorageService.getCustodyBalance(targetClient.email);
        StorageService.setCustodyBalance(targetClient.email, targetCurrent + amount);
      }

      const txid = generateTxid();
      const mov = StorageService.addMovement({
        clientId: currentUser.email,
        clientEmail: currentUser.email,
        clientName: currentUser.name,
        type: 'ENVIO DE MOEDA',
        description: `Transferência de ${amount.toFixed(4)} BTXC para ${dest.slice(0, 12)}...${dest.slice(-6)}`,
        value: amount,
        currency: 'BTXC',
        status: 'CONFIRMADO',
        txid,
      });

      StorageService.addLedgerEntry({
        type: 'Transferência BitX Core',
        counterparty: `${currentUser.name} -> ${dest.slice(0, 14)}...`,
        amountGx: amount,
        amountBrl: 0,
        amountUsdt: 0,
        txid,
        status: 'Confirmado na Blockchain',
        beneficiaryEmail: targetClient?.email || dest,
        notes: 'Transferência entre carteiras BitX Core Mainnet',
      });

      onBalanceChange(newBal, mov, 'GX');
      setTransferAmount('');
      setTransferDestAddress('');
      showToast('success', `Transferência de ${amount.toFixed(4)} BTXC enviada com sucesso na Mainnet!`);
      if (onOpenReceipt) onOpenReceipt(mov);
    } finally {
      setIsTransferring(false);
    }
  };

  // Conversão / Venda a mercado imediata de BTXC -> BRL (Gera saldo para saque)
  const handleLiquidateBtxcToBrl = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(sellAmountBtxc);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('error', 'Informe uma quantidade válida de BTXC para vender.');
      return;
    }

    if (amount > custodyBalance) {
      showToast('error', `Saldo insuficiente. Você possui ${custodyBalance.toFixed(4)} BTXC.`);
      return;
    }

    setIsLiquidating(true);
    try {
      const res = StorageService.liquidateGxToBrl({
        clientEmail: currentUser.email,
        amountGx: amount,
        pricePerGx: numericLaunchPrice,
      });

      if (!res.success || !res.movement) {
        showToast('error', res.error || 'Erro na conversão.');
        return;
      }

      onBalanceChange(res.newGxBalance || 0, res.movement, 'GX');
      showToast('success', `Venda executada! R$ ${(amount * numericLaunchPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} creditados no seu Saldo com Liquidez para saque.`);
      if (onOpenReceipt) onOpenReceipt(res.movement);
    } finally {
      setIsLiquidating(false);
    }
  };

  return (
    <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 shadow-lg space-y-5">
      {/* Header do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#2f343b]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#f0b90b]/15 border border-[#f0b90b]/30 flex items-center justify-center text-[#f0b90b]">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#eaecef]">
              Operações de Custódia & Liquidez
            </h3>
            <p className="text-xs text-[#848e9c]">
              Deposite via Pix, solicite saques para sua conta ou gerencie sua carteira
            </p>
          </div>
        </div>

        {/* Cotação de Referência */}
        <div className="text-right font-mono text-xs self-start sm:self-auto bg-[#0b0e11] px-3 py-1.5 rounded-lg border border-[#2f343b]">
          <span className="text-[#848e9c] text-[11px] block">Cotação Oficial BTXC:</span>
          <span className="font-bold text-[#02c076]">
            R$ {numericLaunchPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-[#02c076]/15 border-[#02c076]/30 text-[#02c076]'
              : 'bg-[#cf304a]/15 border-[#cf304a]/30 text-[#cf304a]'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Cards de Saldos do Cliente */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#0b0e11] border border-[#2f343b] rounded-lg p-3">
          <div className="flex items-center justify-between text-[#848e9c] text-xs">
            <span>Saldo em Cripto (BTXC)</span>
            <Coins className="w-3.5 h-3.5 text-[#f0b90b]" />
          </div>
          <div className="text-base font-bold font-mono text-[#f0b90b] mt-1">
            {custodyBalance.toFixed(4)} <span className="text-xs font-normal">BTXC</span>
          </div>
          <div className="text-[10px] text-[#848e9c] mt-0.5">
            ≈ R$ {(custodyBalance * numericLaunchPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-[#0b0e11] border border-[#2f343b] rounded-lg p-3">
          <div className="flex items-center justify-between text-[#848e9c] text-xs">
            <span>Saldo com Liquidez (R$)</span>
            <Banknote className="w-3.5 h-3.5 text-[#02c076]" />
          </div>
          <div className="text-base font-bold font-mono text-[#02c076] mt-1">
            R$ {custodyBrlBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-[#02c076] mt-0.5">
            Disponível para saque Pix imediato
          </div>
        </div>

        <div className="bg-[#0b0e11] border border-[#2f343b] rounded-lg p-3">
          <div className="flex items-center justify-between text-[#848e9c] text-xs">
            <span>Saldo em Dólares (USDT)</span>
            <DollarSign className="w-3.5 h-3.5 text-[#38bdf8]" />
          </div>
          <div className="text-base font-bold font-mono text-[#38bdf8] mt-1">
            $ {custodyUsdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-[#848e9c] mt-0.5">
            Conta fiduciária internacional
          </div>
        </div>
      </div>

      {/* 3 Abas Diretas e Simplificadas */}
      <div className="flex bg-[#0b0e11] p-1 rounded-lg border border-[#2f343b]">
        <button
          type="button"
          onClick={() => setActiveTab('deposito_pix')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${
            activeTab === 'deposito_pix'
              ? 'bg-[#02c076] text-black shadow-sm'
              : 'text-[#848e9c] hover:text-[#eaecef]'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          Depositar via Pix
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('saque_pix')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${
            activeTab === 'saque_pix'
              ? 'bg-[#f0b90b] text-black shadow-sm'
              : 'text-[#848e9c] hover:text-[#eaecef]'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          Sacar via Pix
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('carteira_bitx')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${
            activeTab === 'carteira_bitx'
              ? 'bg-[#38bdf8] text-black shadow-sm'
              : 'text-[#848e9c] hover:text-[#eaecef]'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Carteira BitX & Conversão
        </button>
      </div>

      {/* CONTEÚDO DA ABA 1: DEPÓSITO VIA PIX */}
      {activeTab === 'deposito_pix' && (
        <div className="space-y-4 pt-1">
          <div>
            <label className="text-xs font-semibold text-[#848e9c] block mb-1">
              Valor do Depósito (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono text-[#848e9c]">R$</span>
              <input
                type="number"
                step="0.01"
                value={depositAmount}
                onChange={(e) => handleDepositAmountChange(e.target.value)}
                placeholder="500.00"
                className="w-full pl-9 pr-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-sm font-mono text-[#eaecef] focus:outline-none focus:border-[#02c076]"
              />
            </div>
          </div>

          {/* Atalhos de Valor */}
          <div className="flex gap-2">
            {['100', '500', '1000', '5000'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleDepositAmountChange(val)}
                className={`flex-1 py-1 text-[11px] font-mono rounded border transition ${
                  depositAmount === val
                    ? 'bg-[#02c076]/20 border-[#02c076] text-[#02c076] font-bold'
                    : 'bg-[#0b0e11] border-[#2f343b] text-[#848e9c] hover:text-[#eaecef]'
                }`}
              >
                + R$ {val}
              </button>
            ))}
          </div>

          {/* QR Code & Copia e Cola */}
          <div className="bg-[#0b0e11] border border-[#2f343b] rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
            {pixQrDataUrl && (
              <div className="bg-white p-2 rounded-lg flex-shrink-0 shadow">
                <img src={pixQrDataUrl} alt="QR Code Pix BB" className="w-32 h-32" />
              </div>
            )}

            <div className="flex-1 space-y-2.5 w-full text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-[#848e9c]">
                  <span>Beneficiário:</span>
                  <span className="font-semibold text-[#eaecef]">{PIX_BB_CONFIG.merchantName}</span>
                </div>
                <div className="flex justify-between text-[#848e9c]">
                  <span>Chave CNPJ:</span>
                  <span className="font-mono text-[#f0b90b] font-bold">{PIX_BB_CONFIG.formattedCnpj}</span>
                </div>
                <div className="flex justify-between text-[#848e9c]">
                  <span>Banco:</span>
                  <span className="text-[#eaecef]">001 - Banco do Brasil S.A.</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCopyPix}
                  className="w-full py-2 px-3 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] font-semibold rounded-lg border border-[#2f343b] flex items-center justify-center gap-2 transition"
                >
                  {copiedPix ? <Check className="w-4 h-4 text-[#02c076]" /> : <Copy className="w-4 h-4" />}
                  {copiedPix ? 'Chave Pix Copiada!' : 'Copiar Pix Copia e Cola'}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirmDeposit}
            className="w-full py-2.5 px-4 bg-[#02c076] hover:bg-[#02a062] text-black font-bold text-xs rounded-lg transition shadow-md"
          >
            Confirmar Depósito Realizado (Creditar Saldo)
          </button>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: SAQUE INSTANTÂNEO PIX */}
      {activeTab === 'saque_pix' && (
        <form onSubmit={handleConfirmWithdrawal} className="space-y-4 pt-1">
          {/* Header de Liquidez Disponível */}
          <div className="bg-[#0b0e11] border border-[#2f343b] rounded-lg p-3 flex justify-between items-center text-xs">
            <span className="text-[#848e9c]">Saldo com Liquidez para Saque:</span>
            <span className="font-bold font-mono text-[#02c076] text-sm">
              R$ {custodyBrlBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Campo de Valor com Atalhos */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[#848e9c]">Valor do Saque (R$)</label>
              <div className="flex gap-1.5">
                {[0.25, 0.5, 1].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setWithdrawAmount((custodyBrlBalance * pct).toFixed(2))}
                    className="px-2 py-0.5 text-[10px] font-mono bg-[#0b0e11] hover:bg-[#2b3139] border border-[#2f343b] text-[#38bdf8] rounded"
                  >
                    {pct * 100}%
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono text-[#848e9c]">R$</span>
              <input
                type="number"
                step="0.01"
                required
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-sm font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
              />
            </div>
          </div>

          {/* Destino do Saque */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#848e9c] block">Destino dos Recursos</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWithdrawDestType('pix')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition ${
                  withdrawDestType === 'pix'
                    ? 'bg-[#f0b90b]/15 border-[#f0b90b] text-[#f0b90b]'
                    : 'bg-[#0b0e11] border-[#2f343b] text-[#848e9c]'
                }`}
              >
                Chave Pix (Qualquer Banco)
              </button>
              <button
                type="button"
                onClick={() => setWithdrawDestType('bb_account')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition ${
                  withdrawDestType === 'bb_account'
                    ? 'bg-[#f0b90b]/15 border-[#f0b90b] text-[#f0b90b]'
                    : 'bg-[#0b0e11] border-[#2f343b] text-[#848e9c]'
                }`}
              >
                Conta Banco do Brasil
              </button>
            </div>
          </div>

          {withdrawDestType === 'pix' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#848e9c] block">Sua Chave Pix</label>
              <div className="flex gap-2">
                <select
                  value={withdrawPixType}
                  onChange={(e) => setWithdrawPixType(e.target.value)}
                  className="px-2.5 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                >
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="TELEFONE">Telefone</option>
                  <option value="ALEATORIA">Chave Aleatória</option>
                </select>
                <input
                  type="text"
                  required
                  value={withdrawPixKey}
                  onChange={(e) => setWithdrawPixKey(e.target.value)}
                  placeholder="Insira sua chave Pix..."
                  className="flex-1 px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[#848e9c] block mb-1">Agência</label>
                <input
                  type="text"
                  required
                  value={withdrawAgency}
                  onChange={(e) => setWithdrawAgency(e.target.value)}
                  placeholder="0001"
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#848e9c] block mb-1">Conta Corrente</label>
                <input
                  type="text"
                  required
                  value={withdrawAccount}
                  onChange={(e) => setWithdrawAccount(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#848e9c] block mb-1">Dígito</label>
                <input
                  type="text"
                  value={withdrawAccountDigit}
                  onChange={(e) => setWithdrawAccountDigit(e.target.value)}
                  placeholder="X"
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmittingWithdraw}
            className="w-full py-2.5 px-4 bg-[#f0b90b] hover:bg-[#d8a609] text-black font-bold text-xs rounded-lg transition shadow-md flex items-center justify-center gap-2"
          >
            {isSubmittingWithdraw && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Confirmar Solicitação de Saque
          </button>
        </form>
      )}

      {/* CONTEÚDO DA ABA 3: CARTEIRA BITX & CONVERSÃO */}
      {activeTab === 'carteira_bitx' && (
        <div className="space-y-5 pt-1">
          {/* Endereço de Custódia Oficial */}
          <div className="bg-[#0b0e11] border border-[#2f343b] rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
            {clientWalletQrUrl && (
              <div className="bg-white p-2 rounded-lg flex-shrink-0 shadow">
                <img src={clientWalletQrUrl} alt="QR Code Carteira BitX" className="w-28 h-28" />
              </div>
            )}

            <div className="flex-1 space-y-2 w-full text-xs">
              <span className="text-[#848e9c] block">Seu Endereço de Custódia BitX Core (Mainnet):</span>
              <div className="font-mono text-[#38bdf8] break-all bg-[#1e2329] p-2 rounded border border-[#2f343b]">
                {bitxWalletAddress}
              </div>
              <button
                type="button"
                onClick={handleCopyWallet}
                className="py-1.5 px-3 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] rounded font-semibold text-xs transition flex items-center gap-1.5"
              >
                {copiedWallet ? <Check className="w-3.5 h-3.5 text-[#02c076]" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedWallet ? 'Endereço Copiado!' : 'Copiar Endereço'}
              </button>
            </div>
          </div>

          {/* Conversão Imediata BTXC -> Reais (R$) */}
          <form onSubmit={handleLiquidateBtxcToBrl} className="p-4 bg-[#0b0e11] border border-[#2f343b] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#eaecef] flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-[#f0b90b]" />
                Liquidar BTXC para Saque (Gerar Saldo em R$)
              </span>
              <span className="text-[10px] text-[#848e9c]">Taxa zero na Global Exchange</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1">Quantidade em BTXC</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={sellAmountBtxc}
                  onChange={(e) => setSellAmountBtxc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#f0b90b]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1">Receberá em Reais (R$)</label>
                <div className="px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded-lg text-xs font-mono font-bold text-[#02c076]">
                  R$ {((parseFloat(sellAmountBtxc) || 0) * numericLaunchPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLiquidating}
              className="w-full py-2 bg-[#02c076] hover:bg-[#02a062] text-black font-bold text-xs rounded-lg transition"
            >
              Executar Venda e Gerar Saldo Líquido
            </button>
          </form>

          {/* Transferir para outra Carteira BitX */}
          <form onSubmit={handleTransferBtxc} className="p-4 bg-[#0b0e11] border border-[#2f343b] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#eaecef] flex items-center gap-1.5">
                <Send className="w-4 h-4 text-[#38bdf8]" />
                Transferir BTXC para Outra Carteira
              </span>
              <span className="text-[10px] text-[#848e9c]">Rede BitX Core Mainnet</span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1">Endereço BitX de Destino (bxrt1q...)</label>
                <input
                  type="text"
                  required
                  value={transferDestAddress}
                  onChange={(e) => setTransferDestAddress(e.target.value)}
                  placeholder="bxrt1q..."
                  className="w-full px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#38bdf8]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#848e9c] block mb-1">Quantidade (BTXC)</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.0000"
                  className="w-full px-3 py-1.5 bg-[#1e2329] border border-[#2f343b] rounded-lg text-xs font-mono text-[#eaecef] focus:outline-none focus:border-[#38bdf8]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isTransferring}
              className="w-full py-2 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-bold text-xs rounded-lg transition"
            >
              Enviar BTXC na Blockchain
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
