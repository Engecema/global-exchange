import React, { useState, useEffect } from 'react';
import { User } from '../types/exchange';
import { ShieldCheck, LogOut, Activity, Layers, TrendingUp } from 'lucide-react';
import { isAdminEmail, BITX_CORE_MAINNET, StorageService } from '../services/storage';

interface NavbarProps {
  currentUser: User | null;
  currentView: 'client' | 'admin';
  launchPrice?: string;
  onViewChange: (view: 'client' | 'admin') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentView,
  launchPrice,
  onViewChange,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'admin' || (currentUser?.email && isAdminEmail(currentUser.email));
  const activePriceNum = parseFloat(launchPrice || StorageService.getLaunchPrice()) || BITX_CORE_MAINNET.officialPrice;
  const [liveUsdRate, setLiveUsdRate] = useState<number>(() => StorageService.getUsdBrlRate() || 5.43);

  useEffect(() => {
    const handleDollarUpdated = (e: any) => {
      const rate = e?.detail?.rate || StorageService.getUsdBrlRate();
      if (rate && Number.isFinite(rate)) setLiveUsdRate(rate);
    };

    window.addEventListener('gx_dollar_rate_updated', handleDollarUpdated);
    window.addEventListener('gx_storage_updated', handleDollarUpdated);

    return () => {
      window.removeEventListener('gx_dollar_rate_updated', handleDollarUpdated);
      window.removeEventListener('gx_storage_updated', handleDollarUpdated);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40">
      {/* 🟢 BARRA DE TELEMETRIA BITX CORE - REDE ATIVA · PRODUÇÃO (MAINNET) */}
      <div className="bg-[#0b0e11] border-b border-[#2f343b] px-3 sm:px-6 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#02c076] animate-pulse"></span>
            <span className="font-bold tracking-wide text-[#02c076]">
              {BITX_CORE_MAINNET.network}
            </span>
          </div>

          <div className="hidden xs:flex items-center gap-1 text-[#848e9c] border-l border-[#2f343b] pl-3">
            <Layers className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span>Altura da Cadeia:</span>
            <span className="font-mono font-bold text-white">
              {BITX_CORE_MAINNET.chainHeight}
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-[#2f343b] pl-3">
            <span className="text-[#848e9c]">Cotação BTXC:</span>
            <span className="font-mono font-bold text-[#02c076] flex items-center gap-0.5">
              R$ {activePriceNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[10px] bg-[#02c076]/15 text-[#02c076] px-1 py-0.2 rounded font-sans font-semibold">
                {BITX_CORE_MAINNET.variation}
              </span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 border-l border-[#2f343b] pl-3">
            <span className="text-[#848e9c]">Dólar Comercial:</span>
            <span className="font-mono font-bold text-[#38bdf8] flex items-center gap-1">
              R$ {liveUsdRate.toFixed(2)}
              <span className="text-[9px] text-[#02c076] font-sans font-semibold">● Ao Vivo</span>
            </span>
            <span className="text-[#848e9c] text-[10px] font-mono ml-1">
              (1 BTXC ≈ $ {(activePriceNum / (liveUsdRate || 5.43)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[#848e9c]">
            <Activity className="w-3.5 h-3.5 text-[#02c076]" />
            <span>Global Exchange:</span>
            <span className="font-bold text-[#02c076] flex items-center gap-1">
              ● {BITX_CORE_MAINNET.version}
            </span>
          </div>
        </div>
      </div>

      {/* NAVBAR PRINCIPAL */}
      <nav className="bg-[#1e2329] px-4 sm:px-6 py-3 flex flex-wrap justify-between items-center border-b border-[#2f343b]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-[#f0b90b] text-[#0b0e11] font-black flex items-center justify-center text-sm shadow">
              GX
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold text-[#f0b90b] tracking-wider leading-none">
                GLOBAL EXCHANGE
              </span>
              <span className="text-[9px] text-[#848e9c] font-medium tracking-tight">
                BitX Core Institutional Ecosystem
              </span>
            </div>
            {currentUser ? (
              isAdmin ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f0b90b]/15 text-[#f0b90b] border border-[#f0b90b]/40 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#f0b90b]" />
                  <span>Painel Administrativo Institucional</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/40 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-[#02c076] animate-pulse"></span>
                  <span>Área Comercial do Cliente</span>
                </div>
              )
            ) : (
              <span
                className={`hidden md:inline-block px-2.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider border ${
                  currentView === 'admin'
                    ? 'bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30'
                    : 'bg-[#02c076]/15 text-[#02c076] border-[#02c076]/30'
                }`}
              >
                {currentView === 'admin' ? 'Painel das Configurações (/admin)' : 'Página do Cliente (/cliente)'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className="bg-[#2b3139] px-3 py-1.5 rounded text-xs flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#02c076]"></span>
              <span className="text-[#848e9c]">Gateway:</span>
              <span className="text-[#02c076] font-bold">Online</span>
            </div>
            <div className="hidden lg:flex items-center gap-1 text-[#848e9c] border-l border-[#474d57] pl-3">
              <ShieldCheck className="w-3.5 h-3.5 text-[#f0b90b]" />
              <span>Pix BB Produção:</span>
              <span className="text-[#f0b90b] font-semibold">Engecema PJ</span>
            </div>
            {currentUser && (
              <div className="border-l border-[#474d57] pl-3 text-[#b7bdc6]">
                <span>{currentUser.name || currentUser.email}</span>
                {isAdmin && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/40 rounded font-bold uppercase">
                    Admin
                  </span>
                )}
              </div>
            )}
          </div>

          {currentUser && (
            <button
              onClick={onLogout}
              className="bg-[#cf304a] hover:bg-[#b02239] text-white px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 shadow"
              title="Encerrar sessão"
            >
              <LogOut className="w-3 h-3" />
              Sair
            </button>
          )}
        </div>
      </nav>
    </header>
  );
};
