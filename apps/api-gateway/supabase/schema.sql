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

create table if not exists public.movements (
	id text primary key,
	client_id text not null references public.clients (id) on update cascade on delete cascade,
	type text not null,
	description text not null default '',
	value numeric(24, 8) not null default 0 check (value >= 0),
	created_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
	id text primary key,
	type text not null,
	description text not null default '',
	value numeric(18, 2) not null default 0 check (value >= 0),
	transaction_date date not null default current_date,
	created_at timestamptz not null default now()
);

create index if not exists movements_client_created_at_idx
	on public.movements (client_id, created_at desc);

create index if not exists financial_transactions_date_idx
	on public.financial_transactions (transaction_date desc, created_at desc);

alter table public.clients enable row level security;
alter table public.movements enable row level security;
alter table public.financial_transactions enable row level security;

-- Revoga privilégios destrutivos e mutações da role 'anon' (OWASP Top 10 A01: Broken Access Control)
revoke insert, update, delete, truncate on public.clients from anon;
revoke insert, update, delete, truncate on public.movements from anon;
revoke insert, update, delete, truncate on public.financial_transactions from anon;

-- Concede privilégios completos exclusivamente à role 'service_role' (utilizada pela API Gateway / Backend seguro)
grant all on public.clients to service_role;
grant all on public.movements to service_role;
grant all on public.financial_transactions to service_role;

-- Remove políticas legadas abertas
drop policy if exists "Permitir tudo para service_role e anon clients" on public.clients;
drop policy if exists "Permitir tudo para service_role e anon movements" on public.movements;
drop policy if exists "Permitir tudo para service_role e anon financial_transactions" on public.financial_transactions;
drop policy if exists "service_role_full_clients" on public.clients;
drop policy if exists "service_role_full_movements" on public.movements;
drop policy if exists "service_role_full_financial_transactions" on public.financial_transactions;
drop policy if exists "authenticated_select_clients" on public.clients;
drop policy if exists "authenticated_select_movements" on public.movements;
drop policy if exists "authenticated_select_financial_transactions" on public.financial_transactions;

-- 1. Política Soberana: service_role possui acesso total para sincronização pelo backend
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

-- 2. Políticas para usuários autenticados (Restritos a consultar apenas seus próprios dados)
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

create policy "authenticated_select_financial_transactions"
	on public.financial_transactions
	for select
	to authenticated
	using (true);
