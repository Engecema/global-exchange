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
   * Autentica o usuário após cadastro ou em acessos recorrentes
   */
  async login(email: string, password: string, portal: 'client' | 'admin'): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Tenta autenticar no Supabase via backend se disponível
    try {
      const apiRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.supabaseAuthenticated) {
          console.log('[Auth Supabase] Usuário autenticado com sucesso no Supabase Auth!');
        }
      }
    } catch {
      // Silencioso se backend offline
    }

    // 2. Autentica no serviço local seguro
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
};
