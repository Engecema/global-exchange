import React from 'react';
import { User } from '../types/exchange';
import { ShieldCheck, LogOut, LayoutDashboard, LineChart } from 'lucide-react';

import { isAdminEmail } from '../services/storage';

interface NavbarProps {
  currentUser: User | null;
  currentView: 'client' | 'admin';
  onViewChange: (view: 'client' | 'admin') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentView,
  onViewChange,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'admin' || (currentUser?.email && isAdminEmail(currentUser.email));

  return (
    <nav className="bg-[#1e2329] px-4 sm:px-6 py-3.5 flex flex-wrap justify-between items-center border-b border-[#2f343b] sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#f0b90b] text-[#0b0e11] font-black flex items-center justify-center text-sm shadow">
            GX
          </div>
          <span className="text-lg font-bold text-[#f0b90b] tracking-wider">
            GLOBAL EXCHANGE
          </span>
        </div>

        {isAdmin && (
          <div className="hidden md:flex items-center bg-[#0b0e11] p-1 rounded-lg border border-[#2f343b] ml-4 text-xs font-semibold">
            <button
              onClick={() => onViewChange('client')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition ${
                currentView === 'client'
                  ? 'bg-[#f0b90b] text-black font-bold'
                  : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <LineChart className="w-3.5 h-3.5" />
              Negociação & Custódia
            </button>
            <button
              onClick={() => onViewChange('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition ${
                currentView === 'admin'
                  ? 'bg-[#f0b90b] text-black font-bold'
                  : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Painel Admin
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 sm:mt-0">
        <div className="bg-[#2b3139] px-3 py-1.5 rounded text-xs flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#02c076] animate-pulse"></span>
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

        {isAdmin && (
          <div className="flex md:hidden">
            <button
              onClick={() => onViewChange(currentView === 'client' ? 'admin' : 'client')}
              className="px-2.5 py-1.5 text-xs bg-[#2b3139] text-[#f0b90b] border border-[#f0b90b]/40 rounded font-semibold"
            >
              {currentView === 'client' ? 'Ver Admin' : 'Ver Custódia'}
            </button>
          </div>
        )}

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
  );
};
