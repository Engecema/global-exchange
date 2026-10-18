import React, { useState } from 'react';
import { Movement, User } from '../types/exchange';
import { StorageService } from '../services/storage';

interface OrderFormProps {
  currentUser: User;
  custodyBalance: number;
  onOrderSuccess: (movement: Movement, newBalance: number) => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({
  currentUser,
  custodyBalance,
  onOrderSuccess,
}) => {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState('100.00');
  const [amount, setAmount] = useState('1.0000');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const numPrice = parseFloat(price) || 0;
  const numAmount = parseFloat(amount) || 0;
  const total = numPrice * numAmount;

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
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const type = side === 'BUY' ? 'COMPRA' : 'VENDA';
      const newBalance = side === 'BUY' ? custodyBalance + numAmount : custodyBalance - numAmount;

      // Save new custody balance for this client
      StorageService.setCustodyBalance(currentUser.email, newBalance);

      // Se for venda de GX, credita a liquidação em Reais (R$) no saldo de custódia para saque Pix
      if (side === 'SELL') {
        const curBrl = StorageService.getCustodyBrlBalance(currentUser.email);
        StorageService.setCustodyBrlBalance(currentUser.email, curBrl + total);
      } else if (side === 'BUY') {
        const curBrl = StorageService.getCustodyBrlBalance(currentUser.email);
        if (curBrl >= total) {
          StorageService.setCustodyBrlBalance(currentUser.email, curBrl - total);
        }
      }

      // Record movement in history
      const movement = StorageService.addMovement({
        clientId: currentUser.id,
        clientEmail: currentUser.email,
        clientName: currentUser.name || currentUser.email,
        type,
        description: `${type}: ${numAmount.toFixed(4)} GX a ${numPrice.toFixed(2)} USDT`,
        value: total,
        currency: 'USDT',
      });

      setSuccessMsg(
        `Ordem de ${type} executada! TXID: ${movement.txid.slice(0, 10)}...`
      );
      setIsSubmitting(false);
      onOrderSuccess(movement, newBalance);
    }, 350);
  };

  return (
    <section className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5 flex flex-col justify-between">
      <div>
        <div className="pb-3 border-b border-[#2f343b] mb-4">
          <h3 className="text-base font-bold text-[#f0b90b]">
            Formulário de Boletas (GX)
          </h3>
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
            COMPRA
          </button>
          <button
            type="button"
            onClick={() => {
              setSide('SELL');
              setErrorMsg('');
            }}
            className={`py-2 rounded font-bold text-xs sm:text-sm transition ${
              side === 'SELL'
                ? 'bg-[#cf304a] text-white shadow'
                : 'bg-[#3f2025] text-[#cf304a] border border-[#cf304a]/40 hover:bg-[#3f2025]/80'
            }`}
          >
            VENDA
          </button>
        </div>

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
              Preço (USDT)
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
                  className="text-[11px] text-[#f0b90b] hover:underline"
                >
                  Máx: {custodyBalance.toFixed(2)} GX
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
          </div>

          <div className="p-2.5 bg-[#0b0e11] rounded border border-[#2f343b] text-xs flex justify-between items-center">
            <span className="text-[#848e9c]">Total Estimado:</span>
            <span className="font-mono font-bold text-white">
              {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3 rounded font-bold text-sm transition shadow mt-2 ${
              side === 'BUY'
                ? 'bg-[#02c076] hover:bg-[#02a766] text-white'
                : 'bg-[#cf304a] hover:bg-[#b02239] text-white'
            }`}
          >
            {isSubmitting
              ? 'Processando boleta...'
              : `Enviar Ordem de ${side === 'BUY' ? 'COMPRA' : 'VENDA'}`}
          </button>
        </form>
      </div>

      <div className="mt-4 pt-3 border-t border-[#2f343b] text-[11px] text-[#848e9c] flex justify-between">
        <span>Custódia disponível:</span>
        <strong className="text-white font-mono">{custodyBalance.toFixed(2)} GX</strong>
      </div>
    </section>
  );
};
