import React, { useState } from 'react';
import { OrderBookItem } from '../types/exchange';
import { ArrowUpRight, Zap, CheckCircle2, DollarSign, ArrowRightLeft, MousePointerClick } from 'lucide-react';
import { StorageService } from '../services/storage';

interface OrderBookProps {
  currentPrice: string;
  asks?: OrderBookItem[];
  bids?: OrderBookItem[];
  onSelectOrder?: (order: { side: 'BUY' | 'SELL'; price: number; amount: number }) => void;
}

export const OrderBook: React.FC<OrderBookProps> = ({
  currentPrice,
  asks,
  bids,
  onSelectOrder,
}) => {
  const [currencyMode, setCurrencyMode] = useState<'BRL' | 'USDT'>('BRL');
  const usdRate = StorageService.getUsdBrlRate() || 5.43;
  const numericPrice = parseFloat(currentPrice) || 438819.34;

  const activeAsks: OrderBookItem[] = asks || [
    { price: numericPrice * 1.005, amount: 1.2500, total: numericPrice * 1.005 * 1.2500 },
    { price: numericPrice * 1.0025, amount: 2.1000, total: numericPrice * 1.0025 * 2.1000 },
    { price: numericPrice * 1.001, amount: 0.8500, total: numericPrice * 1.001 * 0.8500 },
  ];
  const activeBids: OrderBookItem[] = bids || [
    { price: numericPrice * 0.9995, amount: 3.0000, total: numericPrice * 0.9995 * 3.0000 },
    { price: numericPrice * 0.999, amount: 1.5000, total: numericPrice * 0.999 * 1.5000 },
    { price: numericPrice * 0.9975, amount: 3.2000, total: numericPrice * 0.9975 * 3.2000 },
    { price: numericPrice * 0.995, amount: 1.1000, total: numericPrice * 0.995 * 1.1000 },
  ];

  const formatPrice = (p: number) => {
    if (currencyMode === 'USDT') {
      const pUsd = p / usdRate;
      return `$ ${pUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `R$ ${p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatTotal = (t: number) => {
    if (currencyMode === 'USDT') {
      const tUsd = t / usdRate;
      return `$ ${tUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `R$ ${t.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <section className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5 shadow-lg">
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#2f343b] mb-4 gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-[#f0b90b]">
            Livro de Ofertas (Order Book)
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 font-bold hidden sm:inline">
            Liquidez Mainnet
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternador de Moeda: BRL / USDT */}
          <div className="flex bg-[#0b0e11] p-0.5 rounded-lg border border-[#2f343b] text-[10px] font-mono font-bold">
            <button
              type="button"
              onClick={() => setCurrencyMode('BRL')}
              className={`px-2 py-1 rounded transition ${
                currencyMode === 'BRL'
                  ? 'bg-[#02c076] text-black shadow'
                  : 'text-[#848e9c] hover:text-[#eaecef]'
              }`}
            >
              R$ BRL
            </button>
            <button
              type="button"
              onClick={() => setCurrencyMode('USDT')}
              className={`px-2 py-1 rounded transition ${
                currencyMode === 'USDT'
                  ? 'bg-[#38bdf8] text-black shadow'
                  : 'text-[#848e9c] hover:text-[#eaecef]'
              }`}
            >
              $ USDT
            </button>
          </div>

          <span className="text-xs px-2.5 py-1 rounded bg-[#2b3139] text-[#38bdf8] font-mono font-bold border border-[#38bdf8]/30">
            BTXC / {currencyMode}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#848e9c] mb-2 px-1">
        <span className="flex items-center gap-1">
          <MousePointerClick className="w-3 h-3 text-[#f0b90b]" />
          Clique em qualquer oferta para preencher a boleta
        </span>
        <span className="font-mono text-[10px]">
          1 USD = R$ {usdRate.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-3 text-xs font-bold text-[#848e9c] pb-2 border-b border-[#2f343b]/60">
        <span>Preço ({currencyMode})</span>
        <span className="text-right">Quantidade</span>
        <span className="text-right">Total ({currencyMode})</span>
      </div>

      {/* Asks (Sell orders - Red: Clicking opens BUY in OrderForm) */}
      <div className="space-y-1.5 py-3">
        {activeAsks.map((ask, idx) => (
          <div
            key={`ask-${idx}`}
            onClick={() => onSelectOrder?.({ side: 'BUY', price: ask.price, amount: ask.amount })}
            className="grid grid-cols-3 text-xs font-mono text-[#cf304a] hover:bg-[#cf304a]/15 py-1 px-1 rounded transition cursor-pointer group"
            title="Clique para COMPRAR esta oferta de venda na boleta"
          >
            <span className="font-semibold flex items-center gap-1">
              <span className="text-[10px] text-[#848e9c] group-hover:text-white">venda</span>
              {formatPrice(ask.price)}
            </span>
            <span className="text-right text-[#eaecef] group-hover:text-white font-bold">{ask.amount.toFixed(4)}</span>
            <span className="text-right text-[#848e9c] group-hover:text-[#eaecef]">{formatTotal(ask.total)}</span>
          </div>
        ))}
      </div>

      {/* Central price ticker */}
      <div className="my-2 py-2.5 px-3 bg-[#0b0e11] rounded border border-[#2f343b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold font-mono text-[#02c076] flex items-center">
            {formatPrice(numericPrice)} <ArrowUpRight className="w-4 h-4 ml-0.5" />
          </span>
          <span className="text-[11px] text-[#848e9c]">Cotação BitX Core (#348.912)</span>
        </div>
        <span className="text-xs font-bold text-[#02c076] bg-[#02c076]/10 px-2 py-0.5 rounded border border-[#02c076]/20">
          +0.42%
        </span>
      </div>

      {/* Bids (Buy orders - Green: Clicking opens SELL in OrderForm) */}
      <div className="space-y-1.5 py-3">
        {activeBids.map((bid, idx) => {
          const isMempool3 = bid.amount === 3.0;
          const isSettled15 = bid.amount === 1.5;

          return (
            <div
              key={`bid-${idx}`}
              onClick={() => onSelectOrder?.({ side: 'SELL', price: bid.price, amount: bid.amount })}
              className={`grid grid-cols-3 text-xs font-mono text-[#02c076] py-1 px-1 rounded transition items-center cursor-pointer group ${
                isMempool3
                  ? 'bg-[#02c076]/15 border border-[#02c076]/40 shadow-sm hover:bg-[#02c076]/25'
                  : isSettled15
                  ? 'bg-[#f0b90b]/10 border border-[#f0b90b]/30 hover:bg-[#f0b90b]/20'
                  : 'hover:bg-[#02c076]/15'
              }`}
              title="Clique para VENDER para esta oferta de compra na boleta"
            >
              <span className="font-semibold flex items-center gap-1.5">
                {formatPrice(bid.price)}
                {isMempool3 && (
                  <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-[#02c076]/30 text-[#02c076] border border-[#02c076]/50 font-bold hidden sm:inline flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5" />
                    Mempool
                  </span>
                )}
                {isSettled15 && (
                  <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/40 font-bold hidden sm:inline">
                    Liquidado
                  </span>
                )}
              </span>
              <span className="text-right text-[#eaecef] group-hover:text-white font-bold">
                {bid.amount.toFixed(4)}
                {isMempool3 && (
                  <span className="text-[10px] text-[#02c076] ml-1 font-bold">★</span>
                )}
                {isSettled15 && (
                  <span className="text-[10px] text-[#f0b90b] ml-1 font-bold">★</span>
                )}
              </span>
              <span className="text-right text-[#848e9c] group-hover:text-[#eaecef]">{formatTotal(bid.total)}</span>
            </div>
          );
        })}
      </div>

      {/* Audit Banners for 3.0000 BTXC Mempool & 1.5000 GX Settled Orders */}
      <div className="mt-2 pt-2.5 border-t border-[#2f343b] space-y-1.5 text-[11px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[#02c076]">
          <span className="flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-[#02c076] animate-pulse"></span>
            Nova transferência 3.0000 BTXC liquidada da Mempool (Bloco #348.912)
          </span>
          <span className="font-mono text-[#02c076] text-[10px] font-bold bg-[#02c076]/10 px-1.5 py-0.5 rounded border border-[#02c076]/30">
            TXID: 0x8f3a1d94e2b0...
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[#848e9c]">
          <span className="flex items-center gap-1.5 text-[#f0b90b]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f0b90b]"></span>
            Ordem 1.5000 GX liquidada em custódia (Livro de Ofertas)
          </span>
          <span className="font-mono text-[#38bdf8] text-[10px]">
            TXID: 0x5d8e24c1f90a...
          </span>
        </div>
      </div>
    </section>
  );
};
