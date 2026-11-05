-- ==============================================================================
-- GLOBAL EXCHANGE / SUPABASE HARDENING & BLINDAGEM DE SEGURANÇA (OWASP ASVS)
-- Script de Proteção Máxima contra Acessos Não Autorizados e Injeção
-- ==============================================================================

-- 1. Habilitar Row Level Security (RLS) em todas as tabelas
ALTER TABLE IF EXISTS public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.configuracoes_api ENABLE ROW LEVEL SECURITY;

-- 2. Revogar privilégios públicos e anônimos (Least Privilege Principle)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Concede privilégios restritos aos usuários autenticados somente onde estritamente necessário
GRANT SELECT ON public.clients TO authenticated;
GRANT SELECT ON public.movements TO authenticated;

-- Concede privilégios totais única e exclusivamente para a role de serviço do backend (service_role)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 3. Limpeza de políticas prévias abertas ou inseguras
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('clients', 'movements', 'financial_transactions', 'configuracoes_api')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END;
$$;

-- 4. POLÍTICAS DA TABELA CONFIGURACOES_API (Totalmente cega e isolada contra o público)
-- Apenas o backend oficial via chave privilegiada (service_role) pode acessar ou ler
CREATE POLICY "service_role_sovereign_configuracoes_api"
    ON public.configuracoes_api
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. POLÍTICAS DA TABELA CLIENTS (Isolamento rígido: cliente só enxerga a própria conta)
CREATE POLICY "service_role_manage_clients"
    ON public.clients
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "user_select_own_client_row"
    ON public.clients
    FOR SELECT
    TO authenticated
    USING (
        auth.uid()::text = id
        OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );

-- 6. POLÍTICAS DA TABELA MOVEMENTS (Isolamento estrito de extrato/custódia)
CREATE POLICY "service_role_manage_movements"
    ON public.movements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "user_select_own_movements"
    ON public.movements
    FOR SELECT
    TO authenticated
    USING (
        client_id = auth.uid()::text
        OR lower(client_id) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );

-- 7. POLÍTICAS DA TABELA FINANCIAL_TRANSACTIONS (Livro Razão interno e contabilidade)
CREATE POLICY "service_role_manage_financial_transactions"
    ON public.financial_transactions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 8. Forçar atualização imediata do schema cache no PostgREST
NOTIFY pgrst, 'reload schema';
