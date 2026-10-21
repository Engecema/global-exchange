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
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. *(Opcional)* Se for operar a liquidação direta mTLS do BB em produção, configure as variáveis de ambiente:
   - `BB_CLIENT_ID`: Client ID da aplicação no Portal Developers BB
   - `BB_CLIENT_SECRET`: Client Secret da aplicação no Portal Developers BB
   - `BB_GW_APP_KEY`: Developer Application Key do BB
   - `BB_ENV`: `production` (ou `sandbox`)
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

---

## 🌉 Comunicação BitX Core (Blockchain) <-> Global Exchange no Render

Para que os clientes cadastrados na **Global Exchange** (como **Geoni Clementino Cesar de Matos** - `geonimatos42@gmail.com`) apareçam e sincronizem automaticamente no painel de configurações da **BitX Core**, configure as seguintes variáveis no **Render**:

### 1. No Web Service da Global Exchange (`Engecema/global-exchange`):
- `BITX_CORE_API_URL`: `https://bitx-core.onrender.com` (ou a URL do seu serviço da BitX Core no Render)
- `BITX_CORE_WEBHOOK_SECRET`: `bitx_sec_2026_gx` (token de segurança compartilhado)
- `GX_PUBLIC_URL`: `https://global-exchange.onrender.com`
- `USD_BRL_RATE`: `5.70`

### 2. No Web Service da BitX Core (`bitx-core`):
- `GLOBAL_EXCHANGE_URL`: `https://global-exchange.onrender.com`
- `GX_API_URL`: `https://global-exchange.onrender.com/api`
- `BITX_CORE_WEBHOOK_SECRET`: `bitx_sec_2026_gx`
- `USD_BRL_RATE`: `5.70`

### Endpoints da Ponte Integrada:
- `POST /api/bitx/add-client`: Recebe o cadastro de novos clientes e carteiras BitX Core.
- `GET /api/clients` e `GET /api/wallets`: Permite à BitX Core consultar todos os clientes e carteiras registradas na Global Exchange.
- `POST /api/bitx/force-sync`: Força a transmissão imediata de todos os clientes locais para a BitX Core.
- `GET /api/bitx/bridge-diagnostics`: Diagnóstico em tempo real da conexão entre os serviços.


