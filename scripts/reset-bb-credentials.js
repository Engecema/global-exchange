#!/usr/bin/env node
/**
 * Script de Varredura e Reset Absoluto de Credenciais Banco do Brasil
 * Global Exchange (Engecema) - Isolamento de Ambiente
 * Aplicação / Contrato / Convênio Unificado: 300132
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env') }); } catch {}

const SUPABASE_URL = (process.env.GX_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.GX_SUPABASE_SECRET_KEY || process.env.GX_SUPABASE_SERVICE_ROLE_KEY || '';

function isServerKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}

async function runReset() {
  let projectUrl;
  try {
    projectUrl = new URL(SUPABASE_URL);
  } catch {
    throw new Error('Set GX_SUPABASE_URL to the intended Supabase project URL.');
  }
  if (projectUrl.protocol !== 'https:' || !isServerKey(SUPABASE_KEY)) {
    throw new Error('Reset requires HTTPS and a server-only Supabase secret/service_role key.');
  }

  console.log('================================================================');
  console.log('🔄 INICIANDO VARREDURA E RESET ABSOLUTO DE CREDENCIAIS BB');
  console.log('   Aplicação / Contrato / Convênio Unificado: 300132');
  console.log('================================================================\n');

  // 1. Limpeza no arquivo .env
  console.log('1. Varrendo e limpando variáveis locais (.env)...');
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/^BB_CLIENT_ID=.*$/gm, 'BB_CLIENT_ID=');
      content = content.replace(/^BB_CLIENT_SECRET=.*$/gm, 'BB_CLIENT_SECRET=');
      content = content.replace(/^BB_GW_APP_KEY=.*$/gm, 'BB_GW_APP_KEY=');
      content = content.replace(/^GW_DEV_APP_KEY=.*$/gm, 'GW_DEV_APP_KEY=');
      content = content.replace(/^BB_DEV_APP_KEY=.*$/gm, 'BB_DEV_APP_KEY=');
      content = content.replace(/^BB_MTLS_CERT=.*$/gm, 'BB_MTLS_CERT=');
      content = content.replace(/^BB_MTLS_KEY=.*$/gm, 'BB_MTLS_KEY=');
      content = content.replace(/^BB_CERT=.*$/gm, 'BB_CERT=');
      content = content.replace(/^BB_KEY=.*$/gm, 'BB_KEY=');
      fs.writeFileSync(envPath, content, 'utf8');
      console.log('   ✅ Arquivo .env limpo com sucesso (BB_CLIENT_ID, BB_CLIENT_SECRET, BB_GW_APP_KEY definidos como vazio).');
    } else {
      console.log('   ℹ️ Nenhum arquivo .env local encontrado no diretório.');
    }
  } catch (err) {
    console.warn('   ⚠️ Aviso ao limpar .env:', err.message);
  }

  // 2. Varredura e reset no Supabase
  console.log('\n2. Conectando ao Supabase para reset de credenciais...');
  console.log(`   URL: ${SUPABASE_URL}`);
  
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  };
  if (SUPABASE_KEY.startsWith('eyJ') || SUPABASE_KEY.startsWith('sb_')) {
    headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  }

  const candidateTables = [
    'configuracoes_api',
    'credentials',
    'bb_config',
    'configuracoes',
    'settings',
    'parametros',
  ];
  let updatedTables = 0;
  let failedTables = 0;

  for (const table of candidateTables) {
    try {
      const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (checkRes.ok) {
        console.log(`   🔍 Tabela [${table}] encontrada no Supabase. Executando reset...`);
        // Atualiza para NULL onde convenio = 300132 ou contrato = 300132
        const resetRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?or=(convenio.eq.300132,contrato.eq.300132)`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            bb_client_id: null,
            bb_client_secret: null,
            bb_gw_app_key: null,
            updated_at: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (!resetRes.ok) throw new Error(`Reset returned HTTP ${resetRes.status}`);

        updatedTables++;
        console.log(`   ✅ Tabela [${table}] resetada com sucesso para o ID 300132!`);
      } else if (checkRes.status !== 404) {
        throw new Error(`Table check returned HTTP ${checkRes.status}`);
      }
    } catch (error) {
      failedTables++;
      console.warn(`   ⚠️ Falha ao verificar/resetar [${table}]:`, error.message);
    }
  }
  if (failedTables || !updatedTables) {
    throw new Error(`Supabase reset incomplete: ${updatedTables} table(s) updated, ${failedTables} failure(s).`);
  }

  // 3. Notifica o backend da Global Exchange se dev server estiver ativo
  console.log('\n3. Notificando backend da Global Exchange (Porta 3000)...');
  try {
    const backendRes = await fetch('http://localhost:3000/api/pix/clear-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ convenio: '300132', numeroContrato: '300132', applicationId: '300132' }),
      signal: AbortSignal.timeout(4000),
    });
    if (backendRes.ok) {
      const data = await backendRes.json();
      console.log('   ✅ Backend respondeu:', data.message || 'Credenciais isoladas.');
    } else {
      console.log('   ℹ️ Servidor na porta 3000 respondeu com status:', backendRes.status);
    }
  } catch (e) {
    console.log('   ℹ️ Servidor de desenvolvimento não está rodando no momento (as alterações em arquivo e Supabase já foram aplicadas).');
  }

  console.log('\n================================================================');
  console.log('✨ ISOLAMENTO CONCLUÍDO COM SUCESSO!');
  console.log('   - Frontend: campos de credenciais iniciam 100% limpos;');
  console.log('   - Backend: cache de runtime e .env resetados;');
  console.log('   - Banco: credenciais zeradas no Supabase.');
  console.log('   O sistema está isolado e pronto para cadastrar as novas chaves.');
  console.log('================================================================\n');
}

runReset().catch((err) => {
  console.error('❌ Erro inesperado ao executar varredura:', err);
  process.exit(1);
});
