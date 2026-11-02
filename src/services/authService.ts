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

      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.error) {
          console.warn('[Auth Supabase] Aviso:', json.error);
        }
      }
    } catch (err) {
      console.warn('[Auth Service] API offline para sincronização Supabase, usando persistência local:', err);
    }

    // 2. Persiste a conta localmente (sem logar)
    if (data.role === 'admin') {
      const res = StorageService.registerAdminAccount({
        name: cleanName,
        email: cleanEmail,
        document: cleanDoc,
        password: data.password,
        reason: data.reason,
      });

      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao registrar solicitação administrativa.' };
      }

      return {
        success: true,
        message: res.isPending
          ? 'Solicitação administrativa enviada com sucesso! Aguarde aprovação do Administrador Geral.'
          : 'Administrador cadastrado com sucesso! Por favor, digite sua senha para autenticar o acesso.',
        requiresAuthLogin: true,
      };
    }

    // Registro de cliente comercial
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
   * (Convênio único: 3906685 | Contrato: 20685215)
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
    try {
      const apiRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, portal, role: portal }),
      });
      if (apiRes.ok) {
        serverAuthResult = await apiRes.json();
        if (serverAuthResult?.supabaseAuthenticated) {
          console.log('[Auth Supabase] Usuário autenticado com sucesso no Supabase Auth!');
        }
      }
    } catch {
      // Silencioso se backend offline
    }

    // Se o backend validou a autenticação do administrador de forma soberana
    if (portal === 'admin' && serverAuthResult?.success && serverAuthResult?.authenticated && serverAuthResult?.user) {
      const serverUser = serverAuthResult.user;
      StorageService.setCurrentUser(serverUser, { scope: 'admin' });
      return { success: true, user: serverUser };
    }

    // Se o backend validou a autenticação do cliente
    if (portal === 'client' && serverAuthResult?.success && serverAuthResult?.authenticated && serverAuthResult?.user) {
      const serverUser = serverAuthResult.user;
      StorageService.setCurrentUser(serverUser, { scope: 'client' });
      return { success: true, user: serverUser };
    }

    // 2. Autentica no serviço local seguro com soberania de regras
    if (portal === 'admin') {
      const res = StorageService.authenticateAdmin(cleanEmail, password);
      if (!res.success || !res.user) {
        return { success: false, error: res.error || 'Credenciais de administrador inválidas.' };
      }
      return { success: true, user: res.user };
    } else {
      const res = StorageService.authenticateClient(cleanEmail, password);
      if (!res.success || !res.user) {
        return { success: false, error: res.error || 'E-mail ou senha incorretos.' };
      }
      return { success: true, user: res.user };
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
    operatorEmail?: string;
    operatorName?: string;
    reason?: string;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    return StorageService.resetAccountPassword(params);
  },

  /**
   * Executa logout seguro, universal e agnóstico de navegador (OWASP ASVS compliant).
   * 1. Notifica o backend para invalidar a sessão server-side (via sendBeacon / keepalive).
   * 2. Limpa completamente o sessionStorage e as chaves de credencial do localStorage.
   * 3. Invalida e expira forçadamente todos os cookies de autenticação em múltiplos caminhos e domínios.
   * 4. Utiliza window.location.replace() para substituir a página no histórico de navegação (eliminando BFCache e histórico).
   */
  secureLogout(redirectUrl: string = '/'): void {
    try {
      // 1. Notifica o backend com keepalive / sendBeacon (continua mesmo se a página descarregar)
      try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/auth/logout', JSON.stringify({ timestamp: Date.now() }));
        } else {
          fetch('/api/auth/logout', { method: 'POST', keepalive: true }).catch(() => {});
        }
      } catch {}

      // 2. Limpeza profunda de sessionStorage
      try {
        sessionStorage.clear();
      } catch {}

      // 3. Limpeza de chaves de credencial e sessão do localStorage
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
        ];
        authKeys.forEach((k) => localStorage.removeItem(k));
      } catch {}

      // 4. Invalidação e expiração forçada de todos os cookies no cliente
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

      // 5. Substituição definitiva do histórico do navegador (evita restauração ao recarregar ou voltar)
      window.location.replace(redirectUrl);
    } catch {
      window.location.href = redirectUrl;
    }
  },
};
