import type { Transaction } from '../types';
import { formatDateKey, parseDateKey } from './date';

export interface EndOfMonthInput {
  transactions: Transaction[];
  startDate: Date;
  endDate: Date;
  openingBalance: number;
}

export type CashflowRow = {
  date: string;
  salary?: number | string | null;
  otherIncome?: number | string | null;
  loans?: number | string | null;
  withdrawals?: number | string | null;
  expenses?: number | string | null;
  taxes?: number | string | null;
  bankAdjustments?: number | string | null;
  dailyTotal?: number;
  balance?: number;
  monthlyTotal?: number;
};

export type NormalizedCashflowRow = {
  salary: number;
  otherIncome: number;
  loans: number;
  withdrawals: number;
  expenses: number;
  taxes: number;
  bankAdjustments: number;
};

export const normalize = (
  value: number | string | null | undefined
): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeRow = (row: CashflowRow): NormalizedCashflowRow => {
  const salary = Math.max(0, normalize(row.salary));
  const otherIncome = Math.max(0, normalize(row.otherIncome));
  const loans = -Math.abs(normalize(row.loans));
  const withdrawals = -Math.abs(normalize(row.withdrawals));
  const expenses = -Math.abs(normalize(row.expenses));
  const taxes = -Math.abs(normalize(row.taxes));
  const bankAdjustments = normalize(row.bankAdjustments);

  return {
    salary,
    otherIncome,
    loans,
    withdrawals,
    expenses,
    taxes,
    bankAdjustments,
  };
};

export const calculateDailyBalance = (row: CashflowRow): number => {
  const normalized = normalizeRow(row);
  return (
    normalized.salary +
    normalized.otherIncome +
    normalized.loans +
    normalized.withdrawals +
    normalized.expenses +
    normalized.taxes +
    normalized.bankAdjustments
  );
};

export const calculateMonthlyTotals = (
  rows: CashflowRow[],
  openingBalance = 0
): CashflowRow[] => {
  const parsed = rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentBalance = openingBalance;

  for (const row of parsed) {
    const dailyBalance = calculateDailyBalance(row);
    currentBalance += dailyBalance;
    row.dailyTotal = dailyBalance;
    row.balance = currentBalance;
    row.monthlyTotal = currentBalance;
  }

  return parsed;
};

export const addTotals = (
  rows: CashflowRow[],
  openingBalance = 0
): CashflowRow[] => calculateMonthlyTotals(rows, openingBalance);

const buildRowsForRange = (start: Date, end: Date): CashflowRow[] => {
  const rows: CashflowRow[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    rows.push({
      date: formatDateKey(cursor),
      salary: 0,
      otherIncome: 0,
      loans: 0,
      withdrawals: 0,
      expenses: 0,
      taxes: 0,
      bankAdjustments: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
};

const applyTransactionToRow = (row: CashflowRow, transaction: Transaction) => {
  const rawAmount = Number(transaction.amount) || 0;
  const absoluteAmount = Math.abs(rawAmount);
  switch (transaction.group) {
    case 'fee':
      row.salary = (Number(row.salary) || 0) + absoluteAmount;
      break;
    case 'other_income':
      row.otherIncome = (Number(row.otherIncome) || 0) + absoluteAmount;
      break;
    case 'loan':
      row.loans = (Number(row.loans) || 0) + absoluteAmount;
      break;
    case 'personal':
      row.withdrawals = (Number(row.withdrawals) || 0) + absoluteAmount;
      break;
    case 'operational':
      row.expenses = (Number(row.expenses) || 0) + absoluteAmount;
      break;
    case 'tax':
      row.taxes = (Number(row.taxes) || 0) + absoluteAmount;
      break;
    case 'bank_adjustment':
      row.bankAdjustments = (Number(row.bankAdjustments) || 0) + rawAmount;
      break;
    default:
      break;
  }
};

export const buildLedgerMapForRange = ({
  transactions,
  startDate,
  endDate,
  openingBalance,
}: EndOfMonthInput): Map<string, CashflowRow> => {
  let effectiveStart = new Date(startDate);
  let effectiveEnd = new Date(endDate);

  const normalizedTransactions = transactions.map(transaction => ({
    ...transaction,
    date: formatDateKey(parseDateKey(transaction.date)),
  }));

  if (normalizedTransactions.length) {
    const sortedDates = normalizedTransactions
      .map(t => parseDateKey(t.date))
      .sort((a, b) => a.getTime() - b.getTime());
    effectiveStart = new Date(
      Math.min(effectiveStart.getTime(), sortedDates[0].getTime())
    );
    effectiveEnd = new Date(
      Math.max(
        effectiveEnd.getTime(),
        sortedDates[sortedDates.length - 1].getTime()
      )
    );
  }

  const rows = buildRowsForRange(effectiveStart, effectiveEnd);
  const rowMap = new Map<string, CashflowRow>();
  rows.forEach(row => {
    rowMap.set(row.date, row);
  });

  normalizedTransactions.forEach(transaction => {
    const row = rowMap.get(transaction.date);
    if (!row) {
      return;
    }
    applyTransactionToRow(row, transaction);
  });

  const enrichedRows = addTotals(rows, openingBalance);
  return new Map(enrichedRows.map(row => [row.date, row]));
};

export const calculateLedgerEndBalance = (input: EndOfMonthInput): number => {
  const ledgerMap = buildLedgerMapForRange(input);
  const endRow = ledgerMap.get(formatDateKey(input.endDate));
  return endRow?.balance ?? input.openingBalance;
};

