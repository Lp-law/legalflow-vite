import type { Transaction } from '../types';
import { INITIAL_TRANSACTIONS, INITIAL_BALANCE, CATEGORIES, INITIAL_CLIENTS } from '../constants';

const STORAGE_KEY_TRANSACTIONS = 'legalflow_transactions_v2';
const STORAGE_KEY_INITIAL_BALANCE = 'legalflow_initial_balance_v2';
const STORAGE_KEY_CUSTOM_CATEGORIES = 'legalflow_custom_categories_v2';
const STORAGE_KEY_CLIENTS = 'legalflow_clients_v1';
const STORAGE_KEY_LOAN_OVERRIDES = 'legalflow_loan_overrides_v1';
const STORAGE_KEY_MEDICAL_TOKENS = 'legalflow_medical_dept_tokens_v1';
const STORAGE_KEY_TX_DEPT_OVERRIDES = 'legalflow_tx_dept_overrides_v1';
const STORAGE_KEY_AUTOFILL_BLACKLIST = 'legalflow_autofill_blacklist_v1';
const STORAGE_KEY_FORECAST_OVERRIDES = 'legalflow_forecast_item_overrides_v1';
const STORAGE_KEY_FORECAST_BUFFER = 'legalflow_forecast_monthly_buffer_v1';
const FORECAST_BUFFER_DEFAULT = 7500;
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
export const LOAN_CATEGORY_NORMALIZATION_MAP: Record<string, string> = {
  'החזר הלוואה מימון ישיר': 'החזר הלוואה מימון ישיר',
  'החזר הלוואה פועלים': 'החזר הלוואה פועלים',
  'החזר משכנתא': 'החזר משכנתא',
  'מימון ישיר': 'החזר הלוואה מימון ישיר',
  'פועלים': 'החזר הלוואה פועלים',
  'משכנתא': 'החזר משכנתא',
};
export const normalizeLoanCategoryName = (category?: string | null): string | null => {
  if (typeof category !== 'string') {
    return null;
  }
  const trimmed = category.trim();
  if (!trimmed) {
    return null;
  }
  return LOAN_CATEGORY_NORMALIZATION_MAP[trimmed] ?? null;
};

export const isLoanCategoryLabel = (category?: string | null): boolean =>
  Boolean(normalizeLoanCategoryName(category));
const LEGACY_CLIENT_NAME = 'טרם';
const REQUIRED_TEREM_CLIENTS = ['טרם ריטיינר', 'טרם שעתי'];


const logLoanMigration = (message: string, transaction: Transaction) => {
  if (typeof console === 'undefined') {
    return;
  }
  console.warn('[LoanMigration]', message, {
    id: transaction.id,
    date: transaction.date,
    category: transaction.category,
    group: transaction.group,
  });
};

const runLoanMigrations = (transactions: Transaction[]): { cleaned: Transaction[]; didMutate: boolean } => {
  let didMutate = false;
  const cleaned = transactions.map(entry => {
    if (!entry || typeof entry !== 'object') {
      return entry as Transaction;
    }
    const transaction = entry as Transaction;
    const canonicalCategory = normalizeLoanCategoryName(
      typeof transaction.category === 'string' ? transaction.category : ''
    );

    if (!canonicalCategory) {
      return transaction;
    }

    let next = transaction;
    const trimmedCategory =
      typeof transaction.category === 'string' ? transaction.category.trim() : transaction.category;

    if (canonicalCategory !== trimmedCategory) {
      next = next === transaction ? { ...transaction } : next;
      next.category = canonicalCategory;
      didMutate = true;
      logLoanMigration(`Renamed legacy loan category "${trimmedCategory}" -> "${canonicalCategory}"`, next);
    }

    if (transaction.group !== 'loan') {
      next = next === transaction ? { ...transaction } : next;
      next.group = 'loan';
      didMutate = true;
      logLoanMigration(
        `Updated transaction group to 'loan' for canonical loan category "${canonicalCategory}"`,
        next
      );
    }

    return next;
  }) as Transaction[];

  return { cleaned, didMutate };
};

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

  const transactions = parsed as Transaction[];
  const { cleaned, didMutate } = runLoanMigrations(transactions);

  if (didMutate) {
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

// --- Department classification (medical negligence vs civil litigation) ---
// Stores tokens (substrings) the user has explicitly tagged as medical
// negligence. Matching logic: a transaction belongs to medical negligence
// if its description contains any hardcoded token OR any user token.

const sanitizeMedicalTokens = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim());
};

export const getUserMedicalTokens = (): string[] => {
  const stored = localStorage.getItem(STORAGE_KEY_MEDICAL_TOKENS);
  if (!stored) return [];
  try {
    return sanitizeMedicalTokens(JSON.parse(stored));
  } catch {
    return [];
  }
};

export const addUserMedicalToken = (token: string): string[] => {
  const trimmed = token.trim();
  if (!trimmed) return getUserMedicalTokens();
  const current = getUserMedicalTokens();
  if (current.includes(trimmed)) return current;
  const updated = [...current, trimmed];
  localStorage.setItem(STORAGE_KEY_MEDICAL_TOKENS, JSON.stringify(updated));
  emitStorageChange('medical_tokens');
  return updated;
};

export const removeUserMedicalToken = (token: string): string[] => {
  const trimmed = token.trim();
  const current = getUserMedicalTokens();
  const updated = current.filter(t => t !== trimmed);
  if (updated.length === current.length) return current;
  localStorage.setItem(STORAGE_KEY_MEDICAL_TOKENS, JSON.stringify(updated));
  emitStorageChange('medical_tokens');
  return updated;
};

// Per-transaction one-off department overrides (by transaction id).
// Takes priority over both hardcoded tokens and user tokens.
export type TxDeptOverride = 'medical' | 'civil';

const sanitizeTxDeptOverrides = (raw: unknown): Record<string, TxDeptOverride> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, TxDeptOverride> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id !== 'string' || !id.trim()) continue;
    if (value === 'medical' || value === 'civil') {
      result[id] = value;
    }
  }
  return result;
};

export const getTransactionDeptOverrides = (): Record<string, TxDeptOverride> => {
  const stored = localStorage.getItem(STORAGE_KEY_TX_DEPT_OVERRIDES);
  if (!stored) return {};
  try {
    return sanitizeTxDeptOverrides(JSON.parse(stored));
  } catch {
    return {};
  }
};

export const setTransactionDeptOverride = (
  transactionId: string,
  department: TxDeptOverride
): Record<string, TxDeptOverride> => {
  if (!transactionId) return getTransactionDeptOverrides();
  const current = getTransactionDeptOverrides();
  if (current[transactionId] === department) return current;
  const updated = { ...current, [transactionId]: department };
  localStorage.setItem(STORAGE_KEY_TX_DEPT_OVERRIDES, JSON.stringify(updated));
  emitStorageChange('tx_dept_overrides');
  return updated;
};

export const removeTransactionDeptOverride = (
  transactionId: string
): Record<string, TxDeptOverride> => {
  const current = getTransactionDeptOverrides();
  if (!(transactionId in current)) return current;
  const { [transactionId]: _removed, ...rest } = current;
  localStorage.setItem(STORAGE_KEY_TX_DEPT_OVERRIDES, JSON.stringify(rest));
  emitStorageChange('tx_dept_overrides');
  return rest;
};

// --- Forecast: per-item overrides + monthly buffer ---
// Allows the user to fine-tune the year-end forecast.
//   - excluded: skip this bucket entirely from forecast projection
//   - monthlyAmount: replace the auto-computed monthly average

export type ForecastItemOverride = {
  excluded?: boolean;
  monthlyAmount?: number;
};

const sanitizeForecastOverrides = (raw: unknown): Record<string, ForecastItemOverride> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, ForecastItemOverride> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || !key.trim()) continue;
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<ForecastItemOverride>;
    const override: ForecastItemOverride = {};
    if (v.excluded === true) override.excluded = true;
    if (typeof v.monthlyAmount === 'number' && Number.isFinite(v.monthlyAmount) && v.monthlyAmount >= 0) {
      override.monthlyAmount = v.monthlyAmount;
    }
    if (Object.keys(override).length > 0) {
      result[key] = override;
    }
  }
  return result;
};

export const getForecastItemOverrides = (): Record<string, ForecastItemOverride> => {
  const stored = localStorage.getItem(STORAGE_KEY_FORECAST_OVERRIDES);
  if (!stored) return {};
  try {
    return sanitizeForecastOverrides(JSON.parse(stored));
  } catch {
    return {};
  }
};

export const setForecastItemOverride = (
  key: string,
  override: ForecastItemOverride,
): Record<string, ForecastItemOverride> => {
  if (!key.trim()) return getForecastItemOverrides();
  const current = getForecastItemOverrides();
  const next = { ...current, [key]: override };
  localStorage.setItem(STORAGE_KEY_FORECAST_OVERRIDES, JSON.stringify(next));
  emitStorageChange('forecast_item_overrides');
  return next;
};

export const removeForecastItemOverride = (key: string): Record<string, ForecastItemOverride> => {
  const current = getForecastItemOverrides();
  if (!(key in current)) return current;
  const { [key]: _removed, ...rest } = current;
  localStorage.setItem(STORAGE_KEY_FORECAST_OVERRIDES, JSON.stringify(rest));
  emitStorageChange('forecast_item_overrides');
  return rest;
};

export const getForecastMonthlyBuffer = (): number => {
  const stored = localStorage.getItem(STORAGE_KEY_FORECAST_BUFFER);
  if (stored === null) return FORECAST_BUFFER_DEFAULT;
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : FORECAST_BUFFER_DEFAULT;
};

export const setForecastMonthlyBuffer = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) return getForecastMonthlyBuffer();
  localStorage.setItem(STORAGE_KEY_FORECAST_BUFFER, String(value));
  emitStorageChange('forecast_monthly_buffer');
  return value;
};

// --- Auto-fill blacklist (descriptions to skip in next-month suggestions) ---

export const getUserAutoFillBlacklist = (): string[] => {
  const stored = localStorage.getItem(STORAGE_KEY_AUTOFILL_BLACKLIST);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map(item => item.trim());
  } catch {
    return [];
  }
};

export const addToAutoFillBlacklist = (item: string): string[] => {
  const trimmed = item.trim();
  if (!trimmed) return getUserAutoFillBlacklist();
  const current = getUserAutoFillBlacklist();
  if (current.includes(trimmed)) return current;
  const updated = [...current, trimmed];
  localStorage.setItem(STORAGE_KEY_AUTOFILL_BLACKLIST, JSON.stringify(updated));
  emitStorageChange('autofill_blacklist');
  return updated;
};

export const removeFromAutoFillBlacklist = (item: string): string[] => {
  const trimmed = item.trim();
  const current = getUserAutoFillBlacklist();
  const updated = current.filter(x => x !== trimmed);
  if (updated.length === current.length) return current;
  localStorage.setItem(STORAGE_KEY_AUTOFILL_BLACKLIST, JSON.stringify(updated));
  emitStorageChange('autofill_blacklist');
  return updated;
};

// --- Backup Logic ---

export const exportBackupJSON = (transactions: Transaction[]) => {
    const data = {
        timestamp: new Date().toISOString(),
        transactions,
        clients: getClients(),
        customCategories: getCustomCategories(),
        initialBalance: getInitialBalance(),
        loanOverrides: getLoanOverrides(),
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