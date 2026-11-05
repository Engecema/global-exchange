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
	secondary_addresses text[] default '{}',
	bitx_address text default 'bxrt1qnkach2pvm79qljf5rxdg863utw4s0zey',
	btxc_balance numeric(24, 8) default 0,
	gx_balance numeric(24, 8) default 0,
	brl_balance numeric(18, 2) default 0,
	usdt_balance numeric(18, 2) default 0,
	status text default 'Verificado KYC (Completo)',
	title_badge text default 'Titular Principal',
	custody_txid text default '0x9891c2bfbee33952a01ce9a471b83d1e',
	estimated_market_value numeric(18, 2) default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Adiciona colunas se a tabela já existia
alter table public.clients add column if not exists secondary_addresses text[] default '{}';
alter table public.clients add column if not exists bitx_address text default 'bxrt1qnkach2pvm79qljf5rxdg863utw4s0zey';
alter table public.clients add column if not exists btxc_balance numeric(24, 8) default 0;
alter table public.clients add column if not exists gx_balance numeric(24, 8) default 0;
alter table public.clients add column if not exists brl_balance numeric(18, 2) default 0;
alter table public.clients add column if not exists usdt_balance numeric(18, 2) default 0;
alter table public.clients add column if not exists status text default 'Verificado KYC (Completo)';
alter table public.clients add column if not exists title_badge text default 'Titular Principal';
alter table public.clients add column if not exists custody_txid text default '0x9891c2bfbee33952a01ce9a471b83d1e';
alter table public.clients add column if not exists estimated_market_value numeric(18, 2) default 0;

-- Notifica o PostgREST para recarregar o schema cache imediatamente
notify pgrst, 'reload schema';

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

-- 5. BLINDAGEM DE SEGURANÇA DO RLS (Row Level Security - OWASP ASVS & Supabase Hardening)
-- Bloqueia mutações anônimas não autenticadas e garante que apenas o backend oficial (service_role) execute sincronizações gerais.

alter table public.clients enable row level security;
alter table public.movements enable row level security;
alter table public.financial_transactions enable row level security;

-- O acesso direto do browser é somente leitura e protegido pelas policies por usuário.
revoke all privileges on table public.clients, public.movements, public.financial_transactions from public, anon, authenticated;
grant select on table public.clients, public.movements to authenticated;

-- Concede privilégios plenos exclusivamente à role 'service_role' (usada pela API Gateway segura)
grant all on public.clients to service_role;
grant all on public.movements to service_role;
grant all on public.financial_transactions to service_role;

-- Remove políticas legadas excessivamente permissivas
do $$
declare
	existing_policy record;
begin
	for existing_policy in
		select policyname, tablename
		from pg_policies
		where schemaname = 'public'
		  and tablename in ('clients', 'movements', 'financial_transactions')
	loop
		execute format('drop policy %I on public.%I', existing_policy.policyname, existing_policy.tablename);
	end loop;
end;
$$;

drop policy if exists "Permitir tudo para service_role e anon clients" on public.clients;
drop policy if exists "Permitir tudo para service_role e anon movements" on public.movements;
drop policy if exists "Permitir tudo para service_role e anon financial_transactions" on public.financial_transactions;
drop policy if exists "service_role_full_clients" on public.clients;
drop policy if exists "service_role_full_movements" on public.movements;
drop policy if exists "service_role_full_financial_transactions" on public.financial_transactions;
drop policy if exists "authenticated_select_clients" on public.clients;
drop policy if exists "authenticated_select_movements" on public.movements;
drop policy if exists "authenticated_select_financial_transactions" on public.financial_transactions;

-- 1. Política para a service_role (API Gateway e sincronizador institucional)
create policy "service_role_full_clients"
	on public.clients
	for all
	to service_role
	using (true)
	with check (true);

create policy "service_role_full_movements"
	on public.movements
	for all
	to service_role
	using (true)
	with check (true);

create policy "service_role_full_financial_transactions"
	on public.financial_transactions
	for all
	to service_role
	using (true)
	with check (true);

-- 2. Políticas para usuários autenticados (Acesso isolado apenas aos seus próprios registros)
create policy "authenticated_select_clients"
	on public.clients
	for select
	to authenticated
	using (
		auth.uid()::text = id
		or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
	);

create policy "authenticated_select_movements"
	on public.movements
	for select
	to authenticated
	using (
		client_id = auth.uid()::text
		or lower(client_id) = lower(coalesce(auth.jwt() ->> 'email', ''))
	);
-- End of RLS policies.
