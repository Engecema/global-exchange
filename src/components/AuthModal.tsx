import React, { useState, useEffect } from 'react';
import { User } from '../types/exchange';
import { StorageService, MASTER_ADMIN_EMAIL } from '../services/storage';
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
  Database,
  ExternalLink,
  X,
  RotateCcw,
} from 'lucide-react';

interface AuthModalProps {
  onLoginSuccess: (user: User) => void;
  initialPortal?: 'client' | 'admin';
}

type AuthPortal = 'client' | 'admin';
type ClientTab = 'login' | 'register';
type AdminTab = 'login' | 'register';

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess, initialPortal }) => {
  const [portal, setPortal] = useState<AuthPortal>(initialPortal || 'client');
  const [clientTab, setClientTab] = useState<ClientTab>('login');
  const [adminTab, setAdminTab] = useState<AdminTab>('login');

  // Client fields (iniciam estritamente vazios e 100% editáveis)
  const [clientEmail, setClientEmail] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientDocument, setClientDocument] = useState('');

  // Admin fields (iniciam estritamente vazios e 100% editáveis)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminDocument, setAdminDocument] = useState('');
  const [adminReason, setAdminReason] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{ hasSupabase: boolean; configured: boolean }>({
    hasSupabase: false,
    configured: false,
  });

  // Garante campos limpos ao carregar
  useEffect(() => {
    AuthService.getSupabaseStatus().then((status) => {
      setSupabaseStatus(status);
    });

    // Limpa campos para evitar pré-preenchimento
    setClientEmail('');
    setClientPassword('');
    setClientName('');
    setClientDocument('');
    setAdminEmail('');
    setAdminPassword('');
    setAdminName('');
    setAdminDocument('');
    setAdminReason('');

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
        else if (hash === 'client') setPortal('client');
      }
    } catch {}
  }, [initialPortal]);

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
    setAdminReason('');
    setErrorMsg('');
  };

  const switchClientTab = (tab: ClientTab) => {
    setClientTab(tab);
    setErrorMsg('');
    setClientEmail('');
    setClientPassword('');
  };

  const switchAdminTab = (tab: AdminTab) => {
    setAdminTab(tab);
    setErrorMsg('');
    setAdminEmail('');
    setAdminPassword('');
  };

  // Client Login (Strict verification - rejects non-registered emails)
  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!clientEmail.trim() || !clientPassword) {
      setErrorMsg('Informe seu e-mail e senha cadastrados.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.login(clientEmail, clientPassword, 'client');
      setLoading(false);

      if (!res.success || !res.user) {
        setErrorMsg(res.error || 'Falha ao autenticar.');
        return;
      }

      onLoginSuccess(res.user);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg('Erro na autenticação: ' + (err?.message || 'Erro inesperado'));
    }
  };

  // Client Registration (Cadastro Comercial) - Exige autenticação explícita após o cadastro!
  const handleClientRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!clientName.trim() || !clientEmail.trim() || !clientDocument.trim() || !clientPassword) {
      setErrorMsg('Todos os campos são obrigatórios para o cadastro comercial.');
      return;
    }

    if (clientPassword.length < 6) {
      setErrorMsg('A senha deve conter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.register({
        name: clientName,
        email: clientEmail,
        document: clientDocument,
        password: clientPassword,
        role: 'client',
      });

      setLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao realizar cadastro.');
        return;
      }

      // Deixa campos limpos e editáveis para o login explícito
      setClientEmail('');
      setClientPassword('');
      setClientName('');
      setClientDocument('');
      setClientTab('login');
      setSuccessMsg(
        `✅ Conta comercial de ${clientName.trim()} cadastrada com sucesso! Para sua segurança, digite seu e-mail e senha cadastrados abaixo para entrar.`
      );
    } catch (err: any) {
      setLoading(false);
      setErrorMsg('Erro ao registrar usuário: ' + (err?.message || 'Falha na comunicação'));
    }
  };

  // Admin Login (Exclusive to approved admins with correct manual password)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!adminEmail.trim() || !adminPassword) {
      setErrorMsg('Informe o e-mail institucional e senha de administrador.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.login(adminEmail, adminPassword, 'admin');
      setLoading(false);

      if (!res.success || !res.user) {
        setErrorMsg(res.error || 'Acesso administrativo não autorizado.');
        return;
      }

      onLoginSuccess(res.user);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg('Erro na autenticação administrativa: ' + (err?.message || 'Erro inesperado'));
    }
  };

  // Admin Registration / Setup (Cadastro para a Administração) - Exige autenticação
  const handleAdminRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!adminEmail.trim() || !adminName.trim() || !adminPassword) {
      setErrorMsg('Nome, e-mail institucional e senha são obrigatórios.');
      return;
    }

    if (adminPassword.length < 6) {
      setErrorMsg('A senha de administrador deve conter no mínimo 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.register({
        name: adminName,
        email: adminEmail,
        document: adminDocument,
        password: adminPassword,
        role: 'admin',
        reason: adminReason,
      });

      setLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Não foi possível concluir o cadastro.');
        return;
      }

      setAdminEmail('');
      setAdminPassword('');
      setAdminName('');
      setAdminDocument('');
      setAdminReason('');
      setAdminTab('login');
      setSuccessMsg(
        res.message ||
          '✅ Cadastro administrativo realizado com sucesso! Digite seu e-mail e senha abaixo para autenticar o acesso.'
      );
    } catch (err: any) {
      setLoading(false);
      setErrorMsg('Erro no cadastro administrativo: ' + (err?.message || 'Falha'));
    }
  };

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

        {/* Feedback Alerts */}
        {errorMsg && (
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
            <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => switchClientTab('login')}
                className={`pb-1 border-b-2 transition ${
                  clientTab === 'login'
                    ? 'border-[#f0b90b] text-[#f0b90b]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                Entrar (Login)
              </button>
              <button
                type="button"
                onClick={() => switchClientTab('register')}
                className={`pb-1 border-b-2 transition ${
                  clientTab === 'register'
                    ? 'border-[#02c076] text-[#02c076]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                Cadastre-se Aqui
              </button>
            </div>

            {/* Client Login Form */}
            {clientTab === 'login' ? (
              <form onSubmit={handleClientLogin} autoComplete="off" className="space-y-4">
                {/* Anti-autofill decoy inputs */}
                <input
                  type="text"
                  name="fake_client_decoy"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="username"
                />
                <input
                  type="password"
                  name="fake_client_pass_decoy"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="current-password"
                />

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="client_email_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail cadastrado
                    </label>
                    {clientEmail && (
                      <button
                        type="button"
                        onClick={() => setClientEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition"
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="Digite seu e-mail comercial"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition placeholder:text-[#5e6673]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="client_password_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      Senha de acesso
                    </label>
                    {clientPassword && (
                      <button
                        type="button"
                        onClick={() => setClientPassword('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition"
                        title="Limpar senha"
                      >
                        <X className="w-3 h-3" />
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="client_password_input"
                      name="client_password_field"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      value={clientPassword}
                      onChange={(e) => setClientPassword(e.target.value)}
                      placeholder="Digite sua senha cadastrada"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition placeholder:text-[#5e6673]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white"
                      title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#848e9c] pt-1">
                  <span className="flex items-center gap-1.5 text-[#02c076] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#02c076]"></span>
                    Campos 100% editáveis e livres
                  </span>
                  {(clientEmail || clientPassword) && (
                    <button
                      type="button"
                      onClick={clearClientFields}
                      className="text-[#f0b90b] hover:underline flex items-center gap-1 font-medium transition"
                      title="Limpar formulário"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#f0b90b] hover:bg-[#e0ab07] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2"
                >
                  {loading ? 'Verificando cadastro...' : 'Entrar na Plataforma'}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  Não possui cadastro?{' '}
                  <button
                    type="button"
                    onClick={() => switchClientTab('register')}
                    className="text-[#f0b90b] hover:underline font-semibold"
                  >
                    Cadastre-se aqui
                  </button>
                </div>
              </form>
            ) : (
              /* Client Registration Form */
              <form onSubmit={handleClientRegister} autoComplete="off" className="space-y-3.5">
                <input
                  type="text"
                  name="fake_reg_decoy"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="username"
                />
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      Nome Completo / Razão Social
                    </label>
                    {clientName && (
                      <button
                        type="button"
                        onClick={() => setClientName('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Nome do titular ou empresa"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#02c076] placeholder:text-[#5e6673]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail institucional
                    </label>
                    {clientEmail && (
                      <button
                        type="button"
                        onClick={() => setClientEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="cliente@empresa.com.br"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#02c076] placeholder:text-[#5e6673]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      CPF ou CNPJ
                    </label>
                    {clientDocument && (
                      <button
                        type="button"
                        onClick={() => setClientDocument('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={clientDocument}
                    onChange={(e) => setClientDocument(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#02c076] placeholder:text-[#5e6673]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      Criar Senha de Acesso
                    </label>
                    {clientPassword && (
                      <button
                        type="button"
                        onClick={() => setClientPassword('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#02c076]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={clientPassword}
                      onChange={(e) => setClientPassword(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#02c076] placeholder:text-[#5e6673]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#02c076] hover:bg-[#02a766] text-white font-bold rounded text-sm transition shadow mt-2"
                >
                  {loading ? 'Cadastrando...' : 'Concluir Cadastro Comercial'}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  Já possui conta?{' '}
                  <button
                    type="button"
                    onClick={() => switchClientTab('login')}
                    className="text-[#f0b90b] hover:underline font-semibold"
                  >
                    Fazer Login
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
                Painel da Administração Engecema
              </div>
              <p className="text-[#848e9c] text-[11px] leading-relaxed">
                Área restrita de governança e custódia. Novos administradores são submetidos à aprovação formal de{' '}
                <span className="text-[#f0b90b] font-mono">{MASTER_ADMIN_EMAIL}</span>.
              </p>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-[#2f343b] mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => switchAdminTab('login')}
                className={`pb-1 border-b-2 transition flex items-center gap-1 ${
                  adminTab === 'login'
                    ? 'border-[#f0b90b] text-[#f0b90b]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Entrar (Login Admin)
              </button>
              <button
                type="button"
                onClick={() => switchAdminTab('register')}
                className={`pb-1 border-b-2 transition flex items-center gap-1 ${
                  adminTab === 'register'
                    ? 'border-[#38bdf8] text-[#38bdf8]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Cadastre-se Aqui (Administração)
              </button>
            </div>

            {/* Sub-tab: Login de Administrador */}
            {adminTab === 'login' ? (
              <form onSubmit={handleAdminLogin} autoComplete="off" className="space-y-4">
                {/* Anti-autofill decoy inputs */}
                <input
                  type="text"
                  name="fake_admin_decoy"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="username"
                />
                <input
                  type="password"
                  name="fake_admin_pass_decoy"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="current-password"
                />

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="admin_email_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail de Administrador
                    </label>
                    {adminEmail && (
                      <button
                        type="button"
                        onClick={() => setAdminEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition"
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="Digite seu e-mail de administrador"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition placeholder:text-[#5e6673]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="admin_password_input" className="block text-xs font-semibold text-[#b7bdc6]">
                      Senha de Administrador
                    </label>
                    {adminPassword && (
                      <button
                        type="button"
                        onClick={() => setAdminPassword('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#f0b90b] flex items-center gap-0.5 font-medium transition"
                        title="Limpar senha"
                      >
                        <X className="w-3 h-3" />
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="admin_password_input"
                      name="admin_password_field"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Digite sua senha cadastrada"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b] transition placeholder:text-[#5e6673]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white"
                      title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#848e9c] pt-1">
                  <span className="flex items-center gap-1.5 text-[#02c076] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#02c076]"></span>
                    Campos 100% editáveis e livres
                  </span>
                  {(adminEmail || adminPassword) && (
                    <button
                      type="button"
                      onClick={clearAdminFields}
                      className="text-[#f0b90b] hover:underline flex items-center gap-1 font-medium transition"
                      title="Limpar formulário"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#f0b90b] hover:bg-[#e0ab07] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2"
                >
                  {loading ? 'Validando acesso...' : 'Entrar no Painel de Controle'}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  Ainda não configurou sua senha de administrador?{' '}
                  <button
                    type="button"
                    onClick={() => switchAdminTab('register')}
                    className="text-[#38bdf8] hover:underline font-semibold block mt-1 mx-auto"
                  >
                    Cadastre-se aqui (Administração)
                  </button>
                </div>
              </form>
            ) : (
              /* Sub-tab: Cadastre-se Aqui (Administração) */
              <form onSubmit={handleAdminRegister} autoComplete="off" className="space-y-3.5">
                <input
                  type="text"
                  name="fake_adm_reg_decoy"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="username"
                />
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      Nome Completo
                    </label>
                    {adminName && (
                      <button
                        type="button"
                        onClick={() => setAdminName('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#38bdf8]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Nome do gestor ou administrador"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#38bdf8] placeholder:text-[#5e6673]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      E-mail de Administrador
                    </label>
                    {adminEmail && (
                      <button
                        type="button"
                        onClick={() => setAdminEmail('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#38bdf8]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="Digite o e-mail institucional"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#38bdf8] placeholder:text-[#5e6673]"
                  />
                  <span className="text-[10px] text-[#848e9c] block mt-1">
                    * E-mails autorizados: <strong className="text-[#f0b90b]">{MASTER_ADMIN_EMAIL}</strong> configuram acesso Master.
                  </span>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      CPF ou Documento Institucional
                    </label>
                    {adminDocument && (
                      <button
                        type="button"
                        onClick={() => setAdminDocument('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#38bdf8]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={adminDocument}
                    onChange={(e) => setAdminDocument(e.target.value)}
                    placeholder="000.000.000-00 ou 05.368.602/0001-10"
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#38bdf8] placeholder:text-[#5e6673]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-[#b7bdc6]">
                      Criar Senha de Administrador
                    </label>
                    {adminPassword && (
                      <button
                        type="button"
                        onClick={() => setAdminPassword('')}
                        className="text-[10px] text-[#848e9c] hover:text-[#38bdf8]"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#38bdf8] placeholder:text-[#5e6673]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Cargo / Justificativa de Acesso (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                    placeholder="Ex: Administrador Geral, Gestor de Risco, Auditoria Engecema"
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#38bdf8] placeholder:text-[#5e6673]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#38bdf8] hover:bg-[#0284c7] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2"
                >
                  {loading ? 'Processando cadastro...' : 'Concluir Cadastro de Administrador'}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  Já cadastrou a senha?{' '}
                  <button
                    type="button"
                    onClick={() => switchAdminTab('login')}
                    className="text-[#f0b90b] hover:underline font-semibold"
                  >
                    Fazer Login de Administrador
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
            Acesso Seguro e Auditado • Engecema Tecnologia
          </span>
        </div>
      </div>
    </div>
  );
};
