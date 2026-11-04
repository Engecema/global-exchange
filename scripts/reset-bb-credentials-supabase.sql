-- ==============================================================================
-- GLOBAL EXCHANGE / BANCO DO BRASIL - RESET ABSOLUTO E ISOLAMENTO DE CREDENCIAIS
-- Aplicação / Contrato / Convênio Unificado: 300132
-- ==============================================================================
-- Este script realiza uma varredura dinâmica completa em todo o banco do Supabase,
-- localizando qualquer tabela com colunas de credenciais BB (ex: configuracoes_api,
-- credentials, bb_config, etc.) e forçando o reset para vazio/NULL.
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    col_client_id TEXT;
    col_client_secret TEXT;
    col_gw_app_key TEXT;
    sql_stmt TEXT;
BEGIN
    RAISE NOTICE 'Iniciando varredura dinâmica de credenciais Banco do Brasil no Supabase...';

    -- 1. Varre dinamicamente todas as tabelas do schema public procurando colunas de credenciais BB
    FOR r IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    ) LOOP
        -- Verifica se a tabela possui colunas relacionadas a credenciais do Banco do Brasil
        SELECT column_name INTO col_client_id 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = r.table_name 
          AND column_name IN ('bb_client_id', 'client_id', 'bb_cliente_id')
        LIMIT 1;

        SELECT column_name INTO col_client_secret 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = r.table_name 
          AND column_name IN ('bb_client_secret', 'client_secret', 'bb_cliente_secret')
        LIMIT 1;

        SELECT column_name INTO col_gw_app_key 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = r.table_name 
          AND column_name IN ('bb_gw_app_key', 'gw_app_key', 'gw_dev_app_key', 'developer_app_key', 'api_key')
        LIMIT 1;

        -- Se a tabela tiver pelo menos uma dessas colunas, executa o reset condicional ou global
        IF col_client_id IS NOT NULL OR col_gw_app_key IS NOT NULL THEN
            -- Ignora a tabela de clientes para não apagar o ID do cliente titular (GX-CLI-0001)
            IF r.table_name NOT IN ('clients', 'movements', 'financial_transactions') THEN
                sql_stmt := 'UPDATE public.' || quote_ident(r.table_name) || ' SET ';
                
                IF col_client_id IS NOT NULL THEN
                    sql_stmt := sql_stmt || quote_ident(col_client_id) || ' = NULL, ';
                END IF;
                IF col_client_secret IS NOT NULL THEN
                    sql_stmt := sql_stmt || quote_ident(col_client_secret) || ' = NULL, ';
                END IF;
                IF col_gw_app_key IS NOT NULL THEN
                    sql_stmt := sql_stmt || quote_ident(col_gw_app_key) || ' = NULL, ';
                END IF;

                -- Remove a última vírgula
                sql_stmt := rtrim(sql_stmt, ', ');

                -- Se a tabela tiver coluna de convênio ou contrato, filtra por 300132
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = r.table_name AND column_name IN ('convenio', 'numero_convenio')
                ) THEN
                    sql_stmt := sql_stmt || ' WHERE (convenio IN (''300132'', ''3906685'') OR numero_convenio IN (''300132'', ''3906685''))';
                END IF;

                BEGIN
                    EXECUTE sql_stmt;
                    RAISE NOTICE 'Tabela % atualizada com reset de credenciais.', r.table_name;
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE 'Aviso ao atualizar %: %', r.table_name, SQLERRM;
                END;
            END IF;
        END IF;
    END LOOP;
END $$;

-- 2. Garante a criação / sanitização padrão da tabela oficial configuracoes_api
CREATE TABLE IF NOT EXISTS public.configuracoes_api (
    id TEXT PRIMARY KEY DEFAULT 'config_bb_engecema',
    convenio TEXT NOT NULL DEFAULT '300132',
    numero_convenio TEXT NOT NULL DEFAULT '300132',
    contrato TEXT NOT NULL DEFAULT '300132',
    numero_contrato TEXT NOT NULL DEFAULT '300132',
    id_aplicacao TEXT NOT NULL DEFAULT '300132',
    application_id TEXT NOT NULL DEFAULT '300132',
    application_name TEXT NOT NULL DEFAULT 'GX PAGAMENTOS',
    bb_client_id TEXT DEFAULT NULL,
    bb_client_secret TEXT DEFAULT NULL,
    bb_gw_app_key TEXT DEFAULT NULL,
    pix_key TEXT DEFAULT '05368602000110',
    scope TEXT DEFAULT 'pagamentos-lote.requisicao',
    api_url TEXT DEFAULT 'https://api.bb.com.br',
    oauth_url TEXT DEFAULT 'https://oauth.bb.com.br/oauth/token',
    webhook_url TEXT DEFAULT 'https://global-exchange-zecy.onrender.com/api/webhook/pix',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilita RLS e política permissiva de acesso para sincronização
ALTER TABLE public.configuracoes_api ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para configuracoes_api" ON public.configuracoes_api;
CREATE POLICY "Permitir tudo para configuracoes_api" ON public.configuracoes_api FOR ALL USING (true) WITH CHECK (true);

-- 3. Força o Reset Absoluto (valores vazios/NULL) para a aplicação e contrato 300132
INSERT INTO public.configuracoes_api (
    id,
    convenio,
    numero_convenio,
    contrato,
    numero_contrato,
    id_aplicacao,
    application_id,
    application_name,
    bb_client_id,
    bb_client_secret,
    bb_gw_app_key,
    pix_key,
    scope,
    updated_at
) VALUES (
    'config_bb_engecema',
    '300132',
    '300132',
    '300132',
    '300132',
    '300132',
    '300132',
    'GX PAGAMENTOS',
    NULL,
    NULL,
    NULL,
    '05368602000110',
    'pagamentos-lote.requisicao',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    bb_client_id = NULL,
    bb_client_secret = NULL,
    bb_gw_app_key = NULL,
    convenio = '300132',
    numero_convenio = '300132',
    contrato = '300132',
    numero_contrato = '300132',
    id_aplicacao = '300132',
    application_id = '300132',
    updated_at = NOW();

-- 4. Notifica o PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';

SELECT 'Varredura e reset absoluto de credenciais do Banco do Brasil concluído com sucesso para a aplicação e contrato 300132!' AS resultado;
