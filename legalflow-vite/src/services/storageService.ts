import type { Transaction } from '../types';
import { INITIAL_TRANSACTIONS, INITIAL_BALANCE, CATEGORIES, INITIAL_CLIENTS } from '../constants';

const STORAGE_KEY_TRANSACTIONS = 'legalflow_transactions_v2';
const STORAGE_KEY_INITIAL_BALANCE = 'legalflow_initial_balance_v2';
const STORAGE_KEY_CUSTOM_CATEGORIES = 'legalflow_custom_categories_v2';
const STORAGE_KEY_CLIENTS = 'legalflow_clients_v1';
const STORAGE_KEY_LOAN_OVERRIDES = 'legalflow_loan_overrides_v1';
export const STORAGE_EVENT = 'legalflow:storage-changed';

const emitStorageChange = (key: string) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(STORAGE_EVENT, {
      detail: { key },
    })
  );
};
const LEGACY_LOAN_CATEGORY_NAMES = new Set(['מימון ישיר', 'פועלים', 'משכנתא']);
const LEGACY_CLIENT_NAME = 'טרם';
const REQUIRED_TEREM_CLIENTS = ['טרם ריטיינר', 'טרם שעתי'];

export const getTransactions = (): Transaction[] => {
  const stored = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
  if (!stored) {
    return INITIAL_TRANSACTIONS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return INITIAL_TRANSACTIONS;
  }

  if (!Array.isArray(parsed)) {
    return INITIAL_TRANSACTIONS;
  }

  const cleaned = parsed.filter(transaction => {
    if (!transaction || typeof transaction !== 'object') {
      return true;
    }
    const group = (transaction as { group?: string }).group;
    const category = (transaction as { category?: string }).category;
    if (group === 'loan' && typeof category === 'string' && LEGACY_LOAN_CATEGORY_NAMES.has(category)) {
      return false;
    }
    return true;
  }) as Transaction[];

  if (cleaned.length !== parsed.length) {
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(cleaned));
  }

  return cleaned;
};

export const saveTransactions = (transactions: Transaction[]) => {
  localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
};

export const getInitialBalance = (): number => {
  const stored = localStorage.getItem(STORAGE_KEY_INITIAL_BALANCE);
  if (stored) {
    return parseFloat(stored);
  }
  return INITIAL_BALANCE;
};

export const saveInitialBalance = (amount: number) => {
  localStorage.setItem(STORAGE_KEY_INITIAL_BALANCE, amount.toString());
};

// --- Custom Categories Logic ---

export const getCustomCategories = () => {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_CATEGORIES);
    if (stored) {
        return JSON.parse(stored);
    }
    return [];
};

export const replaceCustomCategories = (categories: unknown) => {
  const safeList = Array.isArray(categories) ? categories : [];
  localStorage.setItem(STORAGE_KEY_CUSTOM_CATEGORIES, JSON.stringify(safeList));
  emitStorageChange('customCategories');
};

export const saveCustomCategory = (newCategoryName: string, type: 'income' | 'expense', specificGroup?: string) => {
    const current = getCustomCategories();
    
    let group = type === 'income' ? 'other_income' : 'operational'; // Default for new custom
    if (specificGroup) group = specificGroup;

    const newCat = {
        id: `custom_${Date.now()}`,
        name: newCategoryName,
        type: type,
        group: group,
        color: '#64748b'
    };
    const updated = [...current, newCat];
    localStorage.setItem(STORAGE_KEY_CUSTOM_CATEGORIES, JSON.stringify(updated));
  emitStorageChange('customCategories');
    return updated;
};

export const getAllCategories = () => {
    const custom = getCustomCategories();
    return [...CATEGORIES, ...custom];
};

const getLoanOverridesMap = (): Record<string, number> => {
  const stored = localStorage.getItem(STORAGE_KEY_LOAN_OVERRIDES);
  if (!stored) {
    return {};
  }
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
};

const persistLoanOverridesMap = (map: Record<string, number>) => {
  localStorage.setItem(STORAGE_KEY_LOAN_OVERRIDES, JSON.stringify(map));
  emitStorageChange('loanOverrides');
};

export const rememberLoanOverride = (transactionId: string, amount: number) => {
  const overrides = getLoanOverridesMap();
  overrides[transactionId] = amount;
  persistLoanOverridesMap(overrides);
};

export const removeLoanOverride = (transactionId: string) => {
  const overrides = getLoanOverridesMap();
  if (transactionId in overrides) {
    delete overrides[transactionId];
    persistLoanOverridesMap(overrides);
  }
};

export const applyLoanOverrides = (transactions: Transaction[]): Transaction[] => {
  const overrides = getLoanOverridesMap();
  const entries = Object.entries(overrides);
  if (!entries.length) {
    return transactions;
  }

  const transactionIds = new Set(transactions.map(t => t.id));
  let didPrune = false;
  const filteredOverrides: Record<string, number> = {};

  entries.forEach(([id, amount]) => {
    if (transactionIds.has(id)) {
      filteredOverrides[id] = amount;
    } else {
      didPrune = true;
    }
  });

  if (didPrune) {
    persistLoanOverridesMap(filteredOverrides);
  }

  if (!Object.keys(filteredOverrides).length) {
    return transactions;
  }

  let didMutate = false;
  const enriched = transactions.map(transaction => {
    if (transaction.group !== 'loan') {
      return transaction;
    }
    const overrideAmount = filteredOverrides[transaction.id];
    if (overrideAmount === undefined || transaction.amount === overrideAmount) {
      return transaction;
    }
    didMutate = true;
    return {
      ...transaction,
      amount: overrideAmount,
    };
  });

  return didMutate ? enriched : transactions;
};

export const getLoanOverrides = (): Record<string, number> => ({
  ...getLoanOverridesMap(),
});

export const replaceLoanOverrides = (nextOverrides: unknown) => {
  if (!nextOverrides || typeof nextOverrides !== 'object') {
    persistLoanOverridesMap({});
    return;
  }

  const sanitized: Record<string, number> = {};
  for (const [key, value] of Object.entries(nextOverrides as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key.trim()) {
      continue;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      continue;
    }
    sanitized[key] = Math.abs(amount);
  }
  persistLoanOverridesMap(sanitized);
};

// --- Clients Logic ---

const normalizeRawClientList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  input.forEach(entry => {
    if (typeof entry !== 'string') return;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) return;
    normalized.push(trimmed);
    seen.add(trimmed);
  });

  return normalized;
};

const sanitizeClientList = (input: unknown): string[] => {
  const sourceArray = normalizeRawClientList(input);
  const seen = new Set<string>();
  const sanitized: string[] = [];

  sourceArray.forEach(entry => {
    if (entry === LEGACY_CLIENT_NAME) return;
    if (seen.has(entry)) return;
    sanitized.push(entry);
    seen.add(entry);
  });

  REQUIRED_TEREM_CLIENTS.forEach(clientName => {
    if (!seen.has(clientName)) {
      sanitized.push(clientName);
      seen.add(clientName);
    }
  });

  return sanitized;
};

const writeClientsIfChanged = (currentRaw: unknown, sanitized: string[]) => {
  const normalizedOriginal = normalizeRawClientList(currentRaw);
  if (
    normalizedOriginal.length !== sanitized.length ||
    normalizedOriginal.some((name, idx) => name !== sanitized[idx])
  ) {
    localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(sanitized));
  }
};

export const getClients = (): string[] => {
  const stored = localStorage.getItem(STORAGE_KEY_CLIENTS);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const sanitized = sanitizeClientList(parsed);
      writeClientsIfChanged(parsed, sanitized);
      return sanitized;
    } catch {
      // Fall through to defaults
    }
  }

  const sanitizedDefaults = sanitizeClientList(INITIAL_CLIENTS);
  return sanitizedDefaults;
};

export const saveClient = (newClientName: string) => {
    const current = getClients();
    if (!current.includes(newClientName)) {
        const updated = [...current, newClientName];
        localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(updated));
        emitStorageChange('clients');
        return updated;
    }
    return current;
};

export const replaceClients = (nextClients: unknown) => {
  const sanitized = sanitizeClientList(nextClients);
  localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(sanitized));
  emitStorageChange('clients');
};

// --- Backup Logic ---

export const exportBackupJSON = (transactions: Transaction[]) => {
    const data = {
        timestamp: new Date().toISOString(),
        transactions,
        clients: getClients(),
        customCategories: getCustomCategories(),
        initialBalance: getInitialBalance(),
        loanOverrides: getLoanOverrides()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').split('T');
    link.download = `LegalFlow_Backup_${dateStr[0]}_${dateStr[1].slice(0,5)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};