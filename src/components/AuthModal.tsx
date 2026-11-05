import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types/exchange';
import { StorageService, isMasterAdminEmail, isAdminEmail, isGeoniEmail } from '../services/storage';
import { AuthService } from '../services/authService';
import {
  Eye,
  EyeOff,
  ShieldAlert,
  Building2,
  Lock,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  LogIn,
  ShieldCheck,
  X,
  RotateCcw,
  KeyRound,
  ArrowLeft,
  Clock,
  Shield,
} from 'lucide-react';

interface AuthModalProps {
  onLoginSuccess: (user: User, portalScope?: 'client' | 'admin') => void;
  initialPortal?: 'client' | 'admin';
}

type AuthPortal = 'client' | 'admin';
type ClientTab = 'login' | 'register' | 'forgot_password';
type AdminTab = 'login' | 'register' | 'forgot_password';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 30;

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess, initialPortal }) => {
  const [portal, setPortal] = useState<AuthPortal>(initialPortal || 'client');
  const [clientTab, setClientTab] = useState<ClientTab>('login');
  const [adminTab, setAdminTab] = useState<AdminTab>('login');

  // Client fields
  const [clientEmail, setClientEmail] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientDocument, setClientDocument] = useState('');

  // Admin fields
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminDocument, setAdminDocument] = useState('');
  const [adminGovernanceKey, setAdminGovernanceKey] = useState('');

  // Campos de Recuperação de Senha
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryDocument, setRecoveryDocument] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Visibilidade de senhas
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingMfaPortal, setPendingMfaPortal] = useState<'client' | 'admin' | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  // Sistema de Defesa Anti-Ataque Hacker & Anti-Força Bruta
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const lockoutIntervalRef = useRef<any>(null);

  // Limpeza de campos e verificação inicial
  useEffect(() => {
    setClientEmail('');
    setClientPassword('');
    setClientName('');
    setClientDocument('');
    setAdminEmail('');
    setAdminPassword('');
    setAdminName('');
    setAdminDocument('');
    setAdminGovernanceKey('');
    setRecoveryEmail('');
    setRecoveryDocument('');
    setNewPassword('');
    setConfirmNewPassword('');

    if (initialPortal) {
      setPortal(initialPortal);
      return;
    }

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const v = searchParams.get('view')?.toLowerCase() || searchParams.get('portal')?.toLowerCase();
      if (v === 'admin') {
        setPortal('admin');
      } else if (v === 'client') {
        setPortal('client');
      } else {
        const hash = window.location.hash.toLowerCase().replace('#', '');
        if (hash === 'admin') setPortal('admin');
        else if (hash === 'client' || hash === 'cliente') setPortal('client');
      }
    } catch {}
  }, [initialPortal]);

  // Gerenciamento de Contagem Regressiva de Bloqueio de Segurança
  useEffect(() => {
    if (lockoutSeconds > 0) {
      lockoutIntervalRef.current = setInterval(() => {
        setLockoutSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(lockoutIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (lockoutIntervalRef.current) clearInterval(lockoutIntervalRef.current);
    };
  }, [lockoutSeconds]);

  // Registra falha de autenticação e aplica lockout se atingir limite
  const registerAuthFailure = (customError: string) => {
    const nextCount = failedAttempts + 1;
    setFailedAttempts(nextCount);
    if (nextCount >= MAX_FAILED_ATTEMPTS) {
      setLockoutSeconds(LOCKOUT_DURATION_SECONDS);
      setErrorMsg(
        `⚠️ Sistema de Defesa Ativado: ${MAX_FAILED_ATTEMPTS} tentativas consecutivas incorretas detectadas. Por segurança contra ataques automatizados, os botões foram bloqueados temporariamente por ${LOCKOUT_DURATION_SECONDS} segundos.`
      );
    } else {
      const remaining = MAX_FAILED_ATTEMPTS - nextCount;
      setErrorMsg(
        `${customError} (Tentativa ${nextCount}/${MAX_FAILED_ATTEMPTS}. Restam ${remaining} antes do bloqueio de segurança).`
      );
    }
  };

  const registerAuthSuccess = () => {
    setFailedAttempts(0);
    setLockoutSeconds(0);
    setErrorMsg('');
  };

  const clearClientFields = () => {
    setClientEmail('');
    setClientPassword('');
    setClientName('');
    setClientDocument('');
    setErrorMsg('');
  };

  const clearAdminFields = () => {
    setAdminEmail('');
    setAdminPassword('');
    setAdminName('');
    setAdminDocument('');
    setAdminGovernanceKey('');
    setErrorMsg('');
  };

  const clearRecoveryFields = () => {
    setRecoveryEmail('');
    setRecoveryDocument('');
    setNewPassword('');
    setConfirmNewPassword('');
    setRecoveryError('');
  };

  const switchClientTab = (tab: ClientTab) => {
    setClientTab(tab);
    setErrorMsg('');
    setRecoveryError('');
    setSuccessMsg('');
    if (tab === 'forgot_password' && clientEmail) {
      setRecoveryEmail(clientEmail);
    }
  };

  const switchAdminTab = (tab: AdminTab) => {
    setAdminTab(tab);
    setErrorMsg('');
    setRecoveryError('');
    setSuccessMsg('');
    if (tab === 'forgot_password' && adminEmail) {
      setRecoveryEmail(adminEmail);
    }
  };

  // Handler de Redefinição de Senha
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setErrorMsg('');
    setSuccessMsg('');
    setRecoveryError('');

    const cleanEmail = recoveryEmail.trim().toLowerCase();
    const cleanPass = newPassword.trim();
    const cleanConfirm = confirmNewPassword.trim();
    const cleanDoc = recoveryDocument.trim();

    if (!cleanEmail) {
      setRecoveryError('Informe o e-mail cadastrado na Global Exchange.');
      return;
    }

    if (!cleanDoc) {
      setRecoveryError('Informe obrigatoriamente o CPF ou CNPJ cadastrado do titular.');
      return;
    }

    if (cleanPass.length < 6) {
      setRecoveryError('A nova senha deve conter pelo menos 6 caracteres.');
      return;
    }

    if (cleanPass !== cleanConfirm) {
      setRecoveryError('A confirmação de senha não coincide com a nova senha digitada.');
      return;
    }

    setRecoveryLoading(true);
    // Artificial jitter contra timing attacks
    await new Promise((r) => setTimeout(r, 400));

    try {
      const res = await AuthService.resetPassword({
        email: cleanEmail,
        newPassword: cleanPass,
        role: portal,
        document: cleanDoc,
        reason:
          portal === 'admin'
            ? 'Redefinição de senha administrativa com validação documental'
            : 'Redefinição de senha comercial via portal do cliente',
      });

      setRecoveryLoading(false);

      if (!res.success) {
        registerAuthFailure(res.error || 'Não foi possível redefinir a senha.');
        setRecoveryError(res.error || 'Dados de titularidade não conferem.');
        return;
      }

      registerAuthSuccess();

      if (portal === 'client') {
        setClientEmail(cleanEmail);
        setClientPassword('');
        setClientTab('login');
        setSuccessMsg(`✅ Senha do cliente (${cleanEmail}) redefinida com sucesso! Digite sua nova senha para entrar.`);
      } else {
        setAdminEmail(cleanEmail);
        setAdminPassword('');
        setAdminTab('login');
        setSuccessMsg(`✅ Senha administrativa (${cleanEmail}) redefinida com sucesso! Digite sua nova senha para entrar no Painel.`);
      }

      clearRecoveryFields();
    } catch (err: any) {
      setRecoveryLoading(false);
      registerAuthFailure('Erro na recuperação: ' + (err?.message || 'Falha de comunicação'));
    }
  };

  // Client Login
  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = clientEmail.trim().toLowerCase();
    const pass = clientPassword.trim();

    if (!cleanEmail || !pass) {
      setErrorMsg('Informe seu e-mail e senha cadastrados.');
      return;
    }

    // Segregação estrita de funções
    if (cleanEmail !== 'geonimatos31@hotmail.com') {
      const existingAcc = StorageService.findAccount(cleanEmail);
      const isStrictAdm = existingAcc?.role === 'admin' || (isMasterAdminEmail(cleanEmail) && existingAcc?.role !== 'client');

      if (isStrictAdm) {
        setErrorMsg(
          '⚠️ Segregação de Funções: Este e-mail pertence à Administração Geral da Global Exchange. Administradores operam exclusivamente no Painel Administrativo (/admin).'
        );
        return;
      }
    }

    setLoading(true);
    // Jitter contra timing attacks
    await new Promise((r) => setTimeout(r, 350));

    try {
      const res = await AuthService.login(cleanEmail, pass, 'client');
      setLoading(false);

      if (res.requiresMfa) {
        setPendingMfaPortal('client');
        setMfaCode('');
        setErrorMsg('');
        return;
      }

      if (!res.success || !res.user) {
        registerAuthFailure(res.error || 'Credenciais de acesso incorretas.');
        return;
      }

      registerAuthSuccess();
      onLoginSuccess(res.user, 'client');
    } catch (err: any) {
      setLoading(false);
      registerAuthFailure('Erro ao autenticar: ' + (err?.message || 'Falha inesperada'));
    }
  };

  // Client Registration
  const handleClientRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = clientEmail.trim().toLowerCase();
    const cleanDoc = clientDocument.trim();
    const cleanName = clientName.trim();
    const pass = clientPassword.trim();

    if (!cleanName || !cleanEmail || !cleanDoc || !pass) {
      setErrorMsg('Todos os campos são obrigatórios para o cadastro.');
      return;
    }

    if (cleanEmail !== 'geonimatos31@hotmail.com') {
      const existingAccReg = StorageService.findAccount(cleanEmail);
      const isAdmReg = existingAccReg?.role === 'admin' || (isMasterAdminEmail(cleanEmail) && existingAccReg?.role !== 'client');

      if (isAdmReg) {
        setErrorMsg(
          '⚠️ Este e-mail institucional pertence à Administração Geral e não pode ser cadastrado como cliente comercial.'
        );
        return;
      }
    }

    if (pass.length < 6) {
      setErrorMsg('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));

    try {
      const res = await AuthService.register({
        name: cleanName,
        email: cleanEmail,
        document: cleanDoc,
        password: pass,
        role: 'client',
      });

      setLoading(false);

      if (!res.success) {
        registerAuthFailure(res.error || 'Erro ao realizar cadastro.');
        return;
      }

      registerAuthSuccess();
      setClientEmail('');
      setClientPassword('');
      setClientName('');
      setClientDocument('');
      setClientTab('login');
      setSuccessMsg(
        `✅ Conta comercial de ${cleanName} cadastrada com sucesso! Para sua proteção, digite seu e-mail e senha abaixo para entrar.`
      );
    } catch (err: any) {
      setLoading(false);
      registerAuthFailure('Erro no registro: ' + (err?.message || 'Falha de comunicação'));
    }
  };

  // Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = adminEmail.trim().toLowerCase();
    const pass = adminPassword.trim();

    if (!cleanEmail || !pass) {
      setErrorMsg('Informe o e-mail institucional e senha de administrador.');
      return;
    }

    const existingAccount = StorageService.findAccount(cleanEmail);
    if (
      existingAccount &&
      existingAccount.role === 'client' &&
      !isMasterAdminEmail(cleanEmail) &&
      !isAdminEmail(cleanEmail) &&
      !isGeoniEmail(cleanEmail)
    ) {
      setErrorMsg(
        '⚠️ Acesso não autorizado: Este e-mail pertence a uma conta comercial de cliente. Por favor, acerte seu acesso pela aba "Página do Cliente".'
      );
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 450));

    try {
      const res = await AuthService.login(cleanEmail, pass, 'admin');
      setLoading(false);

      if (res.requiresMfa) {
        setPendingMfaPortal('admin');
        setMfaCode('');
        setErrorMsg('');
        return;
      }

      if (!res.success || !res.user) {
        let err = res.error || 'Credenciais de administrador inválidas.';
        if (err.includes('não cadastrado') && (isMasterAdminEmail(cleanEmail) || isGeoniEmail(cleanEmail))) {
          err = 'Senha administrativa incorreta. Verifique suas credenciais.';
        }
        registerAuthFailure(err);
        return;
      }

      registerAuthSuccess();
      onLoginSuccess(res.user, 'admin');
    } catch (err: any) {
      setLoading(false);
      registerAuthFailure('Erro na autenticação administrativa: ' + (err?.message || 'Falha inesperada'));
    }
  };

  // Admin Register Protection (Governança Restrita - Bloqueio de Auto-inscrição Pública)
  const handleAdminRegisterBlocked = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(
      '🔒 Acesso Restrito pela Governança Engecema: A criação de novos operadores e administradores é realizada exclusivamente por delegação interna com aprovação do Administrador Geral. Não é permitida a auto-inscrição pública por motivos de segurança e defesa contra ataques cibernéticos.'
    );
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingMfaPortal || loading || lockoutSeconds > 0) return;
    setLoading(true);
    setErrorMsg('');
    const res = await AuthService.verifyMfa(mfaCode.trim());
    setLoading(false);
    if (!res.success || !res.user) {
      registerAuthFailure(res.error || 'Código autenticador inválido.');
      return;
    }
    const verifiedPortal = pendingMfaPortal;
    setPendingMfaPortal(null);
    setMfaCode('');
    registerAuthSuccess();
    onLoginSuccess(res.user, verifiedPortal);
  };

  const isFormLocked = lockoutSeconds > 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 w-full">
      <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative text-[#eaecef] my-auto">
        {/* Logo and Brand */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#f0b90b] text-[#0b0e11] font-black flex items-center justify-center text-xl mx-auto mb-3 shadow">
            GX
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#f0b90b]">
            {portal === 'admin' ? 'PAINEL DAS CONFIGURAÇÕES' : 'PÁGINA DO CLIENTE'}
          </h2>
          <p className="text-xs text-[#848e9c] mt-0.5">
            {portal === 'admin'
              ? 'Acesso Exclusivo para Administração & Governança Engecema'
              : 'Acesso Exclusivo para Clientes: Custódia & Negociação'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2.5">
            <span
              className={`text-[10px] border px-2.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 ${
                portal === 'admin'
                  ? 'bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30'
                  : 'bg-[#02c076]/15 text-[#02c076] border-[#02c076]/30'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              {portal === 'admin' ? 'Administração Exclusiva' : 'Área Comercial do Cliente'}
            </span>
          </div>
        </div>

        {/* Portal Switcher Tabs (Abas que funcionam como botões) */}
        <div role="tablist" aria-label="Portal de Acesso" className="grid grid-cols-2 gap-1.5 p-1 bg-[#0b0e11] rounded-lg border border-[#2f343b] mb-5">
          <button
            type="button"
            role="tab"
            aria-selected={portal === 'client'}
            onClick={() => {
              if (isFormLocked) return;
              setPortal('client');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            disabled={isFormLocked}
            className={`py-2 px-2.5 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              portal === 'client'
                ? 'bg-[#02c076] text-black shadow'
                : 'text-[#848e9c] hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Página do Cliente
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={portal === 'admin'}
            onClick={() => {
              if (isFormLocked) return;
              setPortal('admin');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            disabled={isFormLocked}
            className={`py-2 px-2.5 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              portal === 'admin'
                ? 'bg-[#f0b90b] text-black shadow'
                : 'text-[#848e9c] hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Configurações (/admin)
          </button>
        </div>

        {/* Banner de Bloqueio de Segurança Anti-Ataque Hacker */}
        {isFormLocked && (
          <div className="mb-4 p-3.5 bg-[#cf304a]/20 border-2 border-[#cf304a] text-[#cf304a] text-xs rounded-lg font-semibold flex items-center gap-3 animate-pulse">
            <Clock className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-bold uppercase tracking-wider text-white">Bloqueio de Segurança Ativo</div>
              <p className="text-[11px] mt-0.5 text-[#ff8090]">
                Múltiplas tentativas com falha detectadas. Botões travados por <strong>{lockoutSeconds} segundos</strong> contra ataques de força bruta.
              </p>
            </div>
          </div>
        )}

        {/* Feedback Alerts */}
        {errorMsg && !isFormLocked && (
          <div className="mb-4 p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded-lg font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-lg font-medium flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ============================================================== */}
        {/* PORTAL DO CLIENTE                                              */}
        {/* ============================================================== */}
        {portal === 'client' && (
          <div>
            <div className="mb-3.5 p-2.5 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-[11px] text-[#848e9c] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#02c076] shrink-0" />
              <span>
                Área exclusiva para clientes e investidores. Contas de administração geral operam exclusivamente em <strong className="text-[#f0b90b]">Configurações (/admin)</strong>.
              </span>
            </div>

            {/* Abas Secundárias do Cliente */}
            <div role="tablist" aria-label="Operações do Cliente" className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4 text-xs font-bold gap-1 sm:gap-2">
              <button
                type="button"
                role="tab"
                aria-selected={clientTab === 'login'}
                onClick={() => switchClientTab('login')}
                disabled={isFormLocked}
                className={`pb-1 border-b-2 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  clientTab === 'login'
                    ? 'border-[#f0b90b] text-[#f0b90b]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Entrar (Login)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={clientTab === 'register'}
                onClick={() => switchClientTab('register')}
                disabled={isFormLocked}
                className={`pb-1 border-b-2 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  clientTab === 'register'
                    ? 'border-[#02c076] text-[#02c076]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Cadastre-se
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={clientTab === 'forgot_password'}
                onClick={() => switchClientTab('forgot_password')}
                disabled={isFormLocked}
                className={`pb-1 border-b-2 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  clientTab === 'forgot_password'
                    ? 'border-[#38bdf8] text-[#38bdf8]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Esqueci a Senha
              </button>
            </div>

            {/* Client Login Form */}
            {clientTab === 'login' && (
              <form onSubmit={handleClientLogin} autoComplete="off" className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="client_email_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail cadastrado
                    </label>
                    {clientEmail && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setClientEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition cursor-pointer"
                        title="Limpar e-mail"
                      >
                        <X className="w-3 h-3" />
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    id="client_email_input"
                    name="client_email_field"
                    type="email"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || loading}
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="client_password_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      Senha de acesso
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => switchClientTab('forgot_password')}
                        disabled={isFormLocked}
                        className="text-[11px] text-[#f0b90b] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                        title="Recuperar senha"
                      >
                        Esqueci minha senha
                      </button>
                      {clientPassword && !isFormLocked && (
                        <button
                          type="button"
                          onClick={() => setClientPassword('')}
                          className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition cursor-pointer"
                          title="Limpar senha"
                        >
                          <X className="w-3 h-3" />
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      id="client_password_input"
                      name="client_password_field"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      disabled={isFormLocked || loading}
                      value={clientPassword}
                      onChange={(e) => setClientPassword(e.target.value)}
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isFormLocked}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white cursor-pointer disabled:opacity-50"
                      title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#848e9c] pt-1">
                  <span className="flex items-center gap-1.5 text-[#02c076] font-medium">
                    <Shield className="w-3 h-3 text-[#02c076]" />
                    Proteção Anti-Brute Force Ativa
                  </span>
                  {(clientEmail || clientPassword) && !isFormLocked && (
                    <button
                      type="button"
                      onClick={clearClientFields}
                      className="text-[#f0b90b] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                      title="Limpar formulário"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || isFormLocked}
                  className="w-full py-3 bg-[#f0b90b] hover:bg-[#e0ab07] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isFormLocked ? (
                    <>
                      <Clock className="w-4 h-4" />
                      Bloqueio de Segurança: {lockoutSeconds}s
                    </>
                  ) : loading ? (
                    'Verificando credenciais com segurança...'
                  ) : (
                    'Entrar na Plataforma'
                  )}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c] flex flex-col gap-1.5">
                  <div>
                    Esqueceu sua senha?{' '}
                    <button
                      type="button"
                      onClick={() => switchClientTab('forgot_password')}
                      disabled={isFormLocked}
                      className="text-[#f0b90b] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div>
                    Não possui conta comercial?{' '}
                    <button
                      type="button"
                      onClick={() => switchClientTab('register')}
                      disabled={isFormLocked}
                      className="text-[#02c076] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Cadastre-se aqui
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Client Registration Form */}
            {clientTab === 'register' && (
              <form onSubmit={handleClientRegister} autoComplete="off" className="space-y-3.5">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      Nome Completo / Razão Social
                    </label>
                    {clientName && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setClientName('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || loading}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#02c076] disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail comercial
                    </label>
                    {clientEmail && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setClientEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || loading}
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#02c076] disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      CPF ou CNPJ do Titular
                    </label>
                    {clientDocument && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setClientDocument('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || loading}
                    value={clientDocument}
                    onChange={(e) => setClientDocument(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#02c076] disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      Criar Senha de Acesso
                    </label>
                    {clientPassword && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setClientPassword('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      disabled={isFormLocked || loading}
                      value={clientPassword}
                      onChange={(e) => setClientPassword(e.target.value)}
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#02c076] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isFormLocked}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white cursor-pointer disabled:opacity-50"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#848e9c] pt-1">
                  <span className="flex items-center gap-1.5 text-[#02c076] font-medium">
                    <ShieldCheck className="w-3 h-3 text-[#02c076]" />
                    Cadastro Criptografado e Seguro
                  </span>
                  {(clientName || clientEmail || clientDocument || clientPassword) && !isFormLocked && (
                    <button
                      type="button"
                      onClick={clearClientFields}
                      className="text-[#02c076] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                      title="Limpar campos do cadastro"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || isFormLocked}
                  className="w-full py-3 bg-[#02c076] hover:bg-[#02a766] text-white font-bold rounded text-sm transition shadow mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isFormLocked ? (
                    <>
                      <Clock className="w-4 h-4" />
                      Bloqueio de Segurança: {lockoutSeconds}s
                    </>
                  ) : loading ? (
                    'Processando cadastro com segurança...'
                  ) : (
                    'Concluir Cadastro Comercial'
                  )}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c] flex flex-col gap-1.5">
                  <div>
                    Já possui conta?{' '}
                    <button
                      type="button"
                      onClick={() => switchClientTab('login')}
                      disabled={isFormLocked}
                      className="text-[#f0b90b] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Fazer Login
                    </button>
                    {' • '}
                    <button
                      type="button"
                      onClick={() => switchClientTab('forgot_password')}
                      disabled={isFormLocked}
                      className="text-[#38bdf8] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Client Forgot Password Form */}
            {clientTab === 'forgot_password' && (
              <form onSubmit={handlePasswordReset} autoComplete="off" className="space-y-4">
                <div className="p-3 bg-[#0b0e11] border border-[#2f343b] rounded-lg text-xs">
                  <div className="flex items-center gap-2 text-[#38bdf8] font-bold mb-1">
                    <KeyRound className="w-4 h-4 text-[#38bdf8]" />
                    Recuperação de Senha do Cliente (Validação de Titularidade)
                  </div>
                  <p className="text-[#848e9c] text-[11px] leading-relaxed">
                    Para proteção contra sequestro de conta, informe seu e-mail e CPF/CNPJ oficial cadastrado. A nova senha só é aplicada após validação exata do documento.
                  </p>
                </div>

                {recoveryError && !isFormLocked && (
                  <div className="p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded-lg font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{recoveryError}</span>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_client_email" className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail cadastrado
                    </label>
                    {recoveryEmail && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setRecoveryEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#38bdf8] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    id="recovery_client_email"
                    type="email"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || recoveryLoading}
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#38bdf8] disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_client_doc" className="block text-xs font-semibold text-[#b7bdc6]">
                      CPF ou CNPJ do Titular (Obrigatório para Confirmação)
                    </label>
                    {recoveryDocument && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setRecoveryDocument('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#38bdf8] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    id="recovery_client_doc"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || recoveryLoading}
                    value={recoveryDocument}
                    onChange={(e) => setRecoveryDocument(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#38bdf8] disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_client_new_pass" className="block text-xs font-semibold text-[#b7bdc6]">
                      Nova Senha de Acesso
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="recovery_client_new_pass"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      disabled={isFormLocked || recoveryLoading}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#38bdf8] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={isFormLocked}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white cursor-pointer disabled:opacity-50"
                      title={showNewPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_client_confirm_pass" className="block text-xs font-semibold text-[#b7bdc6]">
                      Confirmar Nova Senha
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="recovery_client_confirm_pass"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      disabled={isFormLocked || recoveryLoading}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#38bdf8] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={isFormLocked}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white cursor-pointer disabled:opacity-50"
                      title={showConfirmPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#848e9c] pt-1">
                  <span className="flex items-center gap-1.5 text-[#38bdf8] font-medium">
                    <ShieldCheck className="w-3 h-3 text-[#38bdf8]" />
                    Validação Criptográfica de Titularidade
                  </span>
                  {(recoveryEmail || recoveryDocument || newPassword || confirmNewPassword) && !isFormLocked && (
                    <button
                      type="button"
                      onClick={clearRecoveryFields}
                      className="text-[#38bdf8] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                      title="Limpar campos"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={recoveryLoading || isFormLocked}
                  className="w-full py-3 bg-[#38bdf8] hover:bg-[#0284c7] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isFormLocked ? (
                    <>
                      <Clock className="w-4 h-4" />
                      Bloqueio de Segurança: {lockoutSeconds}s
                    </>
                  ) : recoveryLoading ? (
                    'Validando titularidade e redefinindo...'
                  ) : (
                    'Salvar Nova Senha do Cliente'
                  )}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  <button
                    type="button"
                    onClick={() => switchClientTab('login')}
                    disabled={isFormLocked}
                    className="inline-flex items-center gap-1.5 text-[#f0b90b] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Voltar para o Login
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* PORTAL ADMINISTRATIVO                                          */}
        {/* ============================================================== */}
        {portal === 'admin' && (
          <div>
            <div className="p-3 bg-[#0b0e11] border border-[#3a414b] rounded-lg mb-4 text-xs">
              <div className="flex items-center gap-2 text-[#f0b90b] font-bold mb-1">
                <ShieldAlert className="w-4 h-4" />
                Painel da Administração Engecema (Acesso Restrito)
              </div>
              <p className="text-[#848e9c] text-[11px] leading-relaxed">
                Área de governança e custódia institucional. Acesso restrito a operadores e administradores previamente credenciados pela governança corporativa.
              </p>
            </div>

            {/* Abas Secundárias de Administração (Sem brecha de auto-inscrição aberta) */}
            <div role="tablist" aria-label="Operações Administrativas" className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4 text-xs font-bold gap-1 sm:gap-2">
              <button
                type="button"
                role="tab"
                aria-selected={adminTab === 'login'}
                onClick={() => switchAdminTab('login')}
                disabled={isFormLocked}
                className={`pb-1 border-b-2 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  adminTab === 'login'
                    ? 'border-[#f0b90b] text-[#f0b90b]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Entrar (Login)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={adminTab === 'forgot_password'}
                onClick={() => switchAdminTab('forgot_password')}
                disabled={isFormLocked}
                className={`pb-1 border-b-2 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  adminTab === 'forgot_password'
                    ? 'border-[#f0b90b] text-[#f0b90b]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Recuperar Acesso
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={adminTab === 'register'}
                onClick={() => switchAdminTab('register')}
                disabled={isFormLocked}
                className={`pb-1 border-b-2 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  adminTab === 'register'
                    ? 'border-[#38bdf8] text-[#38bdf8]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Credenciamento
              </button>
            </div>

            {/* Sub-tab: Login de Administrador */}
            {adminTab === 'login' && (
              <form onSubmit={handleAdminLogin} autoComplete="off" className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="admin_email_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail Institucional de Administrador
                    </label>
                    {adminEmail && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setAdminEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition cursor-pointer"
                        title="Limpar e-mail"
                      >
                        <X className="w-3 h-3" />
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    id="admin_email_input"
                    name="admin_email_field"
                    type="email"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || loading}
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="admin_password_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      Senha de Administrador
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => switchAdminTab('forgot_password')}
                        disabled={isFormLocked}
                        className="text-[11px] text-[#f0b90b] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                        title="Recuperar senha"
                      >
                        Esqueci minha senha
                      </button>
                      {adminPassword && !isFormLocked && (
                        <button
                          type="button"
                          onClick={() => setAdminPassword('')}
                          className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition cursor-pointer"
                          title="Limpar senha"
                        >
                          <X className="w-3 h-3" />
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      id="admin_password_input"
                      name="admin_password_field"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      disabled={isFormLocked || loading}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isFormLocked}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white cursor-pointer disabled:opacity-50"
                      title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#848e9c] pt-1">
                  <span className="flex items-center gap-1.5 text-[#f0b90b] font-medium">
                    <ShieldCheck className="w-3 h-3 text-[#f0b90b]" />
                    Canal Administrativo Seguro e Criptografado
                  </span>
                  {(adminEmail || adminPassword) && !isFormLocked && (
                    <button
                      type="button"
                      onClick={clearAdminFields}
                      className="text-[#f0b90b] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                      title="Limpar formulário"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || isFormLocked}
                  className="w-full py-3 bg-[#f0b90b] hover:bg-[#e0ab07] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isFormLocked ? (
                    <>
                      <Clock className="w-4 h-4" />
                      Bloqueio de Segurança: {lockoutSeconds}s
                    </>
                  ) : loading ? (
                    'Validando credenciais institucionais...'
                  ) : (
                    'Entrar no Painel de Controle'
                  )}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c] flex flex-col gap-1.5">
                  <div>
                    Esqueceu suas credenciais?{' '}
                    <button
                      type="button"
                      onClick={() => switchAdminTab('forgot_password')}
                      disabled={isFormLocked}
                      className="text-[#f0b90b] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Recuperar Acesso Administrativo
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Sub-tab: Credenciamento Administrativo (Protegido contra Auto-inscrição Pública) */}
            {adminTab === 'register' && (
              <form onSubmit={handleAdminRegisterBlocked} autoComplete="off" className="space-y-4">
                <div className="p-4 bg-[#0b0e11] border border-[#f0b90b]/40 rounded-lg text-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-[#f0b90b] font-bold">
                    <Lock className="w-4 h-4 text-[#f0b90b]" />
                    Credenciamento Restrito à Governança Institucional
                  </div>
                  <p className="text-[#b7bdc6] text-[11px] leading-relaxed">
                    Por conformidade com os padrões de segurança bancária e defesa contra acessos indevidos (OWASP ASVS), o cadastro de novos administradores <strong>não está aberto ao público</strong>.
                  </p>
                  <p className="text-[#848e9c] text-[11px] leading-relaxed">
                    Novos operadores e gestores de custódia são provisionados diretamente pela Diretoria de Tecnologia da Engecema após auditoria de segurança.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Chave de Token de Governança Interna (Apenas Operadores)
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck="false"
                    disabled={isFormLocked}
                    value={adminGovernanceKey}
                    onChange={(e) => setAdminGovernanceKey(e.target.value)}
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                  <span className="text-[10px] text-[#848e9c] block mt-1">
                    * Requer assinatura criptográfica fornecida pela Engecema.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isFormLocked}
                  className="w-full py-3 bg-[#2b3139] hover:bg-[#323942] border border-[#f0b90b]/50 text-[#f0b90b] font-bold rounded text-sm transition shadow mt-2 cursor-pointer"
                >
                  Validar Token de Governança
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  <button
                    type="button"
                    onClick={() => switchAdminTab('login')}
                    className="inline-flex items-center gap-1.5 text-[#f0b90b] hover:underline font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Voltar para o Login Administrativo
                  </button>
                </div>
              </form>
            )}

            {/* Sub-tab: Recuperação de Senha de Administrador (Validação Obrigatória) */}
            {adminTab === 'forgot_password' && (
              <form onSubmit={handlePasswordReset} autoComplete="off" className="space-y-4">
                <div className="p-3 bg-[#0b0e11] border border-[#3a414b] rounded-lg text-xs">
                  <div className="flex items-center gap-2 text-[#f0b90b] font-bold mb-1">
                    <KeyRound className="w-4 h-4 text-[#f0b90b]" />
                    Recuperação de Acesso da Administração (Validação Obrigatória)
                  </div>
                  <p className="text-[#848e9c] text-[11px] leading-relaxed">
                    Para proteção institucional contra sequestro de conta administrativa, informe seu e-mail corporativo e o documento cadastrado (CPF/CNPJ). A conferência documental é estrita e mandatória.
                  </p>
                </div>

                {recoveryError && !isFormLocked && (
                  <div className="p-3 bg-[#cf304a]/15 border border-[#cf304a]/40 text-[#cf304a] text-xs rounded-lg font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{recoveryError}</span>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_admin_email" className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail Institucional de Administrador
                    </label>
                    {recoveryEmail && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setRecoveryEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    id="recovery_admin_email"
                    type="email"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || recoveryLoading}
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b] disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_admin_doc" className="block text-xs font-semibold text-[#b7bdc6]">
                      CPF ou CNPJ Cadastrado da Governança (Obrigatório)
                    </label>
                    {recoveryDocument && !isFormLocked && (
                      <button
                        type="button"
                        onClick={() => setRecoveryDocument('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    id="recovery_admin_doc"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    disabled={isFormLocked || recoveryLoading}
                    value={recoveryDocument}
                    onChange={(e) => setRecoveryDocument(e.target.value)}
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b] disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_admin_new_pass" className="block text-xs font-semibold text-[#b7bdc6]">
                      Nova Senha de Administrador
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="recovery_admin_new_pass"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      disabled={isFormLocked || recoveryLoading}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={isFormLocked}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white cursor-pointer disabled:opacity-50"
                      title={showNewPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="recovery_admin_confirm_pass" className="block text-xs font-semibold text-[#b7bdc6]">
                      Confirmar Nova Senha
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="recovery_admin_confirm_pass"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      disabled={isFormLocked || recoveryLoading}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={isFormLocked}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white cursor-pointer disabled:opacity-50"
                      title={showConfirmPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#848e9c] pt-1">
                  <span className="flex items-center gap-1.5 text-[#f0b90b] font-medium">
                    <ShieldCheck className="w-3 h-3 text-[#f0b90b]" />
                    Auditoria Criptográfica de Governança
                  </span>
                  {(recoveryEmail || recoveryDocument || newPassword || confirmNewPassword) && !isFormLocked && (
                    <button
                      type="button"
                      onClick={clearRecoveryFields}
                      className="text-[#f0b90b] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                      title="Limpar campos"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={recoveryLoading || isFormLocked}
                  className="w-full py-3 bg-[#f0b90b] hover:bg-[#e0ab07] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isFormLocked ? (
                    <>
                      <Clock className="w-4 h-4" />
                      Bloqueio de Segurança: {lockoutSeconds}s
                    </>
                  ) : recoveryLoading ? (
                    'Auditando titularidade administrativa...'
                  ) : (
                    'Salvar Nova Senha de Administrador'
                  )}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  <button
                    type="button"
                    onClick={() => switchAdminTab('login')}
                    disabled={isFormLocked}
                    className="inline-flex items-center gap-1.5 text-[#38bdf8] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Voltar para o Login Administrativo
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Security Notice */}
        <div className="mt-6 pt-4 border-t border-[#2f343b] text-center text-[11px] text-[#848e9c]">
          <span className="inline-flex items-center gap-1.5 text-[#02c076] font-medium">
            <Lock className="w-3 h-3" />
            Acesso Seguro e Auditado • Engecema Tecnologia (OWASP ASVS Protegido)
          </span>
        </div>
      </div>
      {pendingMfaPortal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="presentation">
          <section className="w-full max-w-sm rounded-lg border border-[#474d57] bg-[#1e2329] p-6 text-[#eaecef] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="mfa-dialog-title">
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-[#02c076]" />
              <h2 id="mfa-dialog-title" className="text-base font-bold">Verificação em duas etapas</h2>
            </div>
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <label htmlFor="mfa-code" className="block text-xs font-semibold text-[#b7bdc6]">Código do aplicativo autenticador</label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,8}"
                maxLength={8}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                disabled={loading || isFormLocked}
                required
                className="w-full rounded border border-[#474d57] bg-[#2b3139] px-3 py-2.5 text-center text-lg tracking-[0.3em] text-white focus:border-[#02c076] focus:outline-none disabled:opacity-50"
              />
              {errorMsg && <p role="alert" className="text-xs text-[#ff8090]">{errorMsg}</p>}
              <button
                type="submit"
                disabled={loading || isFormLocked || mfaCode.length < 6}
                className="w-full rounded bg-[#02c076] py-2.5 text-sm font-bold text-black disabled:opacity-50"
              >
                {loading ? 'Validando código...' : 'Confirmar código'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => { setPendingMfaPortal(null); setMfaCode(''); setErrorMsg(''); }}
                className="w-full py-2 text-xs font-semibold text-[#848e9c] hover:text-white disabled:opacity-50"
              >
                Cancelar e voltar ao login
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
