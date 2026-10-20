-- ==============================================================================
-- GLOBAL EXCHANGE & BITX CORE BLOCKCHAIN - SCRIPT CORRETIVO PARA O SUPABASE
-- Resolve travamentos de sincronização, permissões de RLS e chaves estrangeiras.
-- ==============================================================================

-- 1. Criação / Ajuste da Tabela de Clientes
create table if not exists public.clients (
	id text primary key,
	email text not null unique,
	name text not null default '',
	document text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Remove a restrição rígida de caixa baixa se existir (evita falha em e-mails com maiúsculas na sincronização)
alter table public.clients drop constraint if exists clients_email_lowercase;

-- 2. Criação / Ajuste da Tabela de Movimentações
create table if not exists public.movements (
	id text primary key,
	client_id text not null,
	type text not null,
	description text not null default '',
	value numeric(24, 8) not null default 0 check (value >= 0),
	created_at timestamptz not null default now()
);

-- Ajusta a chave estrangeira para ON DELETE CASCADE (permite zeramento de clientes sem travar o banco)
alter table public.movements drop constraint if exists movements_client_id_fkey;
alter table public.movements 
	add constraint movements_client_id_fkey 
	foreign key (client_id) 
	references public.clients (id) 
	on update cascade 
	on delete cascade;

-- 3. Criação / Ajuste da Tabela de Transações Financeiras (Livro Razão / Ledger)
create table if not exists public.financial_transactions (
	id text primary key,
	type text not null,
	description text not null default '',
	value numeric(18, 2) not null default 0 check (value >= 0),
	transaction_date date not null default current_date,
	created_at timestamptz not null default now()
);

-- Permite valor 0.00 (ajustes de zeramento e liquidação de custódia)
alter table public.financial_transactions drop constraint if exists financial_transactions_value_check;
alter table public.financial_transactions 
	add constraint financial_transactions_value_check check (value >= 0);

-- 4. Índices para Alta Performance
create index if not exists movements_client_created_at_idx
	on public.movements (client_id, created_at desc);

create index if not exists financial_transactions_date_idx
	on public.financial_transactions (transaction_date desc, created_at desc);

-- 5. CORREÇÃO CRÍTICA DO RLS (Row Level Security):
-- O script anterior habilitou o RLS sem políticas, bloqueando 100% das sincronizações da API / BitX Core.
-- As regras abaixo liberam o acesso para as operações de sincronização autorizadas:

alter table public.clients enable row level security;
alter table public.movements enable row level security;
alter table public.financial_transactions enable row level security;

-- Remove políticas antigas se existirem
drop policy if exists "Permitir tudo para service_role e anon clients" on public.clients;
drop policy if exists "Permitir tudo para service_role e anon movements" on public.movements;
drop policy if exists "Permitir tudo para service_role e anon financial_transactions" on public.financial_transactions;

-- Cria políticas universais permitindo sincronização via API Gateway e chave anon/service_role
create policy "Permitir tudo para service_role e anon clients"
	on public.clients
	for all
	using (true)
	with check (true);

create policy "Permitir tudo para service_role e anon movements"
	on public.movements
	for all
	using (true)
	with check (true);

create policy "Permitir tudo para service_role e anon financial_transactions"
	on public.financial_transactions
	for all
	using (true)
	with check (true);
