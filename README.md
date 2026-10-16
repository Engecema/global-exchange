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

---

## 🌐 Como Fazer o Deploy no Render (render.com)

O projeto agora está 100% preparado para deploy no Render com suporte automático via `render.yaml` ou configuração manual.

### Opção 1: Web Service (Node.js)
1. No painel do Render, clique em **New +** > **Web Service**.
2. Conecte o repositório GitHub.
3. Configure os seguintes campos:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. Clique em **Deploy Web Service**.

### Opção 2: Static Site (Site Estático - Gratuito e Instantâneo)
1. No painel do Render, clique em **New +** > **Static Site**.
2. Conecte o repositório GitHub.
3. Configure os seguintes campos:
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`
4. Na aba **Redirects/Rewrites**, adicione a regra de SPA:
   - **Type:** `Rewrite`
   - **Source:** `/*`
   - **Destination:** `/index.html`
5. Clique em **Create Static Site**.

### Opção 3: Deploy Automático via Blueprint
Se preferir, no Render clique em **New +** > **Blueprint** e selecione este repositório. O arquivo `render.yaml` já contém todas as instruções necessárias.

