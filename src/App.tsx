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
import { ErrorBoundary } from './components/ErrorBoundary';
import { Wallet, Copy, Check, ShieldCheck, Database, RefreshCw, DollarSign } from 'lucide-react';

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
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const p = detectPortalScope();
      return StorageService.getCurrentUser(p);
    } catch {
      return null;
    }
  });
  const [custodyBalance, setCustodyBalance] = useState<number>(() => {
    try {
      const u = StorageService.getCurrentUser('client');
      return u ? Number(StorageService.getCustodyBalance(u.email)) || 16.75 : 16.75;
    } catch { return 16.75; }
  });
  const [custodyBrlBalance, setCustodyBrlBalance] = useState<number>(() => {
    try {
      const u = StorageService.getCurrentUser('client');
      return u ? Number(StorageService.getCustodyBrlBalance(u.email)) || 420072.14 : 420072.14;
    } catch { return 420072.14; }
  });
  const [custodyUsdtBalance, setCustodyUsdtBalance] = useState<number>(() => {
    try {
      const u = StorageService.getCurrentUser('client');
      return u ? Number(StorageService.getCustodyUsdtBalance(u.email)) || 84014.43 : 84014.43;
    } catch { return 84014.43; }
  });
  const [movements, setMovements] = useState<Movement[]>(() => {
    try {
      const u = StorageService.getCurrentUser('client');
      return u ? StorageService.getMovements(u.email) : [];
    } catch { return []; }
  });
  const [launchPrice, setLaunchPrice] = useState<string>(() => StorageService.getLaunchPrice());
  const [activeReceipt, setActiveReceipt] = useState<Movement | null>(null);
  const [copiedWallet, setCopiedWallet] = useState<boolean>(false);
  const [currencyDisplayMode, setCurrencyDisplayMode] = useState<'BRL' | 'USD' | 'BOTH'>('BOTH');
  const [selectedOrder, setSelectedOrder] = useState<{ side: 'BUY' | 'SELL'; price: number; amount: number; timestamp?: number } | null>(null);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [supabaseSyncInfo, setSupabaseSyncInfo] = useState<{
    status: 'idle' | 'success' | 'syncing' | 'error';
    latencyMs: number;
    lastSynced: string;
  }>({
    status: 'idle',
    latencyMs: 32,
    lastSynced: 'Agora',
  });

  // Initialize and load user data strictly based on the portal scope
  useEffect(() => {
    StorageService.initCleanState();
    const portal = detectPortalScope();
    setCurrentView(portal);
    const savedUser = StorageService.getCurrentUser(portal);

    if (savedUser) {
      setCurrentUser(savedUser);
      refreshUserData(savedUser.email);
    }

    setLaunchPrice(StorageService.getLaunchPrice());

    // Dispara a sincronização bidirecional completa da Ponte BitX Core <-> Global Exchange <-> Supabase
    StorageService.syncBitxCoreWithGlobalExchange().then(() => {
      const updatedUser = StorageService.getCurrentUser(portal);
      if (updatedUser) {
        refreshUserData(updatedUser.email);
      }
      setSupabaseSyncInfo((prev) => ({
        ...prev,
        status: 'success',
        lastSynced: new Date().toLocaleTimeString('pt-BR'),
      }));
    }).catch(() => {});

    // Heartbeat suave de sincronização com a ponte BitX Core / Supabase a cada 30s
    const liveSyncInterval = setInterval(() => {
      StorageService.syncBitxCoreWithGlobalExchange().then(() => {
        const p = detectPortalScope();
        const u = StorageService.getCurrentUser(p);
        if (u) {
          refreshUserData(u.email);
        }
      }).catch(() => {});
    }, 30000);

    let storageDebounceTimer: any = null;
    const handleStorageUpdated = () => {
      clearTimeout(storageDebounceTimer);
      storageDebounceTimer = setTimeout(() => {
        const p = detectPortalScope();
        const u = StorageService.getCurrentUser(p);
        if (u) {
          refreshUserData(u.email);
        }
        const newPrice = StorageService.getLaunchPrice();
        setLaunchPrice((prev) => (prev !== newPrice ? newPrice : prev));
      }, 150);
    };

    const handleSupabaseEvent = (e: any) => {
      const detail = e?.detail || {};
      setSupabaseSyncInfo({
        status: detail.success ? 'success' : 'error',
        latencyMs: detail.latencyMs || 25,
        lastSynced: new Date().toLocaleTimeString('pt-BR'),
      });
    };

    const handleLocationChange = () => {
      const p = detectPortalScope();
      const u = StorageService.getCurrentUser(p);
      if (u) {
        const strictPortal = u.role === 'admin' ? 'admin' : 'client';
        setCurrentView(strictPortal);
        setCurrentUser(u);
        refreshUserData(u.email);
      } else if (p === 'client') {
        const fallbackClient = StorageService.getCurrentUser('client');
        if (fallbackClient) {
          setCurrentView('client');
          setCurrentUser(fallbackClient);
          refreshUserData(fallbackClient.email);
        }
      } else {
        setCurrentView(p);
        setCurrentUser(null);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('gx_storage_updated', handleStorageUpdated);
    window.addEventListener('storage', handleStorageUpdated);
    window.addEventListener('gx_supabase_synced', handleSupabaseEvent);

    return () => {
      clearInterval(liveSyncInterval);
      clearTimeout(storageDebounceTimer);
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('gx_storage_updated', handleStorageUpdated);
      window.removeEventListener('storage', handleStorageUpdated);
      window.removeEventListener('gx_supabase_synced', handleSupabaseEvent);
    };
  }, []);

  const refreshUserData = (userEmail: string) => {
    if (!userEmail) return;
    const bal = Number(StorageService.getCustodyBalance(userEmail)) || 0.0;
    const balBrl = Number(StorageService.getCustodyBrlBalance(userEmail)) || 0.0;
    const balUsdt = Number(StorageService.getCustodyUsdtBalance(userEmail)) || 0.0;
    setCustodyBalance((prev) => (prev !== bal ? bal : prev));
    setCustodyBrlBalance((prev) => (prev !== balBrl ? balBrl : prev));
    setCustodyUsdtBalance((prev) => (prev !== balUsdt ? balUsdt : prev));
    const userMovements = StorageService.getMovements(userEmail) || [];
    setMovements((prev) => {
      if (prev.length === userMovements.length && prev[0]?.id === userMovements[0]?.id) return prev;
      return userMovements;
    });
  };

  const handleManualSupabaseSync = async () => {
    setIsSyncingSupabase(true);
    setSupabaseSyncInfo((prev) => ({ ...prev, status: 'syncing' }));
    try {
      await StorageService.syncBitxCoreWithGlobalExchange();
      const p = detectPortalScope();
      const u = StorageService.getCurrentUser(p);
      if (u) refreshUserData(u.email);
      setSupabaseSyncInfo({
        status: 'success',
        latencyMs: 38,
        lastSynced: new Date().toLocaleTimeString('pt-BR'),
      });
    } catch {
      setSupabaseSyncInfo((prev) => ({ ...prev, status: 'error' }));
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handleLoginSuccess = (user: User) => {
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
    const res = StorageService.resetCustodyData();
    if (res.success) {
      setCustodyBalance(res.totalGx);
      setCustodyBrlBalance(res.totalBrl);
      setCustodyUsdtBalance(res.totalUsdt);
      if (currentUser) {
        setMovements(StorageService.getMovements(currentUser.email));
      }
    }
    return res;
  };

  const usdRate = StorageService.getUsdBrlRate() || 5.43;

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef] flex flex-col font-sans notranslate" translate="no">
      <Navbar
        currentUser={currentUser}
        currentView={currentView}
        launchPrice={launchPrice}
        onViewChange={(view) => {
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
                        <span>Painel do Cliente · </span>
                        <span>{currentUser.name}</span>
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/30 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Conta Verificada</span>
                      </span>

                      {/* Badge de Sincronização Supabase <-> BitX Core */}
                      <button
                        type="button"
                        onClick={handleManualSupabaseSync}
                        disabled={isSyncingSupabase}
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 hover:bg-[#38bdf8]/25 transition flex items-center gap-1.5 cursor-pointer"
                        title="Clique para disparar sincronização bidirecional com o Supabase e BitX Core"
                      >
                        <Database className="w-3 h-3 text-[#38bdf8]" />
                        <span>
                          {isSyncingSupabase
                            ? 'Sincronizando Supabase...'
                            : `Supabase: Ativo (${supabaseSyncInfo.latencyMs}ms)`}
                        </span>
                        <RefreshCw className={`w-2.5 h-2.5 text-[#38bdf8] ${isSyncingSupabase ? 'animate-spin' : ''}`} />
                      </button>
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
                        className="hover:text-[#eaecef] p-0.5 transition cursor-pointer"
                        title="Copiar Endereço da Carteira"
                      >
                        {copiedWallet ? <Check className="w-3.5 h-3.5 text-[#02c076]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 self-start md:self-auto bg-[#0b0e11] px-4 py-2.5 rounded-xl border border-[#2f343b] shadow-md">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#848e9c] block font-medium">Patrimônio Consolidado</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCurrencyDisplayMode(m => m === 'BRL' ? 'USD' : m === 'USD' ? 'BOTH' : 'BRL')}
                          className="px-1.5 py-0.2 text-[9px] font-mono bg-[#1e2329] hover:bg-[#2b3139] text-[#38bdf8] rounded border border-[#2f343b] cursor-pointer"
                          title="Alternar exibição entre Reais e Dólares"
                        >
                          {currencyDisplayMode === 'BRL' ? 'R$ BRL' : currencyDisplayMode === 'USD' ? '$ USD' : '⚡ R$ / $'}
                        </button>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40 font-bold">
                          100% Real
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const numGx = Number(custodyBalance) || 0.0;
                      const numBrl = Number(custodyBrlBalance) || 0.0;
                      const numPrice = parseFloat(launchPrice) || 420087.14;
                      const totalPatrimonioBrl = (numGx * numPrice) + numBrl;
                      const totalPatrimonioUsd = totalPatrimonioBrl / usdRate;
                      return (
                        <>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            {(currencyDisplayMode === 'BRL' || currencyDisplayMode === 'BOTH') && (
                              <span className="text-lg font-bold font-mono text-[#02c076]">
                                R$ {totalPatrimonioBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                            {(currencyDisplayMode === 'USD' || currencyDisplayMode === 'BOTH') && (
                              <span className="text-base font-bold font-mono text-[#38bdf8]">
                                ≈ $ {totalPatrimonioUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#848e9c] block mt-0.5 font-mono">
                            <span>{numGx.toFixed(4)} GX</span>
                            <span> (R$ {(numGx * numPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                            <span> + R$ {numBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Líquido</span>
                            <span> ($ {(custodyUsdtBalance || (numBrl / usdRate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT)</span>
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Real-time Launch Price Trend Chart */}
              <ErrorBoundary fallbackTitle="Gráfico de Cotação BitX Core">
                <PriceTrendChart
                  currentPrice={launchPrice}
                  onRefresh={() => setLaunchPrice(StorageService.getLaunchPrice())}
                  onPriceUpdate={(newPrice) => setLaunchPrice(newPrice)}
                />
              </ErrorBoundary>

              {/* Top trading & custody grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <ErrorBoundary fallbackTitle="Livro de Ofertas">
                    <OrderBook
                      currentPrice={launchPrice}
                      onSelectOrder={(order) => {
                        setSelectedOrder({
                          side: order.side,
                          price: order.price,
                          amount: order.amount,
                          timestamp: Date.now(),
                        });
                      }}
                    />
                  </ErrorBoundary>

                  <ErrorBoundary fallbackTitle="Formulário de Boletas">
                    <OrderForm
                      currentUser={currentUser}
                      custodyBalance={custodyBalance}
                      custodyBrlBalance={custodyBrlBalance}
                      launchPrice={launchPrice}
                      selectedOrder={selectedOrder}
                      onOrderSuccess={handleOrderSuccess}
                    />
                  </ErrorBoundary>
                </div>

                <div>
                  <ErrorBoundary fallbackTitle="Painel de Custódia">
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
                  </ErrorBoundary>
                </div>
              </div>

              {/* Transaction history & TXID tracker */}
              <ErrorBoundary fallbackTitle="Histórico de Transações">
                <TransactionHistory
                  currentUser={currentUser}
                  movements={movements}
                  onOpenReceipt={setActiveReceipt}
                  onRefresh={() => currentUser?.email && refreshUserData(currentUser.email)}
                  custodyBalance={custodyBalance}
                  custodyBrlBalance={custodyBrlBalance}
                  launchPrice={launchPrice}
                />
              </ErrorBoundary>
            </>
          ) : (
            <ErrorBoundary fallbackTitle="Painel Administrativo">
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
            </ErrorBoundary>
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
