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

