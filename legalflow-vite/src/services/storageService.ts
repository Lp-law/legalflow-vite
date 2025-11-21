import type { Transaction } from '../types';
import { INITIAL_TRANSACTIONS, INITIAL_BALANCE, CATEGORIES, INITIAL_CLIENTS } from '../constants';

const STORAGE_KEY_TRANSACTIONS = 'legalflow_transactions_v2';
const STORAGE_KEY_INITIAL_BALANCE = 'legalflow_initial_balance_v2';
const STORAGE_KEY_CUSTOM_CATEGORIES = 'legalflow_custom_categories_v2';
const STORAGE_KEY_CLIENTS = 'legalflow_clients_v1';
const STORAGE_KEY_LOAN_OVERRIDES = 'legalflow_loan_overrides_v1';

export const getTransactions = (): Transaction[] => {
  const stored = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
  if (stored) {
    return JSON.parse(stored);
  }
  return INITIAL_TRANSACTIONS;
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

// --- Clients Logic ---

export const getClients = (): string[] => {
    const stored = localStorage.getItem(STORAGE_KEY_CLIENTS);
    if (stored) {
        return JSON.parse(stored);
    }
    return INITIAL_CLIENTS;
};

export const saveClient = (newClientName: string) => {
    const current = getClients();
    if (!current.includes(newClientName)) {
        const updated = [...current, newClientName];
        localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(updated));
        return updated;
    }
    return current;
};

// --- Backup Logic ---

export const exportBackupJSON = (transactions: Transaction[]) => {
    const data = {
        timestamp: new Date().toISOString(),
        transactions,
        clients: getClients(),
        customCategories: getCustomCategories(),
        initialBalance: getInitialBalance()
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