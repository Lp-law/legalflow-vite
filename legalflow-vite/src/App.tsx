import React, { useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo } from 'react';
import { Plus, LayoutDashboard, Table2, LogOut, FileText, ShieldCheck, ArrowRight, Menu, AlertTriangle, HelpCircle } from 'lucide-react';
import type { Transaction, TransactionGroup } from './types';
import {
  getTransactions,
  saveTransactions,
  getInitialBalance,
  saveInitialBalance,
  exportBackupJSON,
  applyLoanOverrides,
  rememberLoanOverride,
  removeLoanOverride,
  replaceClients,
  replaceCustomCategories,
  getClients,
  getCustomCategories,
  getLoanOverrides,
  replaceLoanOverrides,
  isLoanCategoryLabel,
} from './services/storageService';
import { generateExecutiveSummary } from './services/reportService';
import { syncTaxTransactions } from './services/taxService';
import TransactionForm from './components/TransactionForm';
import Logo from './components/Logo';
import Login from './components/Login';
import { fetchCloudSnapshot, persistCloudSnapshot, UnauthorizedError } from './services/cloudService';
import { formatDateKey, parseDateKey } from './utils/date';
import SystemToolsToolbar from './components/SystemToolsToolbar';
import { calculateForecast } from './services/forecastService';
import { buildDailyWhatsappSummary } from './services/cfoAssistantService';
import DailyWhatsappSummaryModal from './components/DailyWhatsappSummaryModal';
import HelpCenterModal from './components/HelpCenterModal';

const MonthlyFlow = lazy(() => import('./components/MonthlyFlow'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const ExecutiveSummary = lazy(() => import('./components/ExecutiveSummary'));

const CASHFLOW_CUTOFF = parseDateKey('2025-11-01');
const BACKUP_SESSION_KEY = 'legalflow_backup_done_for_session';

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

const warnOnLoanCategoryMismatches = (list: Transaction[]) => {
  if (typeof import.meta === 'undefined' || import.meta.env?.MODE !== 'development') {
    return;
  }
  list.forEach(tx => {
    if (isLoanCategoryLabel(tx.category) && tx.group !== 'loan') {
      console.warn('[LoanSanitize][DevAssert] Expected loan group for category', {
        id: tx.id,
        date: tx.date,
        category: tx.category,
        group: tx.group,
      });
    }
  });
};

/**
 * Sanitizes transactions without removing future-dated loans.
 * - Normalizes all date strings to YYYY-MM-DD.
 * - Drops transactions that are older than CASHFLOW_CUTOFF (with logging).
 * - Never mutates the group/category of loans; invariants are enforced via storage migrations instead.
 */
const sanitizeTransactions = (list: Transaction[]) => {
  const { normalized, didNormalize } = normalizeTransactionDates(list);
  const dropped: Transaction[] = [];
  const cutoffTransactions = normalized.filter(t => {
    const keep = parseDateKey(t.date) >= CASHFLOW_CUTOFF;
    if (!keep) {
      dropped.push(t);
    }
    return keep;
  });

  if (dropped.length) {
    const sample = dropped.slice(0, 3).map(t => t.id ?? t.date);
    console.warn('[LoanSanitize] Dropped transactions before cutoff', {
      count: dropped.length,
      cutoff: formatDateKey(CASHFLOW_CUTOFF),
      examples: sample,
    });
  }

  if (cutoffTransactions.length !== list.length || didNormalize) {
    saveTransactions(cutoffTransactions);
  }

  warnOnLoanCategoryMismatches(cutoffTransactions);

  return cutoffTransactions;
};

const DECIMAL_INPUT_PATTERN = /^-?\d*(?:[.,]\d*)?$/;

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<string | null>(() =>
    sessionStorage.getItem('legalflow_user')
  );
  const [authToken, setAuthToken] = useState<string | null>(() =>
    sessionStorage.getItem('legalflow_token')
  );
  const [authError, setAuthError] = useState<string | null>(null);
  
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flow' | 'summary'>('flow');

  // Form initial state helpers
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>(undefined);
  const [formInitialType, setFormInitialType] = useState<'income' | 'expense' | undefined>(undefined);
  const [formInitialGroup, setFormInitialGroup] = useState<TransactionGroup | undefined>(undefined);
  const [transactionBeingEdited, setTransactionBeingEdited] = useState<Transaction | null>(null);
  const isRestoringFromCloud = useRef(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState(() => getInitialBalance().toString());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [cloudBootstrapVersion, setCloudBootstrapVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncIso, setLastSyncIso] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isBackupReminderOpen, setIsBackupReminderOpen] = useState(false);
  const [backupReminderWarning, setBackupReminderWarning] = useState<string | null>(null);
  const [hasSessionBackup, setHasSessionBackup] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return sessionStorage.getItem(BACKUP_SESSION_KEY) === '1';
  });
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);
  const [isDailyWhatsappModalOpen, setIsDailyWhatsappModalOpen] = useState(false);
  const [dailyWhatsappSummary, setDailyWhatsappSummary] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const handleOpenDailyWhatsappSummary = useCallback(() => {
    const summary = buildDailyWhatsappSummary(transactions, initialBalance, new Date());
    setDailyWhatsappSummary(summary);
    setIsDailyWhatsappModalOpen(true);
  }, [transactions, initialBalance]);
  const handleCloseDailyWhatsappSummary = useCallback(() => {
    setIsDailyWhatsappModalOpen(false);
  }, []);

  const clearSession = useCallback(() => {
    setCurrentUser(null);
    setAuthToken(null);
    sessionStorage.removeItem('legalflow_user');
    sessionStorage.removeItem('legalflow_token');
    sessionStorage.removeItem('legalflow_daily_email_sent');
    sessionStorage.removeItem(BACKUP_SESSION_KEY);
    setHasSessionBackup(false);
    setIsBackupReminderOpen(false);
    setBackupReminderWarning(null);
    setLogoutWarning(null);
    setIsBootstrapping(false);
    setBootstrapError(null);
    setSyncStatus('idle');
    setLastSyncIso(null);
    setSyncError(null);
  }, []);

  const requestBootstrapReload = useCallback(() => {
    setIsBootstrapping(true);
    setBootstrapError(null);
    setCloudBootstrapVersion(prev => prev + 1);
  }, []);

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
              window.location.href = `mailto:lior@lp-law.co.il?subject=${subject}&body=${body}`;
              sessionStorage.setItem('legalflow_daily_email_sent', todayKey);
          }
      }, 1000);

      return () => clearInterval(emailCheckTimer);
  }, [currentUser, transactions]);


  // --- Handlers ---

  const handleLogin = ({ username, token }: { username: string; token: string }) => {
    setCurrentUser(username);
    setAuthToken(token);
    sessionStorage.setItem('legalflow_user', username);
    sessionStorage.setItem('legalflow_token', token);
    sessionStorage.removeItem(BACKUP_SESSION_KEY);
    setHasSessionBackup(false);
    setBackupReminderWarning(null);
    setAuthError(null);
  };

  const handleLogout = () => {
    const backupDone =
      hasSessionBackup ||
      (typeof window !== 'undefined' && sessionStorage.getItem(BACKUP_SESSION_KEY) === '1');
    if (!backupDone) {
      setLogoutWarning('לפני התנתקות יש לבצע גיבוי. פתח את חלון הגיבוי ובצע "ייצוא גיבוי".');
      setIsBackupReminderOpen(true);
      return;
    }
    setLogoutWarning(null);
    clearSession();
    setAuthError(null);
  };

  // Helper to update transactions and sync taxes
  const updateTransactionsWithSync = (newTransactionsList: Transaction[]) => {
      const filtered = sanitizeTransactions(newTransactionsList);
      const withOverrides = applyLoanOverrides(filtered);
      const synced = syncTaxTransactions(withOverrides);
      setTransactions(synced);
  };

  const [recentTransactionIds, setRecentTransactionIds] = useState<string[]>([]);
  const [pendingDeletionId, setPendingDeletionId] = useState<string | null>(null);

  useEffect(() => {
    if (!recentTransactionIds.length) return;
    const timeout = setTimeout(() => setRecentTransactionIds([]), 1400);
    return () => clearTimeout(timeout);
  }, [recentTransactionIds]);

  const handleAddTransactionBatch = (newTransactions: Omit<Transaction, 'id'>[]) => {
    const processedTransactions = newTransactions.map(t => {
      const id = crypto.randomUUID();
      let amount = t.amount;
      // Transactions created from the Loans column must always remain group === 'loan'.
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
    setRecentTransactionIds(processedTransactions.map(t => t.id));
  };

  const handleSubmitEditedTransaction = (updatedTransaction: Transaction) => {
    const normalizedAmount =
      updatedTransaction.group === 'bank_adjustment'
        ? updatedTransaction.amount
        : Math.abs(updatedTransaction.amount);

    const normalizedTransaction: Transaction = {
      ...updatedTransaction,
      amount: normalizedAmount,
    };

    if (normalizedTransaction.group === 'loan') {
      rememberLoanOverride(normalizedTransaction.id, Math.abs(normalizedTransaction.amount));
    } else {
      removeLoanOverride(normalizedTransaction.id);
    }

    const nextTransactions = transactions.map(tx =>
      tx.id === normalizedTransaction.id ? normalizedTransaction : tx
    );
    updateTransactionsWithSync(nextTransactions);
    setTransactionBeingEdited(null);
  };

  const handleDeleteTransaction = (id: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק תנועה זו?')) {
      return;
    }
    const target = transactions.find(t => t.id === id);
    const updatedList = transactions.filter(t => t.id !== id);
    setPendingDeletionId(id);
    setTimeout(() => {
      updateTransactionsWithSync(updatedList);
      if (target?.group === 'loan') {
        removeLoanOverride(id);
      }
      setPendingDeletionId(null);
    }, 280);
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
      rememberLoanOverride(transactionId, normalizedAmount);
      updateTransactionsWithSync(updatedList);
    }
  };

  const openTransactionForm = (date?: string, type?: 'income' | 'expense', group?: TransactionGroup) => {
    setTransactionBeingEdited(null);
    setFormInitialDate(date || formatDateKey(new Date()));
    setFormInitialType(type);
    setFormInitialGroup(group);
    setIsFormOpen(true);
  };

  const handleEditTransactionRequest = (transaction: Transaction) => {
    setTransactionBeingEdited(transaction);
    setFormInitialDate(undefined);
    setFormInitialType(undefined);
    setFormInitialGroup(undefined);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTransactionBeingEdited(null);
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

  const currentBalanceValue = useMemo(
    () => calculateCurrentBalance(),
    [transactions, initialBalance]
  );

  const forecastResult = useMemo(
    () =>
      calculateForecast({
        transactions,
        currentBalance: currentBalanceValue,
        initialBalance,
      }),
    [transactions, currentBalanceValue, initialBalance]
  );

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setActiveTab('flow');
    }
  };

  useEffect(() => {
    if (!currentUser || !authToken) {
      setIsBootstrapping(false);
      setBootstrapError(null);
      return;
    }
    let cancelled = false;
    setIsBootstrapping(true);
    setBootstrapError(null);

    (async () => {
      isRestoringFromCloud.current = true;
      try {
        const snapshot = await fetchCloudSnapshot(authToken);
        if (!snapshot || cancelled) return;

        replaceClients(snapshot.clients ?? []);
        replaceCustomCategories(snapshot.customCategories ?? []);
        replaceLoanOverrides(snapshot.loanOverrides ?? {});
        setInitialBalance(
          typeof snapshot.initialBalance === 'number'
            ? snapshot.initialBalance
            : getInitialBalance()
        );
        const sanitizedSnapshot = sanitizeTransactions(snapshot.transactions ?? []);
        const withOverrides = applyLoanOverrides(sanitizedSnapshot);
        setTransactions(syncTaxTransactions(withOverrides));
        setBootstrapError(null);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          clearSession();
          setAuthError('החיבור לשרת פג תוקף. התחבר מחדש כדי להמשיך לסנכרן.');
        } else {
          console.error('Cloud sync fetch failed', error);
          setBootstrapError('לא הצלחנו לטעון את הנתונים מהשרת. בדקו את החיבור ונסו שוב.');
        }
      } finally {
        isRestoringFromCloud.current = false;
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, authToken, clearSession, cloudBootstrapVersion]);

  const buildSnapshotPayload = useCallback(() => {
    return {
      transactions,
      initialBalance,
      clients: getClients(),
      customCategories: getCustomCategories(),
      loanOverrides: getLoanOverrides(),
      updatedAt: new Date().toISOString(),
    };
  }, [transactions, initialBalance]);

  const performCloudSync = useCallback(async () => {
    if (!currentUser || !authToken || isRestoringFromCloud.current) {
      return;
    }

    const payload = buildSnapshotPayload();

    setSyncStatus('syncing');
    setSyncError(null);

    try {
      await persistCloudSnapshot(authToken, payload);
      setSyncStatus('idle');
      setLastSyncIso(new Date().toISOString());
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        setAuthError('החיבור לשרת פג תוקף. התחבר מחדש כדי להמשיך לסנכרן.');
        clearSession();
        return;
      }
      console.error('Cloud sync persist failed', error);
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'שגיאה לא ידועה');
    }
  }, [authToken, buildSnapshotPayload, clearSession, currentUser]);

  const handleManualSync = useCallback(() => {
    if (syncStatus === 'syncing') {
      return;
    }
    performCloudSync();
  }, [performCloudSync, syncStatus]);

  useEffect(() => {
    if (!currentUser || !authToken || isRestoringFromCloud.current) return;
    performCloudSync();
  }, [transactions, initialBalance, currentUser, authToken, performCloudSync]);

  useEffect(() => {
    setBalanceDraft(initialBalance.toString());
  }, [initialBalance]);

  useEffect(() => {
    if (!importFeedback) return;
    const timeout = setTimeout(() => setImportFeedback(null), 6000);
    return () => clearTimeout(timeout);
  }, [importFeedback]);

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

  const runTransactionsImport = (rawTransactions: unknown) => {
    if (!Array.isArray(rawTransactions)) {
      throw new Error('קובץ הגיבוי אינו מכיל רשימת תנועות חוקית');
    }
    updateTransactionsWithSync(rawTransactions as Transaction[]);
  };

  const applyBackupPayload = (payload: unknown) => {
    if (Array.isArray(payload)) {
      runTransactionsImport(payload);
      return;
    }

    if (payload && typeof payload === 'object') {
      const backup = payload as {
        transactions?: unknown;
        initialBalance?: unknown;
        clients?: unknown;
        customCategories?: unknown;
        loanOverrides?: unknown;
      };

      if (!Array.isArray(backup.transactions)) {
        throw new Error('קובץ הגיבוי אינו מכיל תנועות תקינות');
      }

      runTransactionsImport(backup.transactions);

      if (typeof backup.initialBalance === 'number' && Number.isFinite(backup.initialBalance)) {
        setInitialBalance(backup.initialBalance);
        saveInitialBalance(backup.initialBalance);
      }

      if (Array.isArray(backup.clients)) {
        replaceClients(backup.clients);
      }

      if (Array.isArray(backup.customCategories)) {
        replaceCustomCategories(backup.customCategories);
      }

      if (backup.loanOverrides && typeof backup.loanOverrides === 'object') {
        replaceLoanOverrides(backup.loanOverrides);
      }

      return;
    }

    throw new Error('קובץ הגיבוי אינו בפורמט נתמך');
  };

  const handleBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      applyBackupPayload(parsed);
      setImportFeedback({ type: 'success', message: 'ייבוא הגיבוי הושלם בהצלחה' });
    } catch (error) {
      console.error('Backup import failed', error);
      setImportFeedback({
        type: 'error',
        message: 'קובץ הגיבוי אינו חוקי או שאינו תואם ל-LegalFlow',
      });
    } finally {
      event.target.value = '';
    }
  };

  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleMobileImportClick = () => {
    handleImportButtonClick();
    setIsMobileActionsOpen(false);
  };

  const performBackupExport = useCallback(() => {
    exportBackupJSON(transactions);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(BACKUP_SESSION_KEY, '1');
    }
    setHasSessionBackup(true);
    setIsBackupReminderOpen(false);
    setBackupReminderWarning(null);
    setLogoutWarning(null);
  }, [transactions]);

  const handleMobileExportClick = () => {
    performBackupExport();
    setIsMobileActionsOpen(false);
  };

  const handleMobileBalanceClick = () => {
    setIsBalanceModalOpen(true);
    setIsMobileActionsOpen(false);
  };

  const handleMobileSyncClick = () => {
    handleManualSync();
    setIsMobileActionsOpen(false);
  };

  const handleExportBackup = useCallback(() => {
    performBackupExport();
  }, [performBackupExport]);

  const handleOpenBalanceModal = useCallback(() => {
    setIsBalanceModalOpen(true);
  }, []);

  const syncColorClass =
    syncStatus === 'syncing' ? 'bg-amber-400' : syncStatus === 'error' ? 'bg-red-500' : 'bg-emerald-500';
  const syncLabel =
    syncStatus === 'syncing' ? 'מסנכרן...' : syncStatus === 'error' ? 'שגיאת סנכרון' : 'מסונכרן';
  const lastSyncText = lastSyncIso
    ? `עודכן ${new Date(lastSyncIso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
    : 'טרם בוצע סנכרון';

useEffect(() => {
  if (!currentUser || !authToken) {
    setIsBackupReminderOpen(false);
  }
}, [currentUser, authToken]);

  const handleBackupReminderDismiss = () => {
    if (hasSessionBackup) {
      setIsBackupReminderOpen(false);
      setBackupReminderWarning(null);
      return;
    }
    setBackupReminderWarning('נראה שעדיין לא בוצע גיבוי במושב הנוכחי');
  };

  if (!currentUser || !authToken) {
    return (
      <div className="relative">
        {authError && (
          <div className="fixed top-4 left-4 right-4 z-50 rounded-2xl bg-red-600/95 text-white text-center text-sm font-semibold py-3 px-4 shadow-2xl">
            {authError}
          </div>
        )}
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-50 text-slate-700" dir="rtl">
        <Logo />
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">טוען נתונים מהשרת...</p>
          <p className="text-sm text-slate-500">זה לוקח לרוב שניות ספורות.</p>
        </div>
        {bootstrapError && (
          <div className="flex flex-col items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-amber-100 text-amber-900 text-sm font-semibold shadow">
              {bootstrapError}
            </div>
            <button
              onClick={requestBootstrapReload}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              נסה שוב
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040916] via-[#07142a] to-[#0c1f3c] font-sans text-slate-100">
      {bootstrapError && !isBootstrapping && (
        <div className="fixed top-4 left-4 right-4 z-40 md:left-auto md:right-10 md:w-auto">
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-2xl shadow-lg">
            <span className="text-sm font-semibold">{bootstrapError}</span>
            <button
              onClick={requestBootstrapReload}
              className="px-3 py-1 text-xs font-bold bg-amber-900 text-white rounded-lg hover:bg-amber-800 transition-colors"
            >
              נסה שוב
            </button>
          </div>
        </div>
      )}

      {logoutWarning && (
        <div className="fixed top-20 left-4 right-4 z-40 md:left-auto md:right-10 md:w-auto">
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold">
            {logoutWarning}
          </div>
        </div>
      )}

      
      {/* Sidebar */}
      <aside className="fixed top-0 right-0 h-full w-64 bg-[#050b18]/95 backdrop-blur text-white shadow-2xl z-20 hidden md:flex flex-col border-l border-white/5">
        <div className="p-6 border-b border-white/10 flex flex-col items-center justify-center py-8">
          <Logo />
          <div className="mt-4 text-xs text-slate-300 uppercase tracking-wider font-medium flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            מחובר: <span className="text-[var(--law-gold)]">{currentUser}</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 mt-2 overflow-y-auto">
          <div className="text-xs text-slate-400 font-bold px-4 mb-2 mt-2">תזרים ובקרה</div>
          <button 
            onClick={() => setActiveTab('flow')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'flow'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Table2 className="w-5 h-5" />
            תזרים חודשי
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            לוח בקרה
          </button>

          <div className="text-xs text-slate-400 font-bold px-4 mb-2 mt-6">ניהול משרד</div>
          <button 
            onClick={() => setActiveTab('summary')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'summary'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <FileText className="w-5 h-5" />
            תקציר מנהלים
          </button>
        </nav>

        <div className="p-4 border-t border-white/5">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-red-400 hover:bg-white/5 rounded-xl transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            התנתק
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden bg-[#050b18]/95 backdrop-blur text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-30 border-b border-white/10">
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
            <button
              onClick={() => setIsMobileActionsOpen(true)}
              className="text-slate-300 hover:text-white transition-colors"
              aria-label="פעולות"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button onClick={handleLogout} className="text-slate-400 hover:text-white">
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="md:mr-64 p-6 min-h-screen pb-24 md:pb-6">
        <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
          <button
            onClick={() => setIsHelpOpen(true)}
            title="עזרה / שאלות נפוצות"
            aria-label="עזרה / שאלות נפוצות"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border border-white/10 text-slate-200 hover:text-white hover:border-white/30 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-base leading-none">?</span>
          </button>
          <button
            onClick={handleBackNavigation}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-white/10 text-slate-200 hover:text-white hover:border-white/30 transition-colors uppercase"
          >
            BACK
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        {/* Top Action Bar */}
        {activeTab !== 'flow' && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">
                {activeTab === 'dashboard' && 'סקירה חודשית'}
                {activeTab === 'summary' && 'תקציר מנהלים'}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                {new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            
          </div>
        )}

        {/* Views */}
        <Suspense fallback={<div className="text-center text-slate-400 py-10">טוען נתונים...</div>}>
          <div key={activeTab} className="page-fade">
          {activeTab === 'flow' && (
            <MonthlyFlow 
              transactions={transactions}
              initialBalance={initialBalance}
              onDeleteTransaction={handleDeleteTransaction}
              openTransactionForm={openTransactionForm}
              onEditTransaction={handleEditTransactionRequest}
              onToggleStatus={handleToggleTransactionStatus}
              onUpdateTaxAmount={handleUpdateTaxAmount}
              onUpdateLoanAmount={handleUpdateLoanAmount}
              recentTransactionIds={recentTransactionIds}
              deletingTransactionId={pendingDeletionId}
              systemToolsToolbar={
                <SystemToolsToolbar
                  syncStatus={syncStatus}
                  syncLabel={syncLabel}
                  syncColorClass={syncColorClass}
                  lastSyncText={lastSyncText}
                  syncError={syncError}
                  importFeedback={importFeedback}
                  onManualSync={handleManualSync}
                  onImport={handleImportButtonClick}
                  onExport={handleExportBackup}
                  onOpenBalance={handleOpenBalanceModal}
                />
              }
            />
          )}

          {activeTab === 'dashboard' && (
            <Dashboard 
              transactions={transactions} 
              initialBalance={initialBalance}
              forecastResult={forecastResult}
            />
          )}

          {activeTab === 'summary' && (
            <ExecutiveSummary
              transactions={transactions}
              initialBalance={initialBalance}
              onRequestDailyWhatsappSummary={handleOpenDailyWhatsappSummary}
            />
          )}
          </div>
        </Suspense>
      </main>
      <DailyWhatsappSummaryModal
        isOpen={isDailyWhatsappModalOpen}
        onClose={handleCloseDailyWhatsappSummary}
        summaryText={dailyWhatsappSummary}
      />
      <HelpCenterModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#050b18]/95 border-t border-white/10 p-3 z-30 safe-area-pb backdrop-blur">
        <div className="flex items-center gap-3 overflow-x-auto">
          <button onClick={() => setActiveTab('flow')} className={`flex flex-col items-center gap-1 min-w-[70px] ${activeTab === 'flow' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <Table2 className="w-6 h-6" />
            <span className="text-[10px]">תזרים</span>
          </button>
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 min-w-[90px] ${activeTab === 'dashboard' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-[10px] text-center leading-tight">לוח בקרה</span>
          </button>
          <button onClick={() => setActiveTab('summary')} className={`flex flex-col items-center gap-1 min-w-[70px] ${activeTab === 'summary' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <FileText className="w-6 h-6" />
            <span className="text-[10px]">מנהלים</span>
          </button>
          <button onClick={() => openTransactionForm()} className="flex flex-col items-center justify-center min-w-[70px]">
            <div className="bg-slate-900 p-3 rounded-full shadow-lg text-[#d4af37] border-2 border-[#d4af37]">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-[10px] mt-1 text-slate-600">תנועה</span>
          </button>
        </div>
      </div>

      <TransactionForm 
        isOpen={isFormOpen} 
        onClose={handleCloseForm} 
        onSubmit={handleAddTransactionBatch}
        onSubmitEdit={handleSubmitEditedTransaction}
        initialDate={transactionBeingEdited ? undefined : formInitialDate}
        initialType={transactionBeingEdited ? undefined : formInitialType}
        initialGroup={transactionBeingEdited ? undefined : formInitialGroup}
        transactionToEdit={transactionBeingEdited}
        existingTransactions={transactions}
      />

      {isMobileActionsOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-t-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">פעולות מהירות</h3>
              <button
                onClick={() => setIsMobileActionsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-sm font-semibold"
              >
                סגור
              </button>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleMobileSyncClick}
                disabled={syncStatus === 'syncing'}
                className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                  syncStatus === 'syncing'
                    ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {syncStatus === 'syncing' ? 'מסנכרן...' : 'סנכרון עכשיו'}
              </button>
              <button
                onClick={handleMobileImportClick}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ייבוא גיבוי
              </button>
              <button
                onClick={handleMobileExportClick}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ייצוא גיבוי
              </button>
              <button
                onClick={handleMobileBalanceClick}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                עדכון יתרת פתיחה
              </button>
              <button
                onClick={() => {
                  setIsMobileActionsOpen(false);
                  handleLogout();
                }}
                className="w-full px-4 py-3 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      )}

      {importFeedback && (
        <div
          className={`md:hidden fixed bottom-24 left-4 right-4 z-40 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg ${
            importFeedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {importFeedback.message}
        </div>
      )}

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

      {isBackupReminderOpen && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 p-6 space-y-4 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-800">
                לידור – אל תשכח לבצע גיבוי
              </h3>
              <p className="text-sm text-slate-500">
                זה לוקח פחות מדקה ויכול להציל לך חודש שלם של עבודה 🙂
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={performBackupExport}
                className="w-full rounded-xl bg-slate-900 text-white font-semibold py-3 hover:bg-slate-800 transition"
              >
                בצע גיבוי עכשיו
              </button>
              <button
                onClick={handleBackupReminderDismiss}
                className="w-full rounded-xl border border-slate-200 text-slate-600 font-semibold py-3 hover:bg-slate-50 transition"
              >
                כבר ביצעתי גיבוי
              </button>
              {backupReminderWarning && (
                <p className="text-xs text-red-500 mt-2">{backupReminderWarning}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleBackupFileChange}
      />

    </div>
  );
};

export default App;

/**
 * Loan persistence fix notes (Dec 2025):
 * Root cause:
 *   Legacy storage cleanup renamed/deleted loans that used the older Hebrew labels (“מימון ישיר”, “פועלים”, “משכנתא”)
 *   and, in some backups, the group was downgraded to “operational”. The sanitize pipeline later removed those rows,
 *   so loans vanished after refresh/import.
 * Fix summary:
 *   - Added a storage migration that normalizes legacy loan category names and forces their group to remain “loan”.
 *   - Added logging + dev-only assertions whenever loan-like categories are filtered or misclassified.
 *   - Documented the invariant that transactions spawned from the Loans column must stay group === 'loan'.
 *
 * Manual test checklist:
 * 1. New single loan (future date): add a loan on 2025-12-05 (“החזר הלוואה מימון ישיר”, ₪1,770) and verify it
 *    appears immediately, survives a full refresh, and keeps group === 'loan' in localStorage.
 * 2. Recurring loan: add a 12-month recurring loan starting 2025-11-15. Confirm the first entry preserves the chosen
 *    status, future months are pending, and all entries remain in the Loans column after refresh.
 * 3. Legacy label migration: add/import a loan whose category is the short form (“מימון ישיר”). Refresh and verify
 *    it still exists, now normalized to “החזר הלוואה מימון ישיר”, and shows in Monthly Flow + Dashboard.
 * 4. Backup import: load the provided backup JSON and confirm all historical loans (including legacy names) appear
 *    under the Loans column with group === 'loan'. Observe the console log entries tagged [LoanMigration].
 * 5. Regression sweep: verify non-loan transactions (income, taxes, operational, personal, bank adjustments) and
 *    tax auto-sync still behave as before, and Dashboard analytics continue to render without errors.
 */