# Global Exchange (GX) - Plataforma de Negociação e Custódia

Plataforma de alta performance para negociação de ativos digitais, custódia e liquidação Pix Banco do Brasil da **Engecema Engenharia Fomento e Tecnologia Ltda** (CNPJ: `05.368.602/0001-10`).

Reescrita integralmente em **React 19 + TypeScript + Vite + Tailwind CSS**.

---

## 🚀 Melhorias e Resoluções Implementadas

1. **Painel de Custódia Baseado em Movimentações Reais:**
   - O saldo inicial padrão de 1000,00 GX foi removido.
   - O saldo da custódia inicia estritamente em `0,00 GX` para novos clientes e reflete exatamente as transações realizadas (depósitos via Pix BB, compras, vendas, transferências ou ajustes de custódia com auditoria).

2. **Histórico Geral de Transações Limpo:**
   - As transações fictícias foram eliminadas.
   - O livro de registros inicia limpo e passa a exibir as operações em tempo real conforme são executadas pelo cliente autenticado.
   - Cada operação gera uma Chave Única de Transação (TXID) no formato criptográfico `0x...`, com emissão de comprovante oficial e busca por TXID.

3. **Prontidão para Transações Reais via Banco do Brasil Pix:**
   - Integração com a infraestrutura do Banco do Brasil em Produção.
   - Geração de QR Code e Copia e Cola no padrão oficial EMV (Bacen / Banco Central) associado à chave Pix CNPJ da Engecema (`05368602000110`).
   - Suporte e referência aos certificados mTLS oficiais do Banco do Brasil (`star_mtls_api_bb_com_br.crt` e Raiz DigiCert) presentes no projeto.
   - Diagnóstico em tempo real da conexão e dos endpoints oficiais (`oauth.bb.com.br` e `api-pix.bb.com.br`).

4. **Painel de Administração Limpo:**
   - A tabela de clientes agora inicia limpa, sem cadastros de teste.
   - Conforme clientes reais efetuam seu cadastro comercial no site, passam a ser listados na administração com acesso direto ao histórico de movimentações.

---

## 🛠️ Tecnologias

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, QRCode
- **Autenticação:** Sessão institucional com separação de perfis (Cliente e Administrador Geral)
- **Integração Pix:** Banco do Brasil (mTLS, OAuth 2.0 e EMV Copia e Cola)

## 💻 Como Rodar Localmente

```bash
npm install
npm run dev
```

Acesse em `http://localhost:3000`.
