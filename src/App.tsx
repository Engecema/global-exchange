import React, { useState, useEffect } from 'react';
import { Movement, User } from './types/exchange';
import { StorageService } from './services/storage';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { OrderBook } from './components/OrderBook';
import { OrderForm } from './components/OrderForm';
import { CustodyPanel } from './components/CustodyPanel';
import { TransactionHistory } from './components/TransactionHistory';
import { AdminPanel } from './components/AdminPanel';
import { PriceTrendChart } from './components/PriceTrendChart';
import { ReceiptModal } from './components/ReceiptModal';
import { Footer } from './components/Footer';
import { Wallet, Copy, Check, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  // Detecta se a rota atual no Render é o Painel Administrativo (/admin, /configuracoes) ou Página do Cliente (/cliente, /)
  const detectPortalScope = (): 'client' | 'admin' => {
    try {
      const pathname = window.location.pathname.toLowerCase();
      if (
        pathname.startsWith('/admin') ||
        pathname.startsWith('/configuracoes') ||
        pathname.startsWith('/painel')
      ) {
        return 'admin';
      }
      if (
        pathname.startsWith('/cliente') ||
        pathname.startsWith('/client') ||
        pathname.startsWith('/negociacao') ||
        pathname.startsWith('/custodia')
      ) {
        return 'client';
      }
      const searchParams = new URLSearchParams(window.location.search);
      const v = searchParams.get('view')?.toLowerCase();
      if (v === 'admin') return 'admin';
      if (v === 'client') return 'client';

      const hash = window.location.hash.toLowerCase();
      if (hash.includes('admin') || hash.includes('config')) return 'admin';
      if (hash.includes('client') || hash.includes('cliente')) return 'client';

      const tabView = sessionStorage.getItem('gx_tab_view');
      if (tabView === 'admin' || tabView === 'client') return tabView as 'client' | 'admin';
    } catch {}
    return 'client';
  };

  const [currentView, setCurrentView] = useState<'client' | 'admin'>(() => detectPortalScope());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [custodyBalance, setCustodyBalance] = useState<number>(0.0);
  const [custodyBrlBalance, setCustodyBrlBalance] = useState<number>(0.0);
  const [custodyUsdtBalance, setCustodyUsdtBalance] = useState<number>(0.0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [launchPrice, setLaunchPrice] = useState<string>(() => StorageService.getLaunchPrice());
  const [activeReceipt, setActiveReceipt] = useState<Movement | null>(null);
  const [copiedWallet, setCopiedWallet] = useState<boolean>(false);

  // Initialize and load user data strictly based on the portal scope
  useEffect(() => {
    StorageService.initCleanState();
    const portal = detectPortalScope();
    setCurrentView(portal);
    const savedUser = StorageService.getCurrentUser(portal);

    if (savedUser) {
      setCurrentUser(savedUser);
      refreshUserData(savedUser.email);
    } else {
      setCurrentUser(null);
    }

    setLaunchPrice(StorageService.getLaunchPrice());

    // Dispara a sincronização bidirecional completa da Ponte BitX Core <-> Global Exchange
    StorageService.syncBitxCoreWithGlobalExchange().then(() => {
      const updatedUser = StorageService.getCurrentUser(portal);
      if (updatedUser) {
        refreshUserData(updatedUser.email);
      }
    }).catch(() => {});

    const handleStorageUpdated = () => {
      const p = detectPortalScope();
      const u = StorageService.getCurrentUser(p);
      if (u) {
        refreshUserData(u.email);
      }
      setLaunchPrice(StorageService.getLaunchPrice());
    };

    const handleLocationChange = () => {
      const p = detectPortalScope();
      const u = StorageService.getCurrentUser(p);
      if (u) {
        const strictPortal = u.role === 'admin' ? 'admin' : 'client';
        setCurrentView(strictPortal);
        setCurrentUser(u);
        refreshUserData(u.email);
      } else {
        setCurrentView(p);
        setCurrentUser(null);
        setCustodyBalance(0.0);
        setCustodyBrlBalance(0.0);
        setMovements([]);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('gx_storage_updated', handleStorageUpdated);
    window.addEventListener('storage', handleStorageUpdated);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('gx_storage_updated', handleStorageUpdated);
      window.removeEventListener('storage', handleStorageUpdated);
    };
  }, []);

  const refreshUserData = (userEmail: string) => {
    const bal = StorageService.getCustodyBalance(userEmail);
    const balBrl = StorageService.getCustodyBrlBalance(userEmail);
    const balUsdt = StorageService.getCustodyUsdtBalance(userEmail);
    setCustodyBalance(bal);
    setCustodyBrlBalance(balBrl);
    setCustodyUsdtBalance(balUsdt);
    const userMovements = StorageService.getMovements(userEmail);
    setMovements(userMovements);
  };

  const handleLoginSuccess = (user: User, portalScope?: 'client' | 'admin') => {
    // Segregação estrita: papel admin sempre vai para admin, cliente sempre para client
    const portal = user.role === 'admin' ? 'admin' : 'client';
    setCurrentView(portal);
    setCurrentUser(user);
    StorageService.setCurrentUser(user, { scope: portal });
    try {
      sessionStorage.setItem('gx_tab_view', portal);
      window.location.hash = portal === 'admin' ? '#admin' : '#cliente';
    } catch {}
    refreshUserData(user.email);
  };

  const handleLogout = () => {
    const portal = detectPortalScope();
    StorageService.setCurrentUser(null, { scope: portal });
    setCurrentUser(null);
    setCustodyBalance(0.0);
    setCustodyBrlBalance(0.0);
    setCustodyUsdtBalance(0.0);
    setMovements([]);
  };

  const handleOrderSuccess = (newMovement: Movement, newBalance: number) => {
    setCustodyBalance(newBalance);
    if (currentUser) {
      setCustodyBrlBalance(StorageService.getCustodyBrlBalance(currentUser.email));
      setCustodyUsdtBalance(StorageService.getCustodyUsdtBalance(currentUser.email));
      setMovements(StorageService.getMovements(currentUser.email));
    }
  };

  const handleCustodyBalanceChange = (
    newBalance: number,
    newMovement: Movement,
    currencyType: 'GX' | 'BRL' | 'USDT' = 'GX'
  ) => {
    if (currencyType === 'BRL') {
      setCustodyBrlBalance(newBalance);
      if (currentUser) {
        setCustodyBalance(StorageService.getCustodyBalance(currentUser.email));
        setCustodyUsdtBalance(StorageService.getCustodyUsdtBalance(currentUser.email));
      }
    } else if (currencyType === 'USDT') {
      setCustodyUsdtBalance(newBalance);
      if (currentUser) {
        setCustodyBalance(StorageService.getCustodyBalance(currentUser.email));
        setCustodyBrlBalance(StorageService.getCustodyBrlBalance(currentUser.email));
      }
    } else {
      setCustodyBalance(newBalance);
      if (currentUser) {
        setCustodyBrlBalance(StorageService.getCustodyBrlBalance(currentUser.email));
        setCustodyUsdtBalance(StorageService.getCustodyUsdtBalance(currentUser.email));
      }
    }
    if (currentUser) {
      setMovements(StorageService.getMovements(currentUser.email));
    }
  };

  const handleResetCustody = () => {
    const res = StorageService.resetAllBalancesAndMovementsToZero();
    setCustodyBalance(0.0);
    setCustodyBrlBalance(0.0);
    setCustodyUsdtBalance(0.0);
    if (currentUser) {
      setMovements(StorageService.getMovements(currentUser.email));
    }
    return res;
  };

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef] flex flex-col font-sans">
      <Navbar
        currentUser={currentUser}
        currentView={currentView}
        launchPrice={launchPrice}
        onViewChange={(view) => {
          // Bloqueio rigoroso: Administrador nunca pode alternar para visão de cliente e cliente nunca pode alternar para admin
          if (currentUser?.role === 'admin' && view === 'client') return;
          if (currentUser?.role === 'client' && view === 'admin') return;
          setCurrentView(view);
          try {
            sessionStorage.setItem('gx_tab_view', view);
            window.location.hash = view === 'admin' ? '#admin' : '#cliente';
          } catch {}
          if (currentUser) {
            refreshUserData(currentUser.email);
          }
        }}
        onLogout={handleLogout}
      />

      {!currentUser ? (
        <AuthModal onLoginSuccess={handleLoginSuccess} initialPortal={currentView} />
      ) : (
        <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
          {currentView === 'client' ? (
            <>
              {/* Client Profile & Quick Portfolio Header */}
              <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#02c076]/15 border border-[#02c076]/30 flex items-center justify-center text-[#02c076]">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold text-[#eaecef]">
                        Painel do Cliente · {currentUser.name}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/30 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Conta Verificada
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-[#848e9c]">
                      <span>Carteira BitX:</span>
                      <span className="font-mono text-[#38bdf8]">
                        {currentUser.bitxAddress ? `${currentUser.bitxAddress.slice(0, 14)}...${currentUser.bitxAddress.slice(-6)}` : 'bxrt1q...'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentUser.bitxAddress) {
                            navigator.clipboard.writeText(currentUser.bitxAddress);
                            setCopiedWallet(true);
                            setTimeout(() => setCopiedWallet(false), 2000);
                          }
                        }}
                        className="hover:text-[#eaecef] p-0.5 transition"
                        title="Copiar Endereço da Carteira"
                      >
                        {copiedWallet ? <Check className="w-3.5 h-3.5 text-[#02c076]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto bg-[#0b0e11] px-4 py-2.5 rounded-xl border border-[#2f343b]">
                  <div>
                    <span className="text-[11px] text-[#848e9c] block font-medium">Patrimônio Total Consolidado</span>
                    <span className="text-lg font-bold font-mono text-[#02c076]">
                      R$ {((custodyBalance * (parseFloat(launchPrice) || 421081.54)) + custodyBrlBalance + (custodyUsdtBalance * 5.70)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time Launch Price Trend Chart (Recharts) */}
              <PriceTrendChart
                currentPrice={launchPrice}
                onRefresh={() => setLaunchPrice(StorageService.getLaunchPrice())}
              />

              {/* Top trading & custody grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <OrderBook currentPrice={launchPrice} />
                  <OrderForm
                    currentUser={currentUser}
                    custodyBalance={custodyBalance}
                    custodyBrlBalance={custodyBrlBalance}
                    launchPrice={launchPrice}
                    onOrderSuccess={handleOrderSuccess}
                  />
                </div>

                <div>
                  <CustodyPanel
                    currentUser={currentUser}
                    custodyBalance={custodyBalance}
                    custodyBrlBalance={custodyBrlBalance}
                    custodyUsdtBalance={custodyUsdtBalance}
                    launchPrice={launchPrice}
                    movements={movements}
                    onBalanceChange={handleCustodyBalanceChange}
                    onResetCustody={handleResetCustody}
                    onOpenReceipt={setActiveReceipt}
                  />
                </div>
              </div>

              {/* Transaction history & TXID tracker */}
              <TransactionHistory
                currentUser={currentUser}
                movements={movements}
                onOpenReceipt={setActiveReceipt}
                onRefresh={() => refreshUserData(currentUser.email)}
              />
            </>
          ) : (
            <AdminPanel
              currentUser={currentUser}
              onOpenReceipt={setActiveReceipt}
              onPriceUpdated={(newPrice) => {
                setLaunchPrice(newPrice);
                if (currentUser) {
                  refreshUserData(currentUser.email);
                }
              }}
            />
          )}
        </main>
      )}

      {/* Official Transaction Receipt Modal */}
      <ReceiptModal
        movement={activeReceipt}
        onClose={() => setActiveReceipt(null)}
      />

      <Footer />
    </div>
  );
};

export default App;
