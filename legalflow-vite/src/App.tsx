import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Plus, LayoutDashboard, Table2, LogOut, Briefcase, FileText, ShieldCheck, ArrowRight } from 'lucide-react';
import type { Transaction, TransactionGroup } from './types';
import { getTransactions, saveTransactions, getInitialBalance, saveInitialBalance, exportBackupJSON, applyLoanOverrides, rememberLoanOverride, removeLoanOverride } from './services/storageService';
import { generateExecutiveSummary } from './services/reportService';
import { syncTaxTransactions } from './services/taxService';
import TransactionForm from './components/TransactionForm';
import Logo from './components/Logo';
import Login from './components/Login';
import { fetchCloudSnapshot, persistCloudSnapshot } from './services/cloudService';
import { formatDateKey, parseDateKey } from './utils/date';

const MonthlyFlow = lazy(() => import('./components/MonthlyFlow'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const CollectionTracker = lazy(() => import('./components/CollectionTracker'));
const ExecutiveSummary = lazy(() => import('./components/ExecutiveSummary'));

const CASHFLOW_CUTOFF = parseDateKey('2025-11-01');
const LOAN_FREEZE_CUTOFF = parseDateKey('2025-12-01');

const normalizeTransactionDates = (list: Transaction[]) => {
  let didNormalize = false;
  const normalized = list.map(transaction => {
    const normalizedDate = formatDateKey(parseDateKey(transaction.date));
    if (normalizedDate !== transaction.date) {
      didNormalize = true;
      return { ...transaction, date: normalizedDate };
    }
    return transaction;
  });
  return { normalized, didNormalize };
};

const sanitizeTransactions = (list: Transaction[]) => {
  const { normalized, didNormalize } = normalizeTransactionDates(list);
  const cutoffTransactions = normalized
    .filter(t => parseDateKey(t.date) >= CASHFLOW_CUTOFF)
    .filter(t => !(t.group === 'loan' && parseDateKey(t.date) >= LOAN_FREEZE_CUTOFF));

  if (cutoffTransactions.length !== list.length || didNormalize) {
    saveTransactions(cutoffTransactions);
  }

  return cutoffTransactions;
};

const DECIMAL_INPUT_PATTERN = /^-?\d*(?:[.,]\d*)?$/;

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<string | null>(() => sessionStorage.getItem('legalflow_user'));
  
  // App State - Lazy initialization ensures we read from storage on first render before any overwrites
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
      const stored = getTransactions();
      const sanitized = sanitizeTransactions(stored);
      const withOverrides = applyLoanOverrides(sanitized);
      return syncTaxTransactions(withOverrides);
  });
  
  const [initialBalance, setInitialBalance] = useState(() => getInitialBalance());
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Updated tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flow' | 'collection' | 'summary'>('flow');

  // Form initial state helpers
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>(undefined);
  const [formInitialType, setFormInitialType] = useState<'income' | 'expense' | undefined>(undefined);
  const [formInitialGroup, setFormInitialGroup] = useState<TransactionGroup | undefined>(undefined);
  const isRestoringFromCloud = useRef(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState(() => getInitialBalance().toString());

  // --- Persistence ---
  useEffect(() => {
     // Whenever transactions change, we save them.
     // Note: The sync logic is handled inside the update handlers to avoid infinite loops in useEffect
     saveTransactions(transactions);
  }, [transactions]);

  // --- 3-Hour Automatic Backup ---
  useEffect(() => {
    if (!currentUser) return;

    // 3 Hours in milliseconds
    const INTERVAL_MS = 3 * 60 * 60 * 1000;
    
    const backupTimer = setInterval(() => {
        console.log('Executing scheduled backup...');
        exportBackupJSON(transactions); 
    }, INTERVAL_MS);

    return () => clearInterval(backupTimer);
  }, [currentUser, transactions]);

  // --- 16:00 Daily Email Trigger (single daily send) ---
  useEffect(() => {
      if (!currentUser) return;

      const emailCheckTimer = setInterval(() => {
          const now = new Date();
          const isTriggerWindow = now.getHours() === 16 && now.getMinutes() === 0 && now.getSeconds() < 10;
          const todayKey = formatDateKey(now);
          const lastSentForDay = sessionStorage.getItem('legalflow_daily_email_sent');

          if (isTriggerWindow && lastSentForDay !== todayKey) {
              const subject = `סיכום תזרים יומי - ${now.toLocaleDateString('he-IL')}`;
              const body = encodeURIComponent(generateExecutiveSummary('month', transactions, initialBalance));
              window.location.href = `mailto:lidor@lp-law.co.il,lior@lp-law.co.il?subject=${subject}&body=${body}`;
              sessionStorage.setItem('legalflow_daily_email_sent', todayKey);
          }
      }, 1000);

      return () => clearInterval(emailCheckTimer);
  }, [currentUser, transactions]);


  // --- Handlers ---

  const handleLogin = (username: string) => {
    setCurrentUser(username);
    sessionStorage.setItem('legalflow_user', username);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('legalflow_user');
    sessionStorage.removeItem('legalflow_daily_email_sent');
  };

  // Helper to update transactions and sync taxes
  const updateTransactionsWithSync = (newTransactionsList: Transaction[]) => {
      const filtered = sanitizeTransactions(newTransactionsList);
      const withOverrides = applyLoanOverrides(filtered);
      const synced = syncTaxTransactions(withOverrides);
      setTransactions(synced);
  };

  const handleAddTransactionBatch = (newTransactions: Omit<Transaction, 'id'>[]) => {
      const processedTransactions = newTransactions.map(t => {
          const id = crypto.randomUUID();
          let amount = t.amount;
          if (t.group === 'loan') {
            amount = Math.abs(t.amount);
            rememberLoanOverride(id, amount);
          }
          return {
            ...t,
            amount,
            id,
          };
      });
      
      const updatedList = [...transactions, ...processedTransactions];
      updateTransactionsWithSync(updatedList);
  };

  const handleDeleteTransaction = (id: string) => {
    if(window.confirm('האם אתה בטוח שברצונך למחוק תנועה זו?')) {
        const target = transactions.find(t => t.id === id);
        const updatedList = transactions.filter(t => t.id !== id);
        updateTransactionsWithSync(updatedList);
        if (target?.group === 'loan') {
          removeLoanOverride(id);
        }
    }
  };

  const handleMarkAsPaid = (transaction: Transaction) => {
      if(window.confirm(`האם לסמן את החשבון של ${transaction.description} כשולם?`)) {
          const updated = transactions.map(t => 
            t.id === transaction.id ? { ...t, status: 'completed' as const } : t
          );
          // No need to sync taxes here as amount/date didn't change, but status change is fine.
          setTransactions(updated); 
      }
  };

  const handleToggleTransactionStatus = (transactionId: string, nextStatus: 'pending' | 'completed') => {
    setTransactions(prev => prev.map(t => 
      t.id === transactionId ? { ...t, status: nextStatus } : t
    ));
  };

  const handleUpdateTaxAmount = (transactionId: string, nextAmount: number) => {
    if (!Number.isFinite(nextAmount)) return;
    const normalizedAmount = Math.abs(nextAmount);
    let didUpdate = false;

    const updatedList = transactions.map(t => {
      if (t.id !== transactionId || t.group !== 'tax') {
        return t;
      }
      didUpdate = true;
      return {
        ...t,
        amount: normalizedAmount,
        isManualOverride: true
      };
    });

    if (didUpdate) {
      updateTransactionsWithSync(updatedList);
    }
  };

  const handleUpdateLoanAmount = (transactionId: string, nextAmount: number) => {
    if (!Number.isFinite(nextAmount)) return;
    const normalizedAmount = Math.abs(nextAmount);
    let didUpdate = false;

    const updatedList = transactions.map(t => {
      if (t.id !== transactionId || t.group !== 'loan') {
        return t;
      }
      didUpdate = true;
      return {
        ...t,
        amount: normalizedAmount
      };
    });

    if (didUpdate) {
      updateTransactionsWithSync(updatedList);
      rememberLoanOverride(transactionId, normalizedAmount);
    }
  };

  const openTransactionForm = (date?: string, type?: 'income' | 'expense', group?: TransactionGroup) => {
    setFormInitialDate(date || formatDateKey(new Date()));
    setFormInitialType(type);
    setFormInitialGroup(group);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTimeout(() => {
      setFormInitialDate(undefined);
      setFormInitialType(undefined);
      setFormInitialGroup(undefined);
    }, 200);
  };

  const calculateCurrentBalance = () => {
    const income = transactions
      .filter(t => t.type === 'income' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter(t => t.type === 'expense' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    return initialBalance + income - expenses;
  };

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setActiveTab('flow');
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    (async () => {
      const snapshot = await fetchCloudSnapshot(currentUser);
      if (!snapshot || cancelled) return;

      isRestoringFromCloud.current = true;
      setInitialBalance(snapshot.initialBalance ?? getInitialBalance());
      const sanitizedSnapshot = sanitizeTransactions(snapshot.transactions ?? []);
      const withOverrides = applyLoanOverrides(sanitizedSnapshot);
      setTransactions(syncTaxTransactions(withOverrides));
      isRestoringFromCloud.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || isRestoringFromCloud.current) return;

    persistCloudSnapshot(currentUser, {
      transactions,
      initialBalance,
      updatedAt: new Date().toISOString()
    });
  }, [transactions, initialBalance, currentUser]);

  useEffect(() => {
    setBalanceDraft(initialBalance.toString());
  }, [initialBalance]);

  const handleBalanceDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    if (DECIMAL_INPUT_PATTERN.test(value)) {
      setBalanceDraft(value);
    }
  };

  const handleSaveInitialBalance = () => {
    const sanitizedDraft = balanceDraft.replace(',', '.');
    const parsed = Number(sanitizedDraft);
    const normalized = Number.isFinite(parsed) ? parsed : 0;
    setInitialBalance(normalized);
    saveInitialBalance(normalized);
    setIsBalanceModalOpen(false);
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* Sidebar */}
      <aside className="fixed top-0 right-0 h-full w-64 bg-slate-900 text-white shadow-xl z-20 hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-800 flex flex-col items-center justify-center py-8">
          <Logo />
          <div className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-green-500" />
            מחובר: {currentUser}
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 mt-2 overflow-y-auto">
          <div className="text-xs text-slate-500 font-bold px-4 mb-2 mt-2">תזרים ובקרה</div>
          <button 
            onClick={() => setActiveTab('flow')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'flow' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Table2 className="w-5 h-5" />
            תזרים חודשי
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            לוח בקרה
          </button>

          <div className="text-xs text-slate-500 font-bold px-4 mb-2 mt-6">ניהול משרד</div>
          <button 
            onClick={() => setActiveTab('summary')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'summary' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileText className="w-5 h-5" />
            תקציר מנהלים
          </button>

           <button 
            onClick={() => setActiveTab('collection')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'collection' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            מעקב גבייה
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-4">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">יתרה נוכחית</p>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xl font-bold text-[#d4af37]">{calculateCurrentBalance().toLocaleString()} ₪</p>
              <button
                onClick={() => setIsBalanceModalOpen(true)}
                className="text-xs text-slate-300 hover:text-white underline underline-offset-4"
              >
                עדכן יתרת פתיחה
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              יתרת פתיחה: ₪{initialBalance.toLocaleString()}
            </p>
          </div>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/50 rounded-lg transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            התנתק
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 relative">
             <svg viewBox="0 0 100 100" className="w-full h-full">
                <path d="M25 20 V80 H75" fill="none" stroke="#d4af37" strokeWidth="10" strokeLinecap="square"/>
                <path d="M25 20 H65 C75 20 80 30 80 40 C80 55 70 60 60 60 H25" fill="none" stroke="#94a3b8" strokeWidth="10" strokeLinecap="square" className="opacity-80"/>
             </svg>
          </div>
          <span className="font-bold text-[#d4af37] tracking-wide">LegalFlow</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-sm font-bold text-white">₪{calculateCurrentBalance().toLocaleString()}</div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-white">
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="md:mr-64 p-6 min-h-screen pb-24 md:pb-6">
        <div className="flex justify-end mb-4">
          <button
            onClick={handleBackNavigation}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-400 transition-colors uppercase"
          >
            BACK
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        {/* Top Action Bar */}
        {activeTab !== 'flow' && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">
                {activeTab === 'dashboard' && 'סקירה חודשית'}
                {activeTab === 'collection' && 'מעקב גבייה'}
                {activeTab === 'summary' && 'תקציר מנהלים'}
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                {new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => openTransactionForm()}
                className="flex items-center gap-2 px-4 py-2 bg-[#d4af37] text-white rounded-lg hover:bg-[#b5952f] transition-all shadow-lg hover:shadow-xl text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                תנועה חדשה
              </button>
            </div>
          </div>
        )}

        {/* Views */}
        <Suspense fallback={<div className="text-center text-slate-500 py-10">טוען נתונים...</div>}>
          {activeTab === 'flow' && (
            <MonthlyFlow 
              transactions={transactions}
              initialBalance={initialBalance}
              onDeleteTransaction={handleDeleteTransaction}
              openTransactionForm={openTransactionForm}
              onToggleStatus={handleToggleTransactionStatus}
              onUpdateTaxAmount={handleUpdateTaxAmount}
              onUpdateLoanAmount={handleUpdateLoanAmount}
            />
          )}

          {activeTab === 'dashboard' && (
            <Dashboard 
              transactions={transactions} 
              initialBalance={initialBalance}
              currentBalance={calculateCurrentBalance()} 
            />
          )}

          {activeTab === 'collection' && (
              <CollectionTracker 
                  transactions={transactions}
                  onMarkAsPaid={handleMarkAsPaid}
              />
          )}

          {activeTab === 'summary' && (
              <ExecutiveSummary transactions={transactions} initialBalance={initialBalance} />
          )}
        </Suspense>
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-3 z-30 safe-area-pb">
        <button onClick={() => setActiveTab('flow')} className={`flex flex-col items-center gap-1 ${activeTab === 'flow' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
          <Table2 className="w-6 h-6" />
          <span className="text-[10px]">תזרים</span>
        </button>
        <button onClick={() => setActiveTab('collection')} className={`flex flex-col items-center gap-1 ${activeTab === 'collection' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
          <Briefcase className="w-6 h-6" />
          <span className="text-[10px]">גבייה</span>
        </button>
        <button onClick={() => openTransactionForm()} className="flex flex-col items-center justify-center -mt-8">
          <div className="bg-slate-900 p-3 rounded-full shadow-lg text-[#d4af37] border-2 border-[#d4af37]">
            <Plus className="w-6 h-6" />
          </div>
        </button>
        <button onClick={() => setActiveTab('summary')} className={`flex flex-col items-center gap-1 ${activeTab === 'summary' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
          <FileText className="w-6 h-6" />
          <span className="text-[10px]">מנהלים</span>
        </button>
      </div>

      <TransactionForm 
        isOpen={isFormOpen} 
        onClose={handleCloseForm} 
        onSubmit={handleAddTransactionBatch} 
        initialDate={formInitialDate}
        initialType={formInitialType}
        initialGroup={formInitialGroup}
      />

      {isBalanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 backdrop-blur-sm p-4 pt-20 md:pt-24 overflow-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">עדכון יתרת פתיחה</h3>
              <p className="text-sm text-slate-500 mt-1">
                קבע סכום בסיסי שממנו יחושבו כל החודשים.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <label className="text-sm font-medium text-slate-700">
                סכום פתיחה (₪)
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="-?[0-9]*([.,][0-9]*)?"
                  value={balanceDraft}
                  onChange={handleBalanceDraftChange}
                  className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <p className="text-xs text-slate-500">
                טיפ: אם ברצונך להתחיל מ-0 פשוט הגדר 0 ולחץ שמור. ניתן לעדכן שוב בכל עת.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsBalanceModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveInitialBalance}
                className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;