import React from 'react';
import { Movement } from '../types/exchange';
import { PIX_BB_CONFIG } from '../services/pixBB';
import { X, CheckCircle2, Printer, ShieldCheck } from 'lucide-react';

interface ReceiptModalProps {
  movement: Movement | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  movement,
  onClose,
}) => {
  if (!movement) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-[#1e2329] border border-[#474d57] rounded-xl max-w-lg w-full p-6 text-[#eaecef] shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#848e9c] hover:text-white p-1 rounded"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center pb-4 border-b border-[#2f343b] mb-4">
          <div className="text-lg font-bold text-[#f0b90b] tracking-wider">
            GX GLOBAL EXCHANGE
          </div>
          <div className="text-xs text-[#848e9c]">
            Comprovante Oficial de Operação Auditável
          </div>
          {movement.status === 'ESTORNADO' || movement.bankStatus === 'ESTORNADO_CUSTODIA' ? (
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#38bdf8] mt-2 bg-[#38bdf8]/10 px-2.5 py-0.5 rounded border border-[#38bdf8]/30">
              <ShieldCheck className="w-3.5 h-3.5 text-[#38bdf8]" />
              Status: SAQUE ESTORNADO PARA A CUSTÓDIA (SALDO DEVOLVIDO)
            </div>
          ) : movement.type === 'ESTORNO DE SAQUE' ? (
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#02c076] mt-2 bg-[#02c076]/10 px-2.5 py-0.5 rounded border border-[#02c076]/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#02c076]" />
              Status: CRÉDITO DE ESTORNO LIQUIDADO NA CUSTÓDIA
            </div>
          ) : movement.type === 'SAQUE BANCÁRIO' || movement.type === 'TRANSFERÊNCIA PIX BB' ? (
            movement.bankStatus === 'LIQUIDADO_BANCO_DO_BRASIL' || movement.status === 'CONFIRMADO' ? (
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#02c076] mt-2 bg-[#02c076]/10 px-2.5 py-0.5 rounded border border-[#02c076]/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Status: LIQUIDADO NO BANCO DO BRASIL
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#f0b90b] mt-2 bg-[#f0b90b]/10 px-2.5 py-0.5 rounded border border-[#f0b90b]/30">
                <ShieldCheck className="w-3.5 h-3.5 text-[#f0b90b]" />
                Status: DÉBITO EM CUSTÓDIA • AGUARDANDO LIBERAÇÃO NO GERENCIADOR BB PJ
              </div>
            )
          ) : (
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#02c076] mt-2 bg-[#02c076]/10 px-2.5 py-0.5 rounded border border-[#02c076]/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Status: CONFIRMADO NA REDE
            </div>
          )}
        </div>

        <div className="space-y-3 text-xs leading-relaxed">
          <div className="p-3 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
            <span className="text-[#848e9c] block text-[11px] mb-1">
              Chave Criptográfica Única de Transação (TXID):
            </span>
            <code className="text-[#f0b90b] font-mono break-all text-[11px] font-bold block">
              {movement.txid}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[#848e9c] block text-[11px]">Data e Horário:</span>
              <strong className="text-white">
                {new Date(movement.createdAt).toLocaleString('pt-BR')}
              </strong>
            </div>
            <div>
              <span className="text-[#848e9c] block text-[11px]">Tipo de Operação:</span>
              <strong className="text-white uppercase">{movement.type}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[#848e9c] block text-[11px]">Titular da Conta:</span>
              <strong className="text-white">{movement.clientName || movement.clientEmail}</strong>
            </div>
            <div>
              <span className="text-[#848e9c] block text-[11px]">Valor da Operação:</span>
              <strong className="text-[#02c076] font-mono text-sm">
                {movement.currency === 'BRL' || movement.type === 'DEPÓSITO PIX' || movement.type === 'SAQUE BANCÁRIO' || movement.type === 'TRANSFERÊNCIA PIX BB' ? 'R$' : 'GX'}{' '}
                {movement.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          <div>
            <span className="text-[#848e9c] block text-[11px]">Descrição Completa:</span>
            <p className="bg-[#0b0e11] p-2.5 rounded border border-[#2f343b] text-white">
              {movement.description}
            </p>
          </div>

          {movement.recipient && (
            <div>
              <span className="text-[#848e9c] block text-[11px]">Destinatário Registrado:</span>
              <code className="text-[#38bdf8] bg-[#0b0e11] px-2 py-1 rounded border border-[#2f343b] block">
                {movement.recipient}
              </code>
            </div>
          )}

          {movement.endToEndId && (
            <div>
              <span className="text-[#848e9c] block text-[11px]">Identificador Bacen EndToEnd ID:</span>
              <code className="text-[#02c076] bg-[#0b0e11] px-2 py-1 rounded border border-[#2f343b] block font-mono text-[11px]">
                {movement.endToEndId}
              </code>
            </div>
          )}

          {movement.status === 'ESTORNADO' || movement.bankStatus === 'ESTORNADO_CUSTODIA' ? (
            <div className="p-2.5 bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded text-[11px] text-[#eaecef] leading-relaxed">
              <strong className="text-[#38bdf8] block mb-0.5">Nota de Estorno da Custódia:</strong>
              Esta ordem de saque foi estornada. O valor integral de R$ {movement.value.toFixed(2)} foi restituído de imediato para o Saldo Real com Liquidez do cliente. {movement.note || ''}
            </div>
          ) : (movement.type === 'SAQUE BANCÁRIO' || movement.type === 'TRANSFERÊNCIA PIX BB') && movement.bankStatus !== 'LIQUIDADO_BANCO_DO_BRASIL' && movement.status !== 'CONFIRMADO' ? (
            <div className="p-2.5 bg-[#f0b90b]/10 border border-[#f0b90b]/30 rounded text-[11px] text-[#eaecef] leading-relaxed">
              <strong className="text-[#f0b90b] block mb-0.5">Nota Operacional Banco do Brasil (Alçada Corporativa):</strong>
              O montante foi debitado em custódia na Global Exchange. O envio físico dos recursos para a conta bancária do favorecido aguarda a liquidação pelo operador no Gerenciador Financeiro BB PJ ou transmissão direta. Caso deseje, você pode solicitar o estorno imediato no painel de custódia.
            </div>
          ) : null}

          <div className="pt-2 border-t border-[#2f343b] flex items-center justify-between text-[11px] text-[#848e9c]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#f0b90b]" />
              Custódia Engecema (CNPJ {PIX_BB_CONFIG.formattedCnpj})
            </span>
            <span>Campinas do Piauí - PI</span>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-[#2f343b] flex gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-[#2b3139] hover:bg-[#353c46] text-white font-semibold text-xs rounded transition flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-[#f0b90b]" />
            Imprimir Comprovante
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
