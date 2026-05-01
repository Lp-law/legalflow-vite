import type { Transaction } from '../types';
import { parseDateKey } from './date';
import { normalizeForBucketKey } from './nextMonthAutoFill';

// Items reclassified as "personal withdrawals" - excluded from F1
// (operating expenses) and subtracted instead in F3 (net cash flow).
// Default seed; user can extend or remove via the modal.
export const DEFAULT_PERSONAL_WITHDRAWAL_TOKENS: string[] = [
  'מזונות',
];

const matchesWithdrawalToken = (
  description: string,
  category: string,
  tokens: string[],
): boolean => {
  const haystack = `${normalizeForBucketKey(description)} ${normalizeForBucketKey(category)}`;
  return tokens.some(t => {
    const normalized = normalizeForBucketKey(t);
    return normalized.length > 0 && haystack.includes(normalized);
  });
};

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
  fixedExpenseBreakdown: Array<{ description: string; total: number; monthsAppeared: number; avgPerMonth: number }>;
  excludedOneTimeDescriptions: Array<{ description: string; total: number; monthsAppeared: number }>;
  excludedOneTimeAmount: number;
  avgFixedMonthlyExpense: number;
  fixedExpensesRemainingForecast: number;
  operationalExpensesTotal: number;

  // Forecast 1 result
  operatingProfit: number;

  // Tax advances (income tax only, not VAT)
  taxAdvancesYTDActual: number;
  taxAdvancesRemainingForecast: number;
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

// Income tax advance recognition - lenient match by category OR description
// to catch user-edited categories like "מס הכנסה" / "מקדמת מס" / etc.
const isIncomeTaxAdvance = (t: Transaction): boolean => {
  if (t.group !== 'tax') return false;
  const cat = t.category || '';
  if (cat.includes('מס הכנסה') || cat.includes('מקדמ')) return true;
  const desc = t.description || '';
  if (desc.includes('מקדמות מס') || desc.includes('מקדמת מס')) return true;
  // Anything else in tax group that is NOT VAT counts as income tax
  if (!cat.includes('מע"מ') && !cat.includes('מעמ') && !desc.includes('מע"מ')) return true;
  return false;
};

const PROJECTED_TAX_RATE = 0.14;

export const computeYearEndForecast = (
  transactions: Transaction[],
  today: Date = new Date(),
  userWithdrawalTokens: string[] = [],
): ForecastResult => {
  const allWithdrawalTokens = [...DEFAULT_PERSONAL_WITHDRAWAL_TOKENS, ...userWithdrawalTokens];
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

  // ---- Recurring business expenses for F1 ----
  // Includes operational AND personal-group items, EXCEPT items that the
  // user reclassified as "personal withdrawals" (which go to F3).
  const operationalYTD = ytdCompleted.filter(t => {
    if (t.group === 'operational') return true;
    if (t.group === 'personal') {
      return !matchesWithdrawalToken(t.description || '', t.category || '', allWithdrawalTokens);
    }
    return false;
  });
  const operationalExpensesYTDActual = operationalYTD.reduce(
    (s, t) => s + Math.abs(Number(t.amount) || 0),
    0,
  );

  // Identify fixed expenses: appear in >=50% of closed months.
  // Use the same aggressive normalization as auto-fill so that variants
  // like "משכורות עובדים - ינואר" / "משכורות עובדים - פברואר" merge.
  const fixedThreshold = Math.max(1, Math.ceil(closedMonthsCount * 0.5));
  type Group = { months: Set<string>; total: number; description: string };
  const expenseBuckets = new Map<string, Group>();
  operationalYTD.forEach(t => {
    const descKey = normalizeForBucketKey(t.description || '');
    const catKey = normalizeForBucketKey(t.category || '');
    const k = `${descKey}|${catKey}`;
    const tDate = parseDateKey(t.date);
    const mk = monthKeyOf(tDate);
    const existing = expenseBuckets.get(k);
    const amount = Math.abs(Number(t.amount) || 0);
    const displayDesc = (t.description || '').trim() || (t.category || '').trim() || '(ללא תיאור)';
    if (existing) {
      existing.months.add(mk);
      existing.total += amount;
    } else {
      expenseBuckets.set(k, {
        months: new Set([mk]),
        total: amount,
        description: displayDesc,
      });
    }
  });

  let fixedExpensesYTDTotal = 0;
  let excludedOneTimeAmount = 0;
  const fixedExpenseBreakdown: Array<{ description: string; total: number; monthsAppeared: number; avgPerMonth: number }> = [];
  const excludedOneTimeDescriptions: Array<{ description: string; total: number; monthsAppeared: number }> = [];
  expenseBuckets.forEach(g => {
    if (g.months.size >= fixedThreshold) {
      fixedExpensesYTDTotal += g.total;
      fixedExpenseBreakdown.push({
        description: g.description,
        total: g.total,
        monthsAppeared: g.months.size,
        avgPerMonth: g.total / g.months.size,
      });
    } else {
      excludedOneTimeAmount += g.total;
      excludedOneTimeDescriptions.push({
        description: g.description,
        total: g.total,
        monthsAppeared: g.months.size,
      });
    }
  });
  fixedExpenseBreakdown.sort((a, b) => b.total - a.total);
  excludedOneTimeDescriptions.sort((a, b) => b.total - a.total);

  const avgFixedMonthlyExpense =
    closedMonthsCount > 0 ? fixedExpensesYTDTotal / closedMonthsCount : 0;
  const fixedExpensesRemainingForecast = avgFixedMonthlyExpense * remainingMonthsCount;
  const operationalExpensesTotal =
    operationalExpensesYTDActual + fixedExpensesRemainingForecast;

  // ---- Forecast 1 ----
  const operatingProfit = incomeTotal - operationalExpensesTotal;

  // ---- Income tax advances ----
  // YTD: include ANY tax record (any status) in the closed months. This
  // catches both completed and still-pending past advances.
  const taxAdvancesYTDActual = transactions
    .filter(t => {
      const d = parseDateKey(t.date);
      return d >= startOfYear && d.getTime() <= endOfPrevMonthMs && isIncomeTaxAdvance(t);
    })
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  // Remaining: project as 14% × projected NET monthly income × remaining months.
  // This is the right approach because syncTaxTransactions only auto-creates tax
  // records for months that ALREADY have income; future months without income yet
  // would otherwise show zero tax, dragging the forecast down.
  const taxAdvancesRemainingForecast =
    avgMonthlyIncome * PROJECTED_TAX_RATE * remainingMonthsCount;

  const totalTaxAdvances = taxAdvancesYTDActual + taxAdvancesRemainingForecast;
  const profitAfterTax = operatingProfit - totalTaxAdvances;

  // ---- Loans ----
  const loansYTDActual = ytdCompleted
    .filter(t => t.group === 'loan')
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const avgMonthlyLoans = closedMonthsCount > 0 ? loansYTDActual / closedMonthsCount : 0;
  const loansRemainingForecast = avgMonthlyLoans * remainingMonthsCount;
  const totalLoans = loansYTDActual + loansRemainingForecast;

  // ---- Personal withdrawals (only items reclassified by user) ----
  // Default: "מזונות" - user can extend via the modal.
  const withdrawalsYTDActual = ytdCompleted
    .filter(
      t =>
        t.group === 'personal' &&
        matchesWithdrawalToken(t.description || '', t.category || '', allWithdrawalTokens),
    )
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
    fixedExpenseBreakdown,
    excludedOneTimeDescriptions,
    excludedOneTimeAmount,
    avgFixedMonthlyExpense,
    fixedExpensesRemainingForecast,
    operationalExpensesTotal,
    operatingProfit,
    taxAdvancesYTDActual,
    taxAdvancesRemainingForecast,
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
