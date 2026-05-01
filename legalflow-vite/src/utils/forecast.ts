import type { Transaction } from '../types';
import { parseDateKey } from './date';

export type ForecastResult = {
  asOfDate: Date;
  year: number;
  closedMonthsCount: number;
  remainingMonthsCount: number;

  // Income (NET, both fee + other_income)
  incomeYTDActual: number;
  avgMonthlyIncome: number;
  incomeRemainingForecast: number;
  incomeTotal: number;

  // Operational expenses
  operationalExpensesYTDActual: number; // all operational that already happened
  fixedExpensesYTDTotal: number; // only fixed (appears in >=50% of closed months)
  fixedExpenseDescriptions: string[];
  excludedOneTimeAmount: number;
  avgFixedMonthlyExpense: number;
  fixedExpensesRemainingForecast: number;
  operationalExpensesTotal: number;

  // Forecast 1 result
  operatingProfit: number;

  // Tax advances (income tax only, not VAT)
  taxAdvancesYTDActual: number;
  taxAdvancesRemainingPending: number;
  totalTaxAdvances: number;

  // Forecast 2 result
  profitAfterTax: number;

  // Loans (linear projection from YTD average)
  loansYTDActual: number;
  loansRemainingForecast: number;
  totalLoans: number;

  // Withdrawals (linear projection from YTD average)
  withdrawalsYTDActual: number;
  withdrawalsRemainingForecast: number;
  totalWithdrawals: number;

  // Forecast 3 result
  netCashFlowEoY: number;
};

const monthKeyOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const isIncomeTaxAdvance = (t: Transaction): boolean =>
  t.group === 'tax' && t.category === 'מס הכנסה אישי';

export const computeYearEndForecast = (
  transactions: Transaction[],
  today: Date = new Date(),
): ForecastResult => {
  const year = today.getFullYear();
  const currentMonthIndex = today.getMonth(); // 0..11
  const startOfYear = new Date(year, 0, 1);
  const endOfPrevMonthMs = new Date(year, currentMonthIndex, 0, 23, 59, 59).getTime();
  const startOfCurrentMonth = new Date(year, currentMonthIndex, 1).getTime();
  const endOfYearMs = new Date(year, 11, 31, 23, 59, 59).getTime();

  // Closed months = months that have ended before this calendar month
  // (if today is May, closed = Jan/Feb/Mar/Apr = 4)
  const closedMonthsCount = currentMonthIndex;
  const remainingMonthsCount = 12 - closedMonthsCount;

  // Build YTD-completed and remaining buckets
  const ytdCompleted: Transaction[] = [];
  const remainingAll: Transaction[] = [];

  transactions.forEach(t => {
    const d = parseDateKey(t.date);
    const ts = d.getTime();
    if (d < startOfYear || ts > endOfYearMs) return;
    if (ts <= endOfPrevMonthMs) {
      if (t.status === 'completed') ytdCompleted.push(t);
    } else if (ts >= startOfCurrentMonth) {
      remainingAll.push(t);
    }
  });

  // ---- Income (NET) ----
  let incomeYTDActual = 0;
  ytdCompleted.forEach(t => {
    const abs = Math.abs(Number(t.amount) || 0);
    if (t.group === 'fee') incomeYTDActual += abs / 1.18;
    else if (t.group === 'other_income') incomeYTDActual += abs;
  });
  const avgMonthlyIncome =
    closedMonthsCount > 0 ? incomeYTDActual / closedMonthsCount : 0;
  const incomeRemainingForecast = avgMonthlyIncome * remainingMonthsCount;
  const incomeTotal = incomeYTDActual + incomeRemainingForecast;

  // ---- Operational expenses ----
  const operationalYTD = ytdCompleted.filter(t => t.group === 'operational');
  const operationalExpensesYTDActual = operationalYTD.reduce(
    (s, t) => s + Math.abs(Number(t.amount) || 0),
    0,
  );

  // Identify fixed expenses: appear in >=50% of closed months
  const fixedThreshold = Math.max(1, Math.ceil(closedMonthsCount * 0.5));
  type Group = { months: Set<string>; total: number; description: string };
  const expenseBuckets = new Map<string, Group>();
  operationalYTD.forEach(t => {
    const desc = (t.description || '').trim();
    const cat = (t.category || '').trim();
    const k = `${desc}|${cat}`;
    const tDate = parseDateKey(t.date);
    const mk = monthKeyOf(tDate);
    const existing = expenseBuckets.get(k);
    const amount = Math.abs(Number(t.amount) || 0);
    if (existing) {
      existing.months.add(mk);
      existing.total += amount;
    } else {
      expenseBuckets.set(k, {
        months: new Set([mk]),
        total: amount,
        description: desc || cat || '(ללא תיאור)',
      });
    }
  });

  let fixedExpensesYTDTotal = 0;
  let excludedOneTimeAmount = 0;
  const fixedExpenseDescriptions: string[] = [];
  expenseBuckets.forEach(g => {
    if (g.months.size >= fixedThreshold) {
      fixedExpensesYTDTotal += g.total;
      fixedExpenseDescriptions.push(g.description);
    } else {
      excludedOneTimeAmount += g.total;
    }
  });
  fixedExpenseDescriptions.sort();

  const avgFixedMonthlyExpense =
    closedMonthsCount > 0 ? fixedExpensesYTDTotal / closedMonthsCount : 0;
  const fixedExpensesRemainingForecast = avgFixedMonthlyExpense * remainingMonthsCount;
  const operationalExpensesTotal =
    operationalExpensesYTDActual + fixedExpensesRemainingForecast;

  // ---- Forecast 1 ----
  const operatingProfit = incomeTotal - operationalExpensesTotal;

  // ---- Income tax advances ----
  const taxAdvancesYTDActual = ytdCompleted
    .filter(isIncomeTaxAdvance)
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  // Remaining: pending OR completed in remaining months
  const taxAdvancesRemainingPending = remainingAll
    .filter(isIncomeTaxAdvance)
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  const totalTaxAdvances = taxAdvancesYTDActual + taxAdvancesRemainingPending;
  const profitAfterTax = operatingProfit - totalTaxAdvances;

  // ---- Loans ----
  const loansYTDActual = ytdCompleted
    .filter(t => t.group === 'loan')
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const avgMonthlyLoans = closedMonthsCount > 0 ? loansYTDActual / closedMonthsCount : 0;
  const loansRemainingForecast = avgMonthlyLoans * remainingMonthsCount;
  const totalLoans = loansYTDActual + loansRemainingForecast;

  // ---- Personal withdrawals ----
  const withdrawalsYTDActual = ytdCompleted
    .filter(t => t.group === 'personal')
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const avgMonthlyWithdrawals =
    closedMonthsCount > 0 ? withdrawalsYTDActual / closedMonthsCount : 0;
  const withdrawalsRemainingForecast =
    avgMonthlyWithdrawals * remainingMonthsCount;
  const totalWithdrawals = withdrawalsYTDActual + withdrawalsRemainingForecast;

  const netCashFlowEoY = profitAfterTax - totalLoans - totalWithdrawals;

  return {
    asOfDate: today,
    year,
    closedMonthsCount,
    remainingMonthsCount,
    incomeYTDActual,
    avgMonthlyIncome,
    incomeRemainingForecast,
    incomeTotal,
    operationalExpensesYTDActual,
    fixedExpensesYTDTotal,
    fixedExpenseDescriptions,
    excludedOneTimeAmount,
    avgFixedMonthlyExpense,
    fixedExpensesRemainingForecast,
    operationalExpensesTotal,
    operatingProfit,
    taxAdvancesYTDActual,
    taxAdvancesRemainingPending,
    totalTaxAdvances,
    profitAfterTax,
    loansYTDActual,
    loansRemainingForecast,
    totalLoans,
    withdrawalsYTDActual,
    withdrawalsRemainingForecast,
    totalWithdrawals,
    netCashFlowEoY,
  };
};
