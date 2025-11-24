import React, { useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo } from 'react';
import { Plus, LayoutDashboard, Table2, LogOut, Briefcase, FileText, ShieldCheck, ArrowRight, Menu, AlertTriangle, ListTodo } from 'lucide-react';
import type { Transaction, TransactionGroup, LloydsCollectionItem, GenericCollectionItem, AccessCollectionItem, TaskItem } from './types';
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
  getLloydsCollectionItems,
  saveLloydsCollectionItems,
  replaceLloydsCollectionItems,
  getGenericCollectionItems,
  saveGenericCollectionItems,
  replaceGenericCollectionItems,
  getAccessCollectionItems,
  saveAccessCollectionItems,
  replaceAccessCollectionItems,
  getTasks,
  saveTasks,
  STORAGE_EVENT,
} from './services/storageService';
import { generateExecutiveSummary } from './services/reportService';
import { syncTaxTransactions } from './services/taxService';
import TransactionForm from './components/TransactionForm';
import Logo from './components/Logo';
import Login from './components/Login';
import { fetchCloudSnapshot, persistCloudSnapshot, UnauthorizedError } from './services/cloudService';
import { formatDateKey, parseDateKey } from './utils/date';
import { calculateOverdueDays } from './utils/collectionStatus';
import OverdueAlertsPanel from './components/OverdueAlertsPanel';
import type { OverdueAlertEntry } from './components/OverdueAlertsPanel';
import SystemToolsToolbar from './components/SystemToolsToolbar';
import ClientInsightPanel from './components/ClientInsightPanel';
import type { ClientInsightTarget } from './components/ClientInsightPanel';
import { calculateForecast } from './services/forecastService';
import { buildDailyWhatsappSummary } from './services/cfoAssistantService';
import DailyWhatsappSummaryModal from './components/DailyWhatsappSummaryModal';

const MonthlyFlow = lazy(() => import('./components/MonthlyFlow'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const CollectionTracker = lazy(() => import('./components/CollectionTracker'));
const ExecutiveSummary = lazy(() => import('./components/ExecutiveSummary'));
const LloydsCollectionTracker = lazy(() => import('./components/LloydsCollectionTracker'));
const GenericCollectionTracker = lazy(() => import('./components/GenericCollectionTracker'));
const AccessCollectionTracker = lazy(() => import('./components/AccessCollectionTracker'));
const TaskManager = lazy(() => import('./components/TaskManager'));

const CASHFLOW_CUTOFF = parseDateKey('2025-11-01');
const LOAN_FREEZE_CUTOFF = parseDateKey('2025-12-01');
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
  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'flow'
    | 'collection'
    | 'summary'
    | 'collectionLloyds'
    | 'collectionGeneric'
    | 'collectionAccess'
    | 'tasks'
  >('flow');

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
  const [storageSyncVersion, setStorageSyncVersion] = useState(0);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [cloudBootstrapVersion, setCloudBootstrapVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncIso, setLastSyncIso] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lloydsItems, setLloydsItems] = useState<LloydsCollectionItem[]>(() => getLloydsCollectionItems());
  const [genericItems, setGenericItems] = useState<GenericCollectionItem[]>(() => getGenericCollectionItems());
  const [accessItems, setAccessItems] = useState<AccessCollectionItem[]>(() => getAccessCollectionItems());
  const [tasks, setTasks] = useState<TaskItem[]>(() => getTasks());
  const [highlightedCollection, setHighlightedCollection] = useState<{ type: 'lloyds' | 'generic' | 'access'; id: string } | null>(null);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isBackupReminderOpen, setIsBackupReminderOpen] = useState(false);
  const [backupReminderWarning, setBackupReminderWarning] = useState<string | null>(null);
  const [hasSessionBackup, setHasSessionBackup] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return sessionStorage.getItem(BACKUP_SESSION_KEY) === '1';
  });
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);
  const [clientInsightTarget, setClientInsightTarget] = useState<ClientInsightTarget | null>(null);
  const [isDailyWhatsappModalOpen, setIsDailyWhatsappModalOpen] = useState(false);
  const [dailyWhatsappSummary, setDailyWhatsappSummary] = useState('');
  const handleOpenClientInsight = useCallback((target: ClientInsightTarget) => {
    setClientInsightTarget(target);
  }, []);
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

  const persistLloydsItems = useCallback((nextItems: LloydsCollectionItem[]) => {
    setLloydsItems(nextItems);
    saveLloydsCollectionItems(nextItems);
  }, []);

  const persistGenericItems = useCallback((nextItems: GenericCollectionItem[]) => {
    setGenericItems(nextItems);
    saveGenericCollectionItems(nextItems);
  }, []);

  const persistAccessItems = useCallback((nextItems: AccessCollectionItem[]) => {
    setAccessItems(nextItems);
    saveAccessCollectionItems(nextItems);
  }, []);

  const persistTasks = useCallback((nextTasks: TaskItem[]) => {
    setTasks(nextTasks);
    saveTasks(nextTasks);
  }, []);

  // --- Persistence ---
  useEffect(() => {
     // Whenever transactions change, we save them.
     // Note: The sync logic is handled inside the update handlers to avoid infinite loops in useEffect
     saveTransactions(transactions);
  }, [transactions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorageSync = () => {
      setStorageSyncVersion(prev => prev + 1);
    };

    window.addEventListener(STORAGE_EVENT, handleStorageSync);
    return () => window.removeEventListener(STORAGE_EVENT, handleStorageSync);
  }, []);

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
    setIsBackupReminderOpen(true);
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
        const snapshotLloyds = replaceLloydsCollectionItems(snapshot.lloydsCollection ?? []);
        const snapshotGeneric = replaceGenericCollectionItems(snapshot.genericCollection ?? []);
        const snapshotAccess = replaceAccessCollectionItems(snapshot.accessCollection ?? []);
        setLloydsItems(snapshotLloyds);
        setGenericItems(snapshotGeneric);
        setAccessItems(snapshotAccess);
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
      lloydsCollection: lloydsItems,
      genericCollection: genericItems,
      accessCollection: accessItems,
      updatedAt: new Date().toISOString(),
    };
  }, [transactions, initialBalance, lloydsItems, genericItems, accessItems]);

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
  }, [
    transactions,
    initialBalance,
    lloydsItems,
    genericItems,
    currentUser,
    authToken,
    storageSyncVersion,
    performCloudSync,
  ]);

  useEffect(() => {
    setBalanceDraft(initialBalance.toString());
  }, [initialBalance]);

  useEffect(() => {
    setLloydsItems(getLloydsCollectionItems());
    setGenericItems(getGenericCollectionItems());
    setAccessItems(getAccessCollectionItems());
    setTasks(getTasks());
  }, [storageSyncVersion]);

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
        lloydsCollection?: unknown;
        genericCollection?: unknown;
        accessCollection?: unknown;
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

      if (backup.lloydsCollection) {
        const sanitized = replaceLloydsCollectionItems(backup.lloydsCollection);
        setLloydsItems(sanitized);
      }

      if (backup.genericCollection) {
        const sanitized = replaceGenericCollectionItems(backup.genericCollection);
        setGenericItems(sanitized);
      }

      if (backup.accessCollection) {
        const sanitized = replaceAccessCollectionItems(backup.accessCollection);
        setAccessItems(sanitized);
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

  const handleShowAlerts = useCallback(() => {
    setIsAlertsOpen(true);
  }, []);

  const handleAlertNavigate = useCallback(
    (entry: OverdueAlertEntry) => {
      setIsAlertsOpen(false);
      if (entry.tracker === 'lloyds') {
        setActiveTab('collectionLloyds');
        setHighlightedCollection({ type: 'lloyds', id: entry.id });
      } else if (entry.tracker === 'generic') {
        setActiveTab('collectionGeneric');
        setHighlightedCollection({ type: 'generic', id: entry.id });
      } else {
        setActiveTab('collectionAccess');
        setHighlightedCollection({ type: 'access', id: entry.id });
      }
    },
    []
  );

  const clearHighlight = useCallback(() => {
    setHighlightedCollection(null);
  }, []);

  const syncColorClass =
    syncStatus === 'syncing' ? 'bg-amber-400' : syncStatus === 'error' ? 'bg-red-500' : 'bg-emerald-500';
  const syncLabel =
    syncStatus === 'syncing' ? 'מסנכרן...' : syncStatus === 'error' ? 'שגיאת סנכרון' : 'מסונכרן';
  const lastSyncText = lastSyncIso
    ? `עודכן ${new Date(lastSyncIso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
    : 'טרם בוצע סנכרון';
  const overdueEntries = useMemo<OverdueAlertEntry[]>(() => {
    const entries: OverdueAlertEntry[] = [];
    lloydsItems.forEach(item => {
      const overdueDays = calculateOverdueDays(item.demandDate, item.isPaid);
      if (overdueDays !== null) {
        entries.push({
          id: item.id,
          tracker: 'lloyds',
          accountNumber: item.accountNumber,
          name: item.claimantName || item.insuredName || 'ללא שם',
          demandDate: item.demandDate,
          amount: item.amount,
          overdueDays,
        });
      }
    });
    genericItems.forEach(item => {
      const overdueDays = calculateOverdueDays(item.demandDate, item.isPaid);
      if (overdueDays !== null) {
        entries.push({
          id: item.id,
          tracker: 'generic',
          accountNumber: item.accountNumber,
          name: item.clientName || item.caseName || 'ללא שם',
          demandDate: item.demandDate,
          amount: item.amount,
          overdueDays,
        });
      }
    });
    accessItems.forEach(item => {
      const overdueDays = calculateOverdueDays(item.demandDate, item.isPaid);
      if (overdueDays !== null) {
        entries.push({
          id: item.id,
          tracker: 'access',
          accountNumber: item.accountNumber,
          name: item.insuredName || item.caseName || 'ללא שם',
          demandDate: item.demandDate,
          amount: item.amount,
          overdueDays,
        });
      }
    });
    return entries.sort((a, b) => b.overdueDays - a.overdueDays);
  }, [lloydsItems, genericItems, accessItems]);
  const lloydsHighlightId = highlightedCollection?.type === 'lloyds' ? highlightedCollection.id : null;
  const genericHighlightId = highlightedCollection?.type === 'generic' ? highlightedCollection.id : null;
  const accessHighlightId = highlightedCollection?.type === 'access' ? highlightedCollection.id : null;

  useEffect(() => {
    if (currentUser && authToken) {
      if (!hasSessionBackup) {
        setIsBackupReminderOpen(true);
      }
    } else {
      setIsBackupReminderOpen(false);
    }
  }, [currentUser, authToken, hasSessionBackup]);

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

           <button 
            onClick={() => setActiveTab('collection')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'collection'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            תשלומים צפויים
          </button>
          <button 
            onClick={() => setActiveTab('collectionLloyds')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'collectionLloyds'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            מעקב גבייה – לוידס
          </button>
          <button 
            onClick={() => setActiveTab('collectionGeneric')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'collectionGeneric'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            מעקב גבייה – לקוחות שונים
          </button>
          <button 
            onClick={() => setActiveTab('collectionAccess')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'collectionAccess'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            מעקב גבייה – אקסס
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
              activeTab === 'tasks'
                ? 'bg-white/10 text-white shadow-lg border border-white/10'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <ListTodo className="w-5 h-5" />
            משימות
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
        <div className="flex justify-end mb-4">
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
                {activeTab === 'collection' && 'תשלומים צפויים'}
                {activeTab === 'collectionLloyds' && 'מעקב גבייה – לוידס'}
                {activeTab === 'collectionGeneric' && 'מעקב גבייה – לקוחות שונים'}
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
              forecastResult={forecastResult}
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
                  alertsCount={overdueEntries.length}
                  onManualSync={handleManualSync}
                  onImport={handleImportButtonClick}
                  onExport={handleExportBackup}
                  onOpenBalance={handleOpenBalanceModal}
                  onShowAlerts={handleShowAlerts}
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

          {activeTab === 'collection' && (
              <CollectionTracker 
                  transactions={transactions}
                  onMarkAsPaid={handleMarkAsPaid}
                  recentTransactionIds={recentTransactionIds}
                  deletingTransactionId={pendingDeletionId}
              />
          )}

          {activeTab === 'collectionLloyds' && (
            <LloydsCollectionTracker
              items={lloydsItems}
              onChange={persistLloydsItems}
              highlightedId={lloydsHighlightId}
              onClearHighlight={lloydsHighlightId ? clearHighlight : undefined}
              onClientInsightRequest={handleOpenClientInsight}
            />
          )}

          {activeTab === 'collectionGeneric' && (
            <GenericCollectionTracker
              items={genericItems}
              onChange={persistGenericItems}
              highlightedId={genericHighlightId}
              onClearHighlight={genericHighlightId ? clearHighlight : undefined}
              onClientInsightRequest={handleOpenClientInsight}
            />
          )}

          {activeTab === 'collectionAccess' && (
            <AccessCollectionTracker
              items={accessItems}
              onChange={persistAccessItems}
              highlightedId={accessHighlightId}
              onClearHighlight={accessHighlightId ? clearHighlight : undefined}
              onClientInsightRequest={handleOpenClientInsight}
            />
          )}

          {activeTab === 'summary' && (
            <ExecutiveSummary
              transactions={transactions}
              initialBalance={initialBalance}
              lloydsItems={lloydsItems}
              genericItems={genericItems}
              accessItems={accessItems}
              onRequestDailyWhatsappSummary={handleOpenDailyWhatsappSummary}
            />
          )}

          {activeTab === 'tasks' && (
            <TaskManager tasks={tasks} onChange={persistTasks} />
          )}
          </div>
        </Suspense>
      </main>
      <DailyWhatsappSummaryModal
        isOpen={isDailyWhatsappModalOpen}
        onClose={handleCloseDailyWhatsappSummary}
        summaryText={dailyWhatsappSummary}
      />

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#050b18]/95 border-t border-white/10 p-3 z-30 safe-area-pb backdrop-blur">
        <div className="flex items-center gap-3 overflow-x-auto">
          <button onClick={() => setActiveTab('flow')} className={`flex flex-col items-center gap-1 min-w-[70px] ${activeTab === 'flow' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <Table2 className="w-6 h-6" />
            <span className="text-[10px]">תזרים</span>
          </button>
          <button onClick={() => setActiveTab('collection')} className={`flex flex-col items-center gap-1 min-w-[90px] ${activeTab === 'collection' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <Briefcase className="w-6 h-6" />
            <span className="text-[10px] text-center leading-tight">תשלומים צפויים</span>
          </button>
          <button onClick={() => setActiveTab('collectionLloyds')} className={`flex flex-col items-center gap-1 min-w-[120px] ${activeTab === 'collectionLloyds' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <Briefcase className="w-6 h-6" />
            <span className="text-[9px] text-center leading-tight">מעקב גבייה – לוידס</span>
          </button>
          <button onClick={() => setActiveTab('collectionGeneric')} className={`flex flex-col items-center gap-1 min-w-[130px] ${activeTab === 'collectionGeneric' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <Briefcase className="w-6 h-6" />
            <span className="text-[9px] text-center leading-tight">מעקב גבייה – לקוחות שונים</span>
          </button>
          <button onClick={() => setActiveTab('collectionAccess')} className={`flex flex-col items-center gap-1 min-w-[120px] ${activeTab === 'collectionAccess' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <Briefcase className="w-6 h-6" />
            <span className="text-[9px] text-center leading-tight">מעקב גבייה – אקסס</span>
          </button>
          <button onClick={() => setActiveTab('summary')} className={`flex flex-col items-center gap-1 min-w-[70px] ${activeTab === 'summary' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <FileText className="w-6 h-6" />
            <span className="text-[10px]">מנהלים</span>
          </button>
          <button onClick={() => setActiveTab('tasks')} className={`flex flex-col items-center gap-1 min-w-[80px] ${activeTab === 'tasks' ? 'text-[#d4af37]' : 'text-slate-400'}`}>
            <ListTodo className="w-6 h-6" />
            <span className="text-[10px]">משימות</span>
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
                onClick={() => {
                  setIsAlertsOpen(true);
                  setIsMobileActionsOpen(false);
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <span>התראות</span>
                {overdueEntries.length > 0 && (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                    {overdueEntries.length}
                  </span>
                )}
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

      <OverdueAlertsPanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        entries={overdueEntries}
        onNavigate={handleAlertNavigate}
      />

      <ClientInsightPanel
        isOpen={Boolean(clientInsightTarget)}
        target={clientInsightTarget}
        onClose={() => setClientInsightTarget(null)}
        transactions={transactions}
        lloydsItems={lloydsItems}
        genericItems={genericItems}
        accessItems={accessItems}
      />

    </div>
  );
};

export default App;