import React from 'react';
import { OrderBookItem } from '../types/exchange';
import { ArrowUpRight } from 'lucide-react';

interface OrderBookProps {
  currentPrice: string;
  asks?: OrderBookItem[];
  bids?: OrderBookItem[];
}

export const OrderBook: React.FC<OrderBookProps> = ({
  currentPrice,
  asks,
  bids,
}) => {
  const numericPrice = parseFloat(currentPrice) || 420000.0;
  const activeAsks: OrderBookItem[] = asks || [
    { price: numericPrice * 1.005, amount: 1.2500, total: numericPrice * 1.005 * 1.2500 },
    { price: numericPrice * 1.0025, amount: 2.1000, total: numericPrice * 1.0025 * 2.1000 },
    { price: numericPrice * 1.001, amount: 0.8500, total: numericPrice * 1.001 * 0.8500 },
  ];
  const activeBids: OrderBookItem[] = bids || [
    { price: numericPrice * 0.999, amount: 1.5000, total: numericPrice * 0.999 * 1.5000 },
    { price: numericPrice * 0.9975, amount: 3.2000, total: numericPrice * 0.9975 * 3.2000 },
    { price: numericPrice * 0.995, amount: 1.1000, total: numericPrice * 0.995 * 1.1000 },
  ];

  return (
    <section className="bg-[#1e2329] border border-[#2f343b] rounded-lg p-5">
      <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4">
        <h3 className="text-base font-bold text-[#f0b90b]">
          Livro de Ofertas (Order Book)
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-[#2b3139] text-[#848e9c] font-mono">
          GX / BRL
        </span>
      </div>

      <div className="grid grid-cols-3 text-xs font-bold text-[#848e9c] pb-2 border-b border-[#2f343b]/60">
        <span>Preço (R$)</span>
        <span className="text-right">Quantidade</span>
        <span className="text-right">Total (R$)</span>
      </div>

      {/* Asks (Sell orders - Red) */}
      <div className="space-y-1.5 py-3">
        {activeAsks.map((ask, idx) => (
          <div
            key={`ask-${idx}`}
            className="grid grid-cols-3 text-xs font-mono text-[#cf304a] hover:bg-[#2b3139]/40 py-0.5 rounded transition"
          >
            <span className="font-semibold">{ask.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-right text-[#eaecef]">{ask.amount.toFixed(4)}</span>
            <span className="text-right text-[#848e9c]">{ask.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>

      {/* Central price ticker */}
      <div className="my-2 py-2.5 px-3 bg-[#0b0e11] rounded border border-[#2f343b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold font-mono text-[#02c076] flex items-center">
            R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <ArrowUpRight className="w-4 h-4 ml-0.5" />
          </span>
          <span className="text-[11px] text-[#848e9c]">Cotação Oficial</span>
        </div>
        <span className="text-xs font-bold text-[#02c076] bg-[#02c076]/10 px-2 py-0.5 rounded border border-[#02c076]/20">
          +0.0%
        </span>
      </div>

      {/* Bids (Buy orders - Green) */}
      <div className="space-y-1.5 py-3">
        {activeBids.map((bid, idx) => (
          <div
            key={`bid-${idx}`}
            className="grid grid-cols-3 text-xs font-mono text-[#02c076] hover:bg-[#2b3139]/40 py-0.5 rounded transition"
          >
            <span className="font-semibold">{bid.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-right text-[#eaecef]">{bid.amount.toFixed(4)}</span>
            <span className="text-right text-[#848e9c]">{bid.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
