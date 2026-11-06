import { StorageService } from './storage';
import { User, Account } from '../types/exchange';

export interface AuthRegisterData {
  name: string;
  email: string;
  document: string;
  password: string;
  role?: 'client' | 'admin';
  reason?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  error?: string;
  user?: User;
  account?: Account;
  requiresAuthLogin?: boolean;
  requiresMfa?: boolean;
  txid?: string;
  bitxAddress?: string;
  initialMovement?: any;
}

export interface SupabaseConfigStatus {
  hasSupabase: boolean;
  configured: boolean;
  url?: string;
}

export const AuthService = {
  /**
   * Verifica se o backend está conectado com o Supabase
   */
  async getSupabaseStatus(): Promise<SupabaseConfigStatus> {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Offline or dev fallback
    }
    return { hasSupabase: false, configured: false };
  },

  /**
   * Realiza o cadastro do usuário (Supabase + Storage local)
   * NUNCA autentica automaticamente após o cadastro: exige que o usuário
   * forneça suas credenciais para autenticar seu acesso com segurança.
   */
  async register(data: AuthRegisterData): Promise<AuthResponse> {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.name.trim();
    const cleanDoc = data.document.trim();

    if (!cleanEmail || !cleanName || !data.password) {
      return { success: false, error: 'Preencha todos os campos obrigatórios.' };
    }

    if (data.password.length < 6) {
      return { success: false, error: 'A senha deve conter no mínimo 6 caracteres.' };
    }
    if (data.role === 'admin') {
      return { success: false, error: 'A criação de administradores deve ser feita exclusivamente por um operador autorizado da governança.' };
    }

    // 1. Tenta sincronizar com Supabase através do backend
    try {
      const apiRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          document: cleanDoc,
          password: data.password,
          role: data.role || 'client',
        }),
      });

      if (!apiRes.ok) {
        const result = await apiRes.json().catch(() => ({}));
        if (import.meta.env.PROD) {
          return { success: false, error: result.error || 'Não foi possível concluir o cadastro.' };
        }
      }

      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.error) {
          console.warn('[Auth Supabase] Aviso:', json.error);
        }
      }
    } catch (err) {
      console.warn('[Auth Service] API offline para sincronização Supabase, usando persistência local:', err);
      if (import.meta.env.PROD) {
        return { success: false, error: 'Não foi possível validar o cadastro com o servidor.' };
      }
    }

    if (import.meta.env.PROD) {
      return {
        success: true,
        message: 'Cadastro realizado com sucesso! Entre com sua senha para autenticar o acesso.',
        requiresAuthLogin: true,
      };
    }

    // 2. Persiste a conta localmente (sem logar) - Registro de cliente comercial
    const regRes = StorageService.registerClientAccount({
      name: cleanName,
      email: cleanEmail,
      document: cleanDoc,
      password: data.password,
    });

    if (!regRes.success || !regRes.account) {
      return { success: false, error: regRes.error || 'Erro ao realizar cadastro.' };
    }

    return {
      success: true,
      account: regRes.account,
      txid: regRes.txid,
      bitxAddress: regRes.bitxAddress,
      initialMovement: regRes.initialMovement,
      message: 'Cadastro realizado com sucesso! Para sua segurança, digite sua senha cadastrada para autenticar o acesso.',
      requiresAuthLogin: true,
    };
  },

  /**
   * Consulta o status soberano do Administrador Geral no backend e banco de dados Supabase
   * (Convênio e Contrato único: 300132)
   */
  async getMasterAdminStatus(): Promise<{
    success: boolean;
    configured: boolean;
    exists: boolean;
    admin?: { email: string; name: string; document: string; role: string };
  }> {
    try {
      const res = await fetch('/api/admin/master-status');
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[Auth Service] Falha ao consultar master-status no backend:', err);
    }
    return { success: false, configured: false, exists: false };
  },

  /**
   * Autentica o usuário após cadastro ou em acessos recorrentes
   */
  async login(email: string, password: string, portal: 'client' | 'admin'): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Tenta autenticar diretamente no backend (Server-Side soberano)
    let serverAuthResult: any = null;
    let serverAuthError = '';
    try {
      const apiRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, portal, role: portal }),
      });
      if (apiRes.ok) {
        serverAuthResult = await apiRes.json();
        if (serverAuthResult?.requiresMfa) {
          return { success: false, requiresMfa: true, message: serverAuthResult.message };
        }
        if (serverAuthResult?.supabaseAuthenticated) {
          console.log('[Auth Supabase] Usuário autenticado com sucesso no Supabase Auth!');
        }
      } else {
        const errorResult = await apiRes.json().catch(() => ({}));
        serverAuthError = errorResult.error || 'Credenciais inválidas.';
        return { success: false, error: serverAuthError };
      }
    } catch {
      // Silencioso se backend offline
    }

    // Se o backend validou a autenticação do administrador de forma soberana
    if (portal === 'admin' && serverAuthResult?.success && serverAuthResult?.authenticated && serverAuthResult?.user) {
      const serverUser = serverAuthResult.user;
      if (serverAuthResult.token) {
        try {
          sessionStorage.setItem('gx_access_token', serverAuthResult.token);
        } catch {}
      }
      StorageService.setCurrentUser(serverUser, { scope: 'admin' });
      return { success: true, user: serverUser };
    }

    // Se o backend validou a autenticação do cliente
    if (portal === 'client' && serverAuthResult?.success && serverAuthResult?.authenticated && serverAuthResult?.user) {
      const serverUser = serverAuthResult.user;
      if (serverAuthResult.token) {
        try {
          sessionStorage.setItem('gx_access_token', serverAuthResult.token);
        } catch {}
      }
      StorageService.setCurrentUser(serverUser, { scope: 'client' });
      return { success: true, user: serverUser };
    }

    // 2. Fallback de contingência offline: autentica no serviço local seguro
    if (portal === 'admin') {
      const res = StorageService.authenticateAdmin(cleanEmail, password);
      if (!res.success || !res.user) {
        return { success: false, error: res.error || serverAuthError || 'Credenciais de administrador inválidas.' };
      }
      return { success: true, user: res.user };
    } else {
      const res = StorageService.authenticateClient(cleanEmail, password);
      if (!res.success || !res.user) {
        return { success: false, error: res.error || serverAuthError || 'E-mail ou senha incorretos.' };
      }
      return { success: true, user: res.user };
    }
  },

  async verifyMfa(code: string): Promise<AuthResponse> {
    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.user) {
        return { success: false, error: result.error || 'Não foi possível confirmar o código autenticador.' };
      }
      return { success: true, user: result.user };
    } catch {
      return { success: false, error: 'Não foi possível validar o código autenticador.' };
    }
  },

  /**
   * Valida existência e titularidade de uma conta para redefinição de senha
   */
  verifyAccount(email: string, role?: 'client' | 'admin') {
    return StorageService.verifyAccountForPasswordReset(email, role);
  },

  /**
   * Executa a redefinição da senha do usuário ou administrador (Perdi Minha Senha)
   */
  async resetPassword(params: {
    email: string;
    newPassword: string;
    role?: 'client' | 'admin';
    document?: string;
    adminToken?: string;
    operatorEmail?: string;
    operatorName?: string;
    reason?: string;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (params.adminToken) {
        headers['x-admin-token'] = params.adminToken;
      }
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        StorageService.resetAccountPassword(params);
        return {
          success: true,
          message: json.message || 'Senha atualizada com sucesso no ambiente corporativo!',
        };
      } else {
        const errJson = await res.json().catch(() => ({}));
        return {
          success: false,
          message: '',
          error: errJson.error || 'Falha ao redefinir a senha no servidor.',
        };
      }
    } catch {
      return StorageService.resetAccountPassword(params);
    }
  },

  /**
   * Executa o Zero-State Purge (limpeza criptográfica completa):
   * Controle de segurança e defesa soberano que:
   * 1. Notifica o backend para invalidar a sessão server-side (via sendBeacon / keepalive).
   * 2. Limpa completamente o sessionStorage (sessionStorage.clear()).
   * 3. Limpa todas as chaves de credencial, tokens e sessões do localStorage.
   * 4. Destrói variáveis sensíveis em memória e cache através do StorageService.
   * 5. Invalida e expira forçadamente todos os cookies de autenticação em múltiplos caminhos e domínios.
   * 6. Substitui o histórico de navegação via window.location.replace() (eliminando BFCache e histórico).
   */
  executeZeroStatePurge(redirectUrl: string = '/'): void {
    try {
      // 1. Notifica o backend com keepalive / sendBeacon (continua mesmo se a página descarregar)
      try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/auth/logout', JSON.stringify({ timestamp: Date.now(), reason: 'zero_state_purge' }));
        } else {
          fetch('/api/auth/logout', { method: 'POST', keepalive: true }).catch(() => {});
        }
      } catch {}

      // 2. Executa a purga criptográfica completa do StorageService (LocalStorage + SessionStorage)
      try {
        StorageService.executeZeroStatePurge();
      } catch {}

      // 3. Limpeza profunda e irrestrita de sessionStorage
      try {
        sessionStorage.clear();
      } catch {}

      // 4. Limpeza de chaves de credencial e sessão do localStorage
      try {
        const authKeys = [
          'gx_current_user_v3',
          'gx_client_user_v3',
          'gx_admin_user_v3',
          'gx_autenticado',
          'gx_tab_view',
          'gx_access_token',
          'gx_refresh_token',
          'sb-access-token',
          'sb-refresh-token',
          'gx_bb_client_secret',
          'gx_bb_client_id',
          'gx_bb_gw_app_key',
          'gx_bb_contract_number',
          'gx_auth_temp_creds',
          'token',
          'gx_session',
        ];
        authKeys.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {}
        });
      } catch {}

      // 5. Invalidação e expiração forçada de todos os cookies no cliente
      try {
        const cookies = document.cookie.split(';');
        const hostname = window.location.hostname;
        const hostParts = hostname.split('.');
        const domainVariations = ['', hostname];
        if (hostParts.length > 1) {
          domainVariations.push(`.${hostname}`);
          domainVariations.push(`.${hostParts.slice(-2).join('.')}`);
        }

        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i];
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (!name) continue;

          const paths = ['/', '/cliente', '/admin', window.location.pathname];
          paths.forEach((p) => {
            domainVariations.forEach((d) => {
              const domainAttr = d ? `; domain=${d}` : '';
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p}${domainAttr}; SameSite=Strict`;
              document.cookie = `${name}=; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p}${domainAttr}; SameSite=Strict`;
            });
          });
        }
      } catch {}

      // 6. Substituição definitiva do histórico do navegador (evita restauração ao recarregar ou voltar)
      window.location.replace(redirectUrl);
    } catch {
      window.location.href = redirectUrl;
    }
  },

  /**
   * Alias de conveniência para executeZeroStatePurge
   */
  secureLogout(redirectUrl: string = '/'): void {
    this.executeZeroStatePurge(redirectUrl);
  },
};

/**
 * Retorna os cabeçalhos de autorização com o token de sessão atual
 */
export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  try {
    const token =
      sessionStorage.getItem('gx_access_token') ||
      localStorage.getItem('gx_access_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {}
  return headers;
}

/**
 * Garante que o administrador possua um token de sessão criptográfico ativo com o backend
 */
export async function ensureAdminSessionToken(): Promise<string | null> {
  try {
    let token =
      sessionStorage.getItem('gx_access_token') ||
      localStorage.getItem('gx_access_token');
    if (token) return token;

    // Se houver um cookie HttpOnly gx_session ativo, consulta /api/auth/session com credenciais
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.token) {
        sessionStorage.setItem('gx_access_token', data.token);
        return data.token;
      }
    }
  } catch (err) {
    console.warn('[Auth Service] Sessão administrativa não autenticada:', err);
  }
  return null;
}

