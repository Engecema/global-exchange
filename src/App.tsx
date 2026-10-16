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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<'client' | 'admin'>('client');
  const [custodyBalance, setCustodyBalance] = useState<number>(0.0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [launchPrice, setLaunchPrice] = useState<string>('1.50');
  const [activeReceipt, setActiveReceipt] = useState<Movement | null>(null);

  // Initialize and load user data
  useEffect(() => {
    StorageService.initCleanState();
    const savedUser = StorageService.getCurrentUser();
    if (savedUser) {
      setCurrentUser(savedUser);
      if (savedUser.role === 'admin') {
        setCurrentView('admin');
      }
      refreshUserData(savedUser.email);
    }
    setLaunchPrice(StorageService.getLaunchPrice());
  }, []);

  const refreshUserData = (userEmail: string) => {
    const bal = StorageService.getCustodyBalance(userEmail);
    setCustodyBalance(bal);
    const userMovements = StorageService.getMovements(userEmail);
    setMovements(userMovements);
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    if (user.role === 'admin') {
      setCurrentView('admin');
    } else {
      setCurrentView('client');
    }
    refreshUserData(user.email);
  };

  const handleLogout = () => {
    StorageService.setCurrentUser(null);
    setCurrentUser(null);
    setCustodyBalance(0.0);
    setMovements([]);
    setCurrentView('client');
  };

  const handleOrderSuccess = (newMovement: Movement, newBalance: number) => {
    setCustodyBalance(newBalance);
    if (currentUser) {
      setMovements(StorageService.getMovements(currentUser.email));
    }
  };

  const handleCustodyBalanceChange = (newBalance: number, newMovement: Movement) => {
    setCustodyBalance(newBalance);
    if (currentUser) {
      setMovements(StorageService.getMovements(currentUser.email));
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef] flex flex-col font-sans">
      <Navbar
        currentUser={currentUser}
        currentView={currentView}
        onViewChange={setCurrentView}
        onLogout={handleLogout}
      />

      {!currentUser ? (
        <AuthModal onLoginSuccess={handleLoginSuccess} />
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
                    onOrderSuccess={handleOrderSuccess}
                  />
                </div>

                <div>
                  <CustodyPanel
                    currentUser={currentUser}
                    custodyBalance={custodyBalance}
                    onBalanceChange={handleCustodyBalanceChange}
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
              onPriceUpdated={(newPrice) => setLaunchPrice(newPrice)}
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
