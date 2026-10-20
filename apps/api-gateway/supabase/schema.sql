create table if not exists public.clients (
	id text primary key,
	email text not null unique,
	name text not null default '',
	document text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

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

-- Políticas de acesso para permitir sincronização e leitura/escrita
drop policy if exists "Permitir tudo para service_role e anon clients" on public.clients;
drop policy if exists "Permitir tudo para service_role e anon movements" on public.movements;
drop policy if exists "Permitir tudo para service_role e anon financial_transactions" on public.financial_transactions;

create policy "Permitir tudo para service_role e anon clients"
	on public.clients for all using (true) with check (true);

create policy "Permitir tudo para service_role e anon movements"
	on public.movements for all using (true) with check (true);

create policy "Permitir tudo para service_role e anon financial_transactions"
	on public.financial_transactions for all using (true) with check (true);
