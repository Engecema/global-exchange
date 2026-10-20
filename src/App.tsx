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
import { ReceiptModal } from './components/ReceiptModal';
import { Footer } from './components/Footer';

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
  const [movements, setMovements] = useState<Movement[]>([]);
  const [launchPrice, setLaunchPrice] = useState<string>(() => StorageService.getLaunchPrice());
  const [activeReceipt, setActiveReceipt] = useState<Movement | null>(null);

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
    setCustodyBalance(bal);
    setCustodyBrlBalance(balBrl);
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
    setMovements([]);
  };

  const handleOrderSuccess = (newMovement: Movement, newBalance: number) => {
    setCustodyBalance(newBalance);
    if (currentUser) {
      setCustodyBrlBalance(StorageService.getCustodyBrlBalance(currentUser.email));
      setMovements(StorageService.getMovements(currentUser.email));
    }
  };

  const handleCustodyBalanceChange = (
    newBalance: number,
    newMovement: Movement,
    currencyType: 'GX' | 'BRL' = 'GX'
  ) => {
    if (currencyType === 'BRL') {
      setCustodyBrlBalance(newBalance);
      if (currentUser) {
        setCustodyBalance(StorageService.getCustodyBalance(currentUser.email));
      }
    } else {
      setCustodyBalance(newBalance);
      if (currentUser) {
        setCustodyBrlBalance(StorageService.getCustodyBrlBalance(currentUser.email));
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
                    launchPrice={launchPrice}
                    onBalanceChange={handleCustodyBalanceChange}
                    onResetCustody={handleResetCustody}
                    onOpenReceipt={setActiveReceipt}
                  />
                </div>
              </div>

              {/* Transaction history & TXID tracker */}
              <TransactionHistory
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
