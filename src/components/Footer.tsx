import React, { useState } from 'react';
import { X, ShieldCheck, Lock, FileText } from 'lucide-react';

export const Footer: React.FC = () => {
  const [modalContent, setModalContent] = useState<{
    title: string;
    text: string;
    icon: 'lgpd' | 'security' | 'compliance';
  } | null>(null);

  const openLgpdModal = () => {
    setModalContent({
      title: 'Política de Privacidade (LGPD)',
      icon: 'lgpd',
      text: `A Engecema Engenharia Fomento e Tecnologia Ltda (CNPJ: 05.368.602/0001-10) valoriza e respeita a privacidade de todos os seus clientes e usuários da plataforma Global Exchange.

1. Conformidade Legal:
Nosso tratamento de dados é regido estritamente pelas disposições da Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018).

2. Finalidade da Coleta:
Os dados cadastrais (Nome/Razão Social, CPF/CNPJ, E-mail institucional) são coletados única e exclusivamente para:
- Validação de titularidade e abertura de conta de custódia e negociação;
- Cumprimento de obrigações regulatórias junto ao Banco Central do Brasil e Banco do Brasil para liquidação via Pix;
- Emissão de comprovantes oficiais auditáveis (TXID).

3. Armazenamento e Retenção:
Os dados são armazenados sob rígidos protocolos criptográficos. Em hipótese alguma compartilhamos, vendemos ou transferimos informações de clientes para terceiros sem autorização prévia expressa ou ordem judicial cabível.

4. Direitos do Titular:
O cliente pode a qualquer momento consultar seus dados cadastrais, solicitar correções ou esclarecimentos através do canal oficial de compliance.`,
    });
  };

  const openSecurityModal = () => {
    setModalContent({
      title: 'Segurança da Informação',
      icon: 'security',
      text: `A Global Exchange adota os mais rigorosos padrões da indústria financeira e de ativos digitais para proteção de integridade e confidencialidade.

1. Autenticação e Criptografia:
- Certificação digital mTLS (Mutual Transport Layer Security) integrada aos servidores oficiais do Banco do Brasil;
- Criptografia ponta a ponta em todas as requisições de API e sessões administrativas;
- Hash criptográfico de validação para cada operação realizada.

2. Chaves de Transação Auditáveis (TXID):
Toda movimentação financeira, transferência de custódia, compra/venda ou aporte de liquidez gera uma chave criptográfica imutável (TXID) no padrão 0x..., permitindo conferência matemática e auditoria integral da rede.

3. Custódia Segura e Isolamento:
Os saldos de custódia são mantidos de forma estritamente individualizada e reconciliados em tempo real com as contas de liquidação da Engecema.`,
    });
  };

  const openComplianceModal = () => {
    setModalContent({
      title: 'Termos de Uso e Compliance',
      icon: 'compliance',
      text: `Termos de Uso e Governança Institucional da Global Exchange (Engecema Engenharia Fomento e Tecnologia Ltda):

1. Objeto e Custódia:
A Global Exchange provê infraestrutura tecnológica de negociação de ativos digitais, custódia e liquidação integrada via Pix Banco do Brasil. O saldo em custódia reflete estritamente as transferências e ordens efetivamente realizadas pelo cliente titular.

2. Regras de Negociação:
- Todas as ordens de compra e venda são registradas no livro de ofertas (Order Book);
- A execução de ordens de venda exige saldo correspondente disponível em custódia;
- Os depósitos via Pix BB geram QR Code no padrão EMV oficial do Banco Central do Brasil.

3. Compliance e Prevenção à Fraude:
A plataforma segue as diretrizes do Banco Central do Brasil para combate à lavagem de dinheiro (PLD-FT), monitoramento de transações atípicas e integridade corporativa.`,
    });
  };

  return (
    <>
      <footer className="bg-[#080a0d] border-t border-[#2f343b] py-6 px-4 text-center text-xs text-[#848e9c] mt-auto">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-3">
          {/* Identificação Corporativa Exata */}
          <div className="space-y-1.5">
            <p className="font-semibold text-[#eaecef] text-xs tracking-wide">
              Engecema Engenharia Fomento e Tecnologia Ltda &nbsp;|&nbsp; CNPJ: 05.368.602/0001-10
            </p>
            <p className="text-[#848e9c] text-xs">
              Rua José de Moraes Rêgo, 1299, Centro - Campinas do Piauí - PI &nbsp;|&nbsp; CEP 64703-000
            </p>
          </div>

          {/* Links Institucionais Solicitados */}
          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 pt-3 border-t border-[#1c2127] text-xs font-semibold">
            <button
              onClick={openLgpdModal}
              className="text-[#02c076] hover:text-[#00ff88] transition hover:underline"
            >
              Política de Privacidade (LGPD)
            </button>
            <span className="text-[#3a414b] hidden sm:inline">•</span>
            <button
              onClick={openSecurityModal}
              className="text-[#02c076] hover:text-[#00ff88] transition hover:underline"
            >
              Segurança da Informação
            </button>
            <span className="text-[#3a414b] hidden sm:inline">•</span>
            <button
              onClick={openComplianceModal}
              className="text-[#02c076] hover:text-[#00ff88] transition hover:underline"
            >
              Termos de Uso e Compliance
            </button>
          </div>
        </div>
      </footer>

      {/* Modal Institucional Informativo */}
      {modalContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#1e2329] border border-[#474d57] rounded-xl max-w-lg w-full p-6 text-[#eaecef] shadow-2xl relative">
            <button
              onClick={() => setModalContent(null)}
              className="absolute top-4 right-4 text-[#848e9c] hover:text-white p-1 rounded"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              {modalContent.icon === 'lgpd' && (
                <FileText className="w-5 h-5 text-[#f0b90b]" />
              )}
              {modalContent.icon === 'security' && (
                <Lock className="w-5 h-5 text-[#02c076]" />
              )}
              {modalContent.icon === 'compliance' && (
                <ShieldCheck className="w-5 h-5 text-[#38bdf8]" />
              )}
              <h3 className="text-base font-bold text-[#f0b90b]">
                {modalContent.title}
              </h3>
            </div>

            <div className="text-xs text-[#b7bdc6] whitespace-pre-line leading-relaxed max-h-80 overflow-y-auto p-3.5 bg-[#0b0e11] rounded-lg border border-[#2f343b]">
              {modalContent.text}
            </div>

            <div className="mt-4 pt-3 border-t border-[#2f343b] flex justify-between items-center text-[11px] text-[#848e9c]">
              <span>Engecema Engenharia • CNPJ: 05.368.602/0001-10</span>
              <button
                type="button"
                onClick={() => setModalContent(null)}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
