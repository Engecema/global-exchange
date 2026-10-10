create table if not exists public.clients (
	id text primary key,
	email text not null unique,
	name text not null default '',
	document text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint clients_email_lowercase check (email = lower(email))
);

create table if not exists public.movements (
	id text primary key,
	client_id text not null references public.clients (id) on update cascade on delete restrict,
	type text not null,
	description text not null default '',
	value numeric(24, 8) not null check (value >= 0),
	created_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
	id text primary key,
	type text not null check (type in ('CREDIT', 'DEBIT')),
	description text not null,
	value numeric(18, 2) not null check (value > 0),
	transaction_date date not null,
	created_at timestamptz not null default now()
);

create index if not exists movements_client_created_at_idx
	on public.movements (client_id, created_at desc);

create index if not exists financial_transactions_date_idx
	on public.financial_transactions (transaction_date desc, created_at desc);

alter table public.clients enable row level security;
alter table public.movements enable row level security;
alter table public.financial_transactions enable row level security;
