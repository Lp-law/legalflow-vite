import type { Transaction } from '../types';
import type { ForecastItemOverride } from '../services/storageService';
import { parseDateKey } from './date';
import { normalizeForBucketKey } from './nextMonthAutoFill';

// Stable bucket key based on category (or description fallback) + group.
// Identical to what computeYearEndForecast uses internally so the modal
// can address overrides by the same key.
export const buildForecastBucketKey = (
  category: string,
  description: string,
  group: string,
): string => {
  const cat = (category || '').trim();
  const desc = (description || '').trim();
  if (cat) return `cat:${normalizeForBucketKey(cat)}|${group}`;
  return `desc:${normalizeForBucketKey(desc)}|${group}`;
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

  // Operational + personal expenses
  operationalExpensesYTDActual: number; // all operational+personal that already happened
  fixedExpensesYTDTotal: number; // only fixed (appears in >=50% of closed months)
  fixedExpenseBreakdown: Array<{
    bucketKey: string;
    description: string;
    total: number;
    monthsAppeared: number;
    avgPerMonth: number; // raw computed avg
    effectiveMonthlyAmount: number; // after override applied (used for projection)
    isExcluded: boolean;
    isAmountOverridden: boolean;
  }>;
  excludedOneTimeDescriptions: Array<{ description: string; total: number; monthsAppeared: number }>;
  excludedOneTimeAmount: number;
  avgFixedMonthlyExpense: number; // sum of all effective monthly amounts
  fixedExpensesRemainingForecast: number;
  monthlyBufferAmount: number;
  bufferRemainingForecast: number;
  effectiveMonthlyExpense: number; // single number used per remaining month
  isManualMonthlyTotalUsed: boolean;
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

  // Monthly verification breakdown for closed months
  monthlyBreakdown: Array<{
    monthKey: string;     // YYYY-MM
    monthLabel: string;   // Hebrew month name + year
    netIncome: number;    // fee/1.18 + other_income
    operationalExpenses: number; // group=operational only
    completedTransactionCount: number;
  }>;
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
  itemOverrides: Record<string, ForecastItemOverride> = {},
  monthlyBuffer: number = 0,
  manualMonthlyTotal: number | null = null,
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

  // Build YTD and remaining buckets.
  // For past closed months we include ALL transactions (completed + pending)
  // so the YTD numbers match what the cashflow grid footer shows. Any
  // pending entry in a closed month represents a committed obligation
  // for that month that the user simply hasn't toggled to "completed"
  // yet, and excluding it would understate the month's totals.
  const ytdCompleted: Transaction[] = [];
  const remainingAll: Transaction[] = [];

  transactions.forEach(t => {
    const d = parseDateKey(t.date);
    const ts = d.getTime();
    if (d < startOfYear || ts > endOfYearMs) return;
    if (ts <= endOfPrevMonthMs) {
      ytdCompleted.push(t);
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

  // ---- Operational expenses only (no personal withdrawals) ----
  const operationalYTD = ytdCompleted.filter(t => t.group === 'operational');
  const operationalExpensesYTDActual = operationalYTD.reduce(
    (s, t) => s + Math.abs(Number(t.amount) || 0),
    0,
  );

  // Identify fixed expenses: appear in >=50% of closed months.
  // Bucket primarily by CATEGORY (when set) so that e.g. "משכורות עובדים"
  // category collapses all per-employee/per-month variants into one
  // bucket. Fall back to description when category is empty.
  const fixedThreshold = Math.max(1, Math.ceil(closedMonthsCount * 0.5));
  type Bucket = { months: Set<string>; total: number; description: string };
  const expenseBuckets = new Map<string, Bucket>();
  operationalYTD.forEach(t => {
    const cat = (t.category || '').trim();
    const desc = (t.description || '').trim();
    const bucketKey = buildForecastBucketKey(cat, desc, t.group);
    const displayName = cat || desc || '(ללא תיאור)';
    const tDate = parseDateKey(t.date);
    const mk = monthKeyOf(tDate);
    const existing = expenseBuckets.get(bucketKey);
    const amount = Math.abs(Number(t.amount) || 0);
    if (existing) {
      existing.months.add(mk);
      existing.total += amount;
    } else {
      expenseBuckets.set(bucketKey, {
        months: new Set([mk]),
        total: amount,
        description: displayName,
      });
    }
  });

  let fixedExpensesYTDTotal = 0;
  let excludedOneTimeAmount = 0;
  let totalEffectiveMonthlyForFixed = 0;
  const fixedExpenseBreakdown: ForecastResult['fixedExpenseBreakdown'] = [];
  const excludedOneTimeDescriptions: Array<{ description: string; total: number; monthsAppeared: number }> = [];
  expenseBuckets.forEach((g, bucketKey) => {
    if (g.months.size >= fixedThreshold) {
      const override = itemOverrides[bucketKey];
      const isExcluded = Boolean(override?.excluded);
      const rawAvg = g.total / g.months.size;
      const isAmountOverridden = typeof override?.monthlyAmount === 'number';
      const effectiveMonthlyAmount = isExcluded
        ? 0
        : isAmountOverridden
          ? (override!.monthlyAmount as number)
          : rawAvg;
      fixedExpensesYTDTotal += g.total; // YTD reflects historical reality
      totalEffectiveMonthlyForFixed += effectiveMonthlyAmount;
      fixedExpenseBreakdown.push({
        bucketKey,
        description: g.description,
        total: g.total,
        monthsAppeared: g.months.size,
        avgPerMonth: rawAvg,
        effectiveMonthlyAmount,
        isExcluded,
        isAmountOverridden,
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

  // Effective avg = sum of effective monthly amounts (after overrides applied)
  const avgFixedMonthlyExpense = totalEffectiveMonthlyForFixed;
  const monthlyBufferAmount = Number.isFinite(monthlyBuffer) && monthlyBuffer > 0 ? monthlyBuffer : 0;

  // If user provided a manual monthly total, use it directly (overrides
  // both detected sum and buffer). Otherwise use detected + buffer.
  const useManualTotal =
    typeof manualMonthlyTotal === 'number' && Number.isFinite(manualMonthlyTotal) && manualMonthlyTotal >= 0;
  const effectiveMonthlyExpense = useManualTotal
    ? manualMonthlyTotal!
    : avgFixedMonthlyExpense + monthlyBufferAmount;
  const fixedExpensesRemainingForecast = useManualTotal ? 0 : avgFixedMonthlyExpense * remainingMonthsCount;
  const bufferRemainingForecast = useManualTotal ? 0 : monthlyBufferAmount * remainingMonthsCount;
  const remainingTotalForecast = effectiveMonthlyExpense * remainingMonthsCount;
  const operationalExpensesTotal = operationalExpensesYTDActual + remainingTotalForecast;

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

  // ---- Personal withdrawals: NOT subtracted ----
  // The user views personal withdrawals (incl. alimony) as a USE of
  // profit, not an expense that reduces profit. They stay outside the
  // forecast calculation entirely. Kept as zeros for type compatibility.
  const withdrawalsYTDActual = 0;
  const withdrawalsRemainingForecast = 0;
  const totalWithdrawals = 0;

  const netCashFlowEoY = profitAfterTax - totalLoans - totalWithdrawals;
  // (totalWithdrawals = personal-group spending, kept separate from F1 operational)

  // ---- Monthly breakdown for closed months (verification table) ----
  const monthlyBreakdown: ForecastResult['monthlyBreakdown'] = [];
  for (let m = 0; m < closedMonthsCount; m += 1) {
    const monthDate = new Date(year, m, 1);
    const mk = monthKeyOf(monthDate);
    const monthLabel = monthDate.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    let netIncome = 0;
    let opExpenses = 0;
    let txCount = 0;
    ytdCompleted.forEach(t => {
      const tDate = parseDateKey(t.date);
      if (monthKeyOf(tDate) !== mk) return;
      txCount += 1;
      const abs = Math.abs(Number(t.amount) || 0);
      if (t.group === 'fee') netIncome += abs / 1.18;
      else if (t.group === 'other_income') netIncome += abs;
      else if (t.group === 'operational') opExpenses += abs;
    });
    monthlyBreakdown.push({
      monthKey: mk,
      monthLabel,
      netIncome,
      operationalExpenses: opExpenses,
      completedTransactionCount: txCount,
    });
  }

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
    monthlyBufferAmount,
    bufferRemainingForecast,
    effectiveMonthlyExpense,
    isManualMonthlyTotalUsed: useManualTotal,
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
    monthlyBreakdown,
  };
};
