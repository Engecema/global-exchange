-- ==============================================================================
-- GLOBAL EXCHANGE / BANCO DO BRASIL - TABELA CONFIGURACOES_API NO SUPABASE
-- Aplicação / Contrato / Convênio Unificado: 300132
-- Administrador Geral: Geoni Clementino Cesar de Matos (geonimatos31@gmail.com)
-- ==============================================================================

-- 1. Cria a tabela oficial public.configuracoes_api se não existir
CREATE TABLE IF NOT EXISTS public.configuracoes_api (
    id TEXT PRIMARY KEY DEFAULT 'cfg_bb_engecema_300132',
    convenio TEXT NOT NULL DEFAULT '300132',
    contrato TEXT NOT NULL DEFAULT '300132',
    numero_convenio TEXT NOT NULL DEFAULT '300132',
    numero_contrato TEXT NOT NULL DEFAULT '300132',
    id_aplicacao TEXT NOT NULL DEFAULT '300132',
    application_id TEXT NOT NULL DEFAULT '300132',
    application_name TEXT NOT NULL DEFAULT 'GX PAGAMENTOS',
    corporate_name TEXT NOT NULL DEFAULT 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA',
    company_cnpj TEXT NOT NULL DEFAULT '05368602000110',
    admin_email TEXT NOT NULL DEFAULT 'geonimatos31@gmail.com',
    admin_name TEXT NOT NULL DEFAULT 'Geoni Clementino Cesar de Matos',
    admin_document TEXT NOT NULL DEFAULT '70781338387',
    admin_status TEXT NOT NULL DEFAULT 'active',
    is_configured BOOLEAN NOT NULL DEFAULT true,
    bb_client_id TEXT DEFAULT NULL,
    bb_client_secret TEXT DEFAULT NULL,
    bb_gw_app_key TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Garante todas as colunas necessárias caso a tabela já existisse
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS convenio TEXT DEFAULT '300132';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS contrato TEXT DEFAULT '300132';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS numero_convenio TEXT DEFAULT '300132';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS numero_contrato TEXT DEFAULT '300132';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS id_aplicacao TEXT DEFAULT '300132';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS application_id TEXT DEFAULT '300132';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS application_name TEXT DEFAULT 'GX PAGAMENTOS';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS corporate_name TEXT DEFAULT 'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS company_cnpj TEXT DEFAULT '05368602000110';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS admin_email TEXT DEFAULT 'geonimatos31@gmail.com';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS admin_name TEXT DEFAULT 'Geoni Clementino Cesar de Matos';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS admin_document TEXT DEFAULT '70781338387';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS admin_status TEXT DEFAULT 'active';
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS is_configured BOOLEAN DEFAULT true;
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS bb_client_id TEXT DEFAULT NULL;
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS bb_client_secret TEXT DEFAULT NULL;
ALTER TABLE public.configuracoes_api ADD COLUMN IF NOT EXISTS bb_gw_app_key TEXT DEFAULT NULL;

-- 3. Habilita Row Level Security (RLS) com políticas de leitura pública e escrita autenticada
ALTER TABLE public.configuracoes_api ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura pública configuracoes_api" ON public.configuracoes_api;
CREATE POLICY "Permitir leitura pública configuracoes_api"
    ON public.configuracoes_api FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Permitir escrita configuracoes_api" ON public.configuracoes_api;
CREATE POLICY "Permitir escrita configuracoes_api"
    ON public.configuracoes_api FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. Insere ou atualiza o registro oficial soberano da aplicação 300132
INSERT INTO public.configuracoes_api (
    id,
    convenio,
    contrato,
    numero_convenio,
    numero_contrato,
    id_aplicacao,
    application_id,
    application_name,
    corporate_name,
    company_cnpj,
    admin_email,
    admin_name,
    admin_document,
    admin_status,
    is_configured,
    updated_at
) VALUES (
    'cfg_bb_engecema_300132',
    '300132',
    '300132',
    '300132',
    '300132',
    '300132',
    '300132',
    'GX PAGAMENTOS',
    'ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA',
    '05368602000110',
    'geonimatos31@gmail.com',
    'Geoni Clementino Cesar de Matos',
    '70781338387',
    'active',
    true,
    now()
)
ON CONFLICT (id) DO UPDATE SET
    convenio = '300132',
    contrato = '300132',
    numero_convenio = '300132',
    numero_contrato = '300132',
    id_aplicacao = '300132',
    application_id = '300132',
    admin_email = 'geonimatos31@gmail.com',
    admin_name = 'Geoni Clementino Cesar de Matos',
    admin_document = '70781338387',
    admin_status = 'active',
    is_configured = true,
    updated_at = now();

-- 5. Força recarga imediata do schema cache no PostgREST
NOTIFY pgrst, 'reload schema';
