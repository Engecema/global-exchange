import React, { useState, useEffect } from 'react';
import { Movement, User } from '../types/exchange';
import { StorageService } from '../services/storage';
import { Zap, Banknote, Coins, CheckCircle2 } from 'lucide-react';

interface OrderFormProps {
  currentUser: User;
  custodyBalance: number;
  custodyBrlBalance?: number;
  launchPrice?: string;
  onOrderSuccess: (movement: Movement, newBalance: number) => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({
  currentUser,
  custodyBalance,
  custodyBrlBalance = 0,
  launchPrice,
  onOrderSuccess,
}) => {
  const [side, setSide] = useState<'BUY' | 'SELL'>('SELL');
  const defaultPrice = launchPrice || StorageService.getLaunchPrice() || '420087.14';
  const [price, setPrice] = useState(defaultPrice);
  const [amount, setAmount] = useState('1.0000');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (launchPrice) {
      setPrice(launchPrice);
    }
  }, [launchPrice]);

  const numPrice = parseFloat(price) || 0;
  const numAmount = parseFloat(amount) || 0;
  const total = numPrice * numAmount;
  const currentLiquidBrl = typeof custodyBrlBalance === 'number' && Number.isFinite(custodyBrlBalance)
    ? custodyBrlBalance
    : StorageService.getCustodyBrlBalance(currentUser.email);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (numPrice <= 0 || numAmount <= 0) {
      setErrorMsg('Preço e quantidade devem ser maiores que zero.');
      return;
    }

    if (side === 'SELL') {
      if (numAmount > custodyBalance) {
        setErrorMsg(
          `Saldo insuficiente para venda de ${numAmount.toFixed(4)} GX. Saldo atual em custódia: ${custodyBalance.toFixed(2)} GX.`
        );
        return;
      }
    } else if (side === 'BUY') {
      if (currentLiquidBrl < total) {
        setErrorMsg(
          `Saldo Real com Liquidez insuficiente para compra. Você possui R$ ${currentLiquidBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de liquidez e o total é R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Deposite via Pix para aumentar seu saldo.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const type = side === 'BUY' ? 'COMPRA' : 'VENDA';
      const newBalance = side === 'BUY' ? custodyBalance + numAmount : Math.max(0, custodyBalance - numAmount);

      // Save new custody balance for this client
      StorageService.setCustodyBalance(currentUser.email, newBalance);

      const usdRate = StorageService.getUsdBrlRate() || 5.70;

      // Record movement in history
      const movement = StorageService.addMovement({
        clientId: currentUser.id,
        clientEmail: currentUser.email,
        clientName: currentUser.name || currentUser.email,
        type,
        description: side === 'SELL'
          ? `VENDA: ${numAmount.toFixed(4)} GX a R$ ${numPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} → Gerado Saldo com Liquidez de R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ($ ${(total / usdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT) para Saque Pix`
          : `COMPRA: ${numAmount.toFixed(4)} GX a R$ ${numPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Débito de Liquidez: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
        value: total,
        currency: 'BRL',
        cryptoAmount: numAmount,
      });

      // Se for venda de GX, credita a liquidação em Reais (R$) e Dólares (USDT) no saldo de custódia para saque Pix
      if (side === 'SELL') {
        const curBrl = StorageService.getCustodyBrlBalance(currentUser.email);
        const newBrl = curBrl + total;
        StorageService.setCustodyBrlBalance(currentUser.email, newBrl);
        const curUsdt = StorageService.getCustodyUsdtBalance(currentUser.email);
        const newUsdt = Number((curUsdt + (total / usdRate)).toFixed(2));
        StorageService.setCustodyUsdtBalance(currentUser.email, newUsdt);

        StorageService.addLedgerEntry({
          type: 'Venda a Mercado (Liquidez Pix)',
          counterparty: `${currentUser.name || currentUser.email} -> Mercado Global Exchange`,
          amountGx: -numAmount,
          amountBrl: total,
          amountUsdt: Number((total / usdRate).toFixed(2)),
          txid: movement.txid,
          status: 'Confirmado e Liquidado',
          beneficiaryEmail: currentUser.email,
          notes: 'Venda executada no formulário de boletas gerando liquidez em R$ e USDT para saque Pix',
        });
      } else if (side === 'BUY') {
        const curBrl = StorageService.getCustodyBrlBalance(currentUser.email);
        if (curBrl >= total) {
          const newBrl = curBrl - total;
          StorageService.setCustodyBrlBalance(currentUser.email, newBrl);
          const newUsdt = Number((newBrl / usdRate).toFixed(2));
          StorageService.setCustodyUsdtBalance(currentUser.email, newUsdt);
        }
      }

      StorageService.syncBalancesToBackend(currentUser.email);

      setSuccessMsg(
        side === 'SELL'
          ? `✅ Venda executada com sucesso! R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ($ ${(total / usdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT) creditados no seu SALDO REAL COM LIQUIDEZ. Pronto para saque Pix!`
          : `✅ Ordem de COMPRA executada! ${numAmount.toFixed(4)} GX adicionados à sua custódia.`
      );
      setIsSubmitting(false);
      onOrderSuccess(movement, newBalance);
    }, 350);
  };

  return (
    <section className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4">
          <h3 className="text-base font-bold text-[#f0b90b]">
            Formulário de Boletas (BTXC / GX)
          </h3>
          <span className="text-[11px] text-[#38bdf8] font-mono font-semibold">
            Cotação BitX Core: R$ {numPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Buy / Sell buttons */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setSide('BUY');
              setErrorMsg('');
            }}
            className={`py-2 rounded font-bold text-xs sm:text-sm transition ${
              side === 'BUY'
                ? 'bg-[#02c076] text-white shadow'
                : 'bg-[#163d31] text-[#02c076] border border-[#02c076]/40 hover:bg-[#163d31]/80'
            }`}
          >
            COMPRA (Adquirir GX)
          </button>
          <button
            type="button"
            onClick={() => {
              setSide('SELL');
              setErrorMsg('');
            }}
            className={`py-2 rounded font-bold text-xs sm:text-sm transition ${
              side === 'SELL'
                ? 'bg-[#cf304a] text-white shadow font-extrabold ring-1 ring-[#cf304a]/60'
                : 'bg-[#3f2025] text-[#cf304a] border border-[#cf304a]/40 hover:bg-[#3f2025]/80'
            }`}
          >
            VENDA (Gerar Liquidez em R$)
          </button>
        </div>

        {side === 'SELL' ? (
          <div className="mb-3 p-2.5 bg-[#02c076]/10 border border-[#02c076]/30 rounded text-xs text-[#02c076] flex items-start gap-1.5 leading-relaxed">
            <Zap className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Conversão em Saldo com Liquidez:</strong> Ao vender suas moedas GX, os Reais (R$) entram imediatamente no seu <strong>Saldo Real com Liquidez</strong>, ficando liberados para envio via Pix para a sua conta do Banco do Brasil!
            </span>
          </div>
        ) : (
          <div className="mb-3 p-2.5 bg-[#181a20] border border-[#2f343b] rounded text-xs text-[#b7bdc6] flex items-start gap-1.5 leading-relaxed">
            <Banknote className="w-4 h-4 shrink-0 text-[#f0b90b] mt-0.5" />
            <span>
              Saldo com Liquidez disponível para compras:{' '}
              <strong className="text-[#02c076] font-mono">
                R$ {currentLiquidBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-3 p-2.5 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-3 p-2.5 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs text-[#b7bdc6] mb-1 font-medium">
              Preço de Execução (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#f0b90b]"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-[#b7bdc6] font-medium">
                Quantidade (GX)
              </label>
              {side === 'SELL' && (
                <button
                  type="button"
                  onClick={() => setAmount(custodyBalance.toFixed(4))}
                  className="text-[11px] text-[#f0b90b] hover:underline font-mono"
                >
                  Total: {custodyBalance.toFixed(4)} GX
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0000"
              className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#f0b90b]"
            />

            {/* Atalhos Rápidos de Quantidade (25%, 50%, 75%, 100%) */}
            {side === 'SELL' && custodyBalance > 0 && (
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => setAmount((custodyBalance * 0.25).toFixed(4))}
                  className="py-1 px-1 bg-[#0b0e11] hover:bg-[#2b3139] text-[#b7bdc6] hover:text-white border border-[#3a414b] rounded text-[10px] font-semibold transition"
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => setAmount((custodyBalance * 0.50).toFixed(4))}
                  className="py-1 px-1 bg-[#0b0e11] hover:bg-[#2b3139] text-[#b7bdc6] hover:text-white border border-[#3a414b] rounded text-[10px] font-semibold transition"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => setAmount((custodyBalance * 0.75).toFixed(4))}
                  className="py-1 px-1 bg-[#0b0e11] hover:bg-[#2b3139] text-[#b7bdc6] hover:text-white border border-[#3a414b] rounded text-[10px] font-semibold transition"
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(custodyBalance.toFixed(4))}
                  className="py-1 px-1 bg-[#0b0e11] hover:bg-[#2b3139] text-[#02c076] hover:text-[#02c076] border border-[#02c076]/40 rounded text-[10px] font-bold transition"
                >
                  100%
                </button>
              </div>
            )}
          </div>

          <div className="p-2.5 bg-[#0b0e11] rounded border border-[#2f343b] text-xs flex justify-between items-center">
            <span className="text-[#848e9c]">
              {side === 'SELL' ? 'Liquidez a Gerar em Reais (R$):' : 'Custo Total Estimado:'}
            </span>
            <span className="font-mono font-bold text-[#02c076] text-sm">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3 rounded font-extrabold text-sm transition shadow mt-2 ${
              side === 'BUY'
                ? 'bg-[#02c076] hover:bg-[#02a766] text-black font-black'
                : 'bg-[#cf304a] hover:bg-[#b02239] text-white font-black'
            }`}
          >
            {isSubmitting
              ? 'Processando ordem...'
              : side === 'BUY'
              ? 'Enviar Ordem de COMPRA'
              : 'Executar VENDA e Gerar Saldo com Liquidez (R$)'}
          </button>
        </form>
      </div>

      <div className="mt-4 pt-3 border-t border-[#2f343b] text-[11px] text-[#848e9c] flex flex-wrap justify-between items-center gap-1">
        <span>Custódia de moedas disponível:</span>
        <strong className="text-white font-mono">{custodyBalance.toFixed(4)} GX</strong>
      </div>
    </section>
  );
};
