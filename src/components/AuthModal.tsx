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
} from 'lucide-react';

interface AuthModalProps {
  onLoginSuccess: (user: User) => void;
}

type AuthPortal = 'client' | 'admin';
type ClientTab = 'login' | 'register';
type AdminTab = 'login' | 'register';

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess }) => {
  const [portal, setPortal] = useState<AuthPortal>('client');
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
  const [adminReason, setAdminReason] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{ hasSupabase: boolean; configured: boolean }>({
    hasSupabase: false,
    configured: false,
  });

  useEffect(() => {
    AuthService.getSupabaseStatus().then((status) => {
      setSupabaseStatus(status);
    });
  }, []);

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

      // CRÍTICO: Após o cadastro, NUNCA entra direto!
      // Redireciona para a aba de login, preserva o e-mail cadastrado e solicita a senha para autenticação
      const registeredEmail = clientEmail.trim();
      setClientPassword('');
      setClientTab('login');
      setSuccessMsg(
        `✅ Conta comercial de ${clientName.trim()} cadastrada com sucesso! Para sua segurança, confirme suas credenciais digitando sua senha de acesso abaixo para autenticar.`
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

      setAdminPassword('');
      setAdminTab('login');
      setSuccessMsg(
        res.message ||
          '✅ Cadastro administrativo realizado com sucesso! Digite sua senha para autenticar o acesso.'
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
            GLOBAL EXCHANGE
          </h2>
          <p className="text-xs text-[#848e9c] mt-0.5">
            Custódia e Negociação Institucional Engecema
          </p>
          <div className="flex items-center justify-center gap-2 mt-2.5">
            <span className="text-[10px] bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 px-2.5 py-0.5 rounded font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#02c076]" />
              Autenticação Obrigatória
            </span>
            <span className="text-[10px] bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 px-2 py-0.5 rounded font-mono font-medium flex items-center gap-1">
              <Database className="w-3 h-3 text-[#38bdf8]" />
              Supabase Sync
            </span>
          </div>
        </div>

        {/* Portal Switcher (Client vs Exclusive Admin) */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#0b0e11] rounded-lg border border-[#2f343b] mb-5">
          <button
            type="button"
            onClick={() => {
              setPortal('client');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              portal === 'client'
                ? 'bg-[#f0b90b] text-black shadow'
                : 'text-[#848e9c] hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Área do Cliente
          </button>
          <button
            type="button"
            onClick={() => {
              setPortal('admin');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              portal === 'admin'
                ? 'bg-[#f0b90b] text-black shadow'
                : 'text-[#848e9c] hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Portal Administrativo
          </button>
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
                onClick={() => {
                  setClientTab('login');
                  setErrorMsg('');
                }}
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
                onClick={() => {
                  setClientTab('register');
                  setErrorMsg('');
                }}
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
              <form onSubmit={handleClientLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    E-mail institucional cadastrado
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="seu-email@dominio.com"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Senha de acesso
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={clientPassword}
                      onChange={(e) => setClientPassword(e.target.value)}
                      placeholder="Sua senha cadastrada"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
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
                  className="w-full py-3 bg-[#f0b90b] hover:bg-[#e0ab07] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2"
                >
                  {loading ? 'Verificando cadastro...' : 'Entrar na Plataforma'}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  Não possui cadastro?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setClientTab('register');
                      setErrorMsg('');
                    }}
                    className="text-[#f0b90b] hover:underline font-semibold"
                  >
                    Cadastre-se aqui
                  </button>
                </div>
              </form>
            ) : (
              /* Client Registration Form */
              <form onSubmit={handleClientRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Nome Completo / Razão Social
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Nome do titular ou empresa"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    E-mail institucional
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="cliente@empresa.com.br"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    CPF ou CNPJ
                  </label>
                  <input
                    type="text"
                    value={clientDocument}
                    onChange={(e) => setClientDocument(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Criar Senha de Acesso
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={clientPassword}
                      onChange={(e) => setClientPassword(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
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
                    onClick={() => {
                      setClientTab('login');
                      setErrorMsg('');
                    }}
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
                onClick={() => {
                  setAdminTab('login');
                  setErrorMsg('');
                }}
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
                onClick={() => {
                  setAdminTab('register');
                  setErrorMsg('');
                }}
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
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    E-mail do Administrador
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="ex: geonimatos31@gmail.com"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Senha de Administrador
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Digite sua senha cadastrada"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
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
                  className="w-full py-3 bg-[#f0b90b] hover:bg-[#e0ab07] text-[#0b0e11] font-bold rounded text-sm transition shadow mt-2"
                >
                  {loading ? 'Validando acesso...' : 'Entrar no Painel de Controle'}
                </button>

                <div className="pt-2 text-center text-xs text-[#848e9c]">
                  Ainda não configurou sua senha de administrador?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTab('register');
                      setErrorMsg('');
                    }}
                    className="text-[#38bdf8] hover:underline font-semibold block mt-1 mx-auto"
                  >
                    Cadastre-se aqui (Administração)
                  </button>
                </div>
              </form>
            ) : (
              /* Sub-tab: Cadastre-se Aqui (Administração) */
              <form onSubmit={handleAdminRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Ex: Geoni Matos ou Nome do Gestor"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    E-mail de Administrador
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="ex: geonimatos31@gmail.com ou email@engecema.com.br"
                    required
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                  <span className="text-[10px] text-[#848e9c] block mt-1">
                    * Se preencher <strong className="text-[#f0b90b]">{MASTER_ADMIN_EMAIL}</strong>, configura a conta Master do Administrador Geral.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    CPF ou Documento Institucional
                  </label>
                  <input
                    type="text"
                    value={adminDocument}
                    onChange={(e) => setAdminDocument(e.target.value)}
                    placeholder="000.000.000-00 ou 05.368.602/0001-10"
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b7bdc6] mb-1">
                    Criar Senha de Administrador
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#f0b90b]"
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
                    className="w-full bg-[#2b3139] border border-[#474d57] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f0b90b]"
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
                    onClick={() => {
                      setAdminTab('login');
                      setErrorMsg('');
                    }}
                    className="text-[#f0b90b] hover:underline font-semibold"
                  >
                    Fazer Login de Administrador
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Security Notice (No automatic email / password bypass shortcuts!) */}
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
