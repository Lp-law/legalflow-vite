/**
 * One-off merge/clean script for LegalFlow backup JSON files.
 * It reconciles desktop (source-of-truth) and mobile backups into a single
 * canonical file that can be re-imported everywhere.
 *
 * Usage:
 *   npm run merge:backups
 * The merged file is written to backups/backup_merged_legalflow.json.
 */

import { promises as fs } from 'fs';
import path from 'path';

type Transaction = {
  id: string;
  date?: string;
  clientReference?: string | null;
  [key: string]: unknown;
};

type CustomCategory = {
  id?: string;
  name?: string;
  [key: string]: unknown;
};

type LoanOverrides = Record<string, number>;

interface BackupFile {
  timestamp?: string;
  transactions?: Transaction[];
  clients?: string[];
  customCategories?: CustomCategory[];
  initialBalance?: number;
  loanOverrides?: LoanOverrides;
}

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const DESKTOP_FILE = path.join(BACKUP_DIR, 'backup_desktop.json');
const MOBILE_FILE = path.join(BACKUP_DIR, 'backup_mobile.json');
const MERGED_FILE = path.join(BACKUP_DIR, 'backup_merged_legalflow.json');
const BANK_ADJUSTMENT_ID = '29e63760-0ff4-4923-b39f-084d7aeab6c7';

const readBackup = async (filePath: string): Promise<BackupFile> => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const normalizeClientReference = (
  ...refs: Array<string | null | undefined>
): string => {
  for (const ref of refs) {
    if (typeof ref === 'string' && ref.trim().length > 0) {
      return ref;
    }
  }
  return '';
};

const duplicateTransaction = (tx: Transaction): Transaction => ({
  ...tx,
});

const resolveTransaction = (
  desktopTx?: Transaction,
  mobileTx?: Transaction
): Transaction => {
  const source = desktopTx ?? mobileTx;
  if (!source) {
    throw new Error('Attempted to resolve transaction without any source');
  }

  const base: Transaction = duplicateTransaction(source);
  base.clientReference = normalizeClientReference(
    desktopTx?.clientReference,
    mobileTx?.clientReference
  );
  return base;
};

const mergeTransactions = (
  desktopTxs: Transaction[] = [],
  mobileTxs: Transaction[] = []
): Transaction[] => {
  const desktopById = new Map(desktopTxs.map(tx => [tx.id, tx]));
  const mobileById = new Map(mobileTxs.map(tx => [tx.id, tx]));
  const allIds = new Set<string>([
    ...desktopById.keys(),
    ...mobileById.keys(),
  ]);

  const merged: Transaction[] = [];

  allIds.forEach(id => {
    const desktopTx = desktopById.get(id);
    const mobileTx = mobileById.get(id);

    if (id === BANK_ADJUSTMENT_ID && desktopTx) {
      merged.push(resolveTransaction(desktopTx, mobileTx));
      return;
    }

    if (desktopTx && mobileTx) {
      merged.push(resolveTransaction(desktopTx, mobileTx));
      return;
    }

    if (desktopTx) {
      merged.push(resolveTransaction(desktopTx));
      return;
    }

    if (mobileTx) {
      merged.push(resolveTransaction(mobileTx));
    }
  });

  merged.sort((a, b) => {
    const dateA = (a.date ?? '').localeCompare(b.date ?? '');
    if (dateA !== 0) return dateA;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });

  return merged;
};

const arraysEqual = (a: string[] = [], b: string[] = []): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const mergeStringLists = (
  desktop: string[] = [],
  mobile: string[] = []
): string[] => {
  if (arraysEqual(desktop, mobile)) {
    return desktop;
  }
  const set = new Set<string>([...desktop, ...mobile]);
  return Array.from(set).sort((x, y) => x.localeCompare(y, 'he'));
};

const categoryKey = (category?: CustomCategory): string => {
  if (!category) {
    return Math.random().toString(36).slice(2);
  }
  if (category.id) {
    return String(category.id);
  }
  return JSON.stringify(category);
};

const mergeCustomCategories = (
  desktop: CustomCategory[] = [],
  mobile: CustomCategory[] = []
): CustomCategory[] => {
  if (desktop.length === 0 && mobile.length === 0) {
    return [];
  }

  const map = new Map<string, CustomCategory>();
  mobile.forEach(cat => {
    map.set(categoryKey(cat), cat);
  });
  desktop.forEach(cat => {
    map.set(categoryKey(cat), cat);
  });
  return Array.from(map.values());
};

const mergeLoanOverrides = (
  desktop: LoanOverrides = {},
  mobile: LoanOverrides = {}
): LoanOverrides => ({
  ...mobile,
  ...desktop,
});

const main = async () => {
  const [desktopBackup, mobileBackup] = await Promise.all([
    readBackup(DESKTOP_FILE),
    readBackup(MOBILE_FILE),
  ]);

  const mergedTransactions = mergeTransactions(
    desktopBackup.transactions,
    mobileBackup.transactions
  );

  const mergedClients = mergeStringLists(
    desktopBackup.clients,
    mobileBackup.clients
  );

  const mergedCategories = mergeCustomCategories(
    desktopBackup.customCategories,
    mobileBackup.customCategories
  );

  const mergedLoanOverrides = mergeLoanOverrides(
    desktopBackup.loanOverrides,
    mobileBackup.loanOverrides
  );

  const mergedBackup: BackupFile = {
    timestamp: new Date().toISOString(),
    transactions: mergedTransactions,
    clients: mergedClients,
    customCategories: mergedCategories,
    initialBalance: desktopBackup.initialBalance,
    loanOverrides: mergedLoanOverrides,
  };

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.writeFile(MERGED_FILE, JSON.stringify(mergedBackup, null, 2), 'utf8');

  console.log(
    `✅ backup_merged_legalflow.json created with ${mergedTransactions.length} transactions.`
  );
};

main().catch(error => {
  console.error('Failed to merge backups:', error);
  process.exit(1);
});

