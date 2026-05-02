import type { Transaction } from '../types';
import { computeYearEndForecast } from '../utils/forecast';
import {
  getForecastItemOverrides,
  getForecastMonthlyBuffer,
  getForecastManualMonthlyTotal,
  type ForecastItemOverride,
} from './storageService';

// 2026 Israeli personal income tax brackets (annual taxable income).
// Source: user-supplied 2026 brackets. Each entry covers up to `upTo` (inclusive),
// or `Infinity` for the top bracket.
export const TAX_BRACKETS_2026 = [
  { upTo: 84_120, rate: 0.10 },
  { upTo: 120_720, rate: 0.14 },
  { upTo: 193_800, rate: 0.20 },
  { upTo: 269_280, rate: 0.31 },
  { upTo: 560_280, rate: 0.35 },
  { upTo: 721_560, rate: 0.47 },
  { upTo: Infinity, rate: 0.50 },
] as const;

// Minimum credit points every Israeli resident receives (2.25 base points).
// One point = ~250 ₪/month for 2026 (rounded from the 240–250 range; the
// user accepted ±10–15% accuracy on the forecast so this is good enough).
export const CREDIT_POINT_MONTHLY_VALUE = 250;
export const MIN_CREDIT_POINTS = 2.25;
export const ANNUAL_CREDIT_POINT_VALUE_DEFAULT =
  MIN_CREDIT_POINTS * CREDIT_POINT_MONTHLY_VALUE * 12; // = 6,750 ₪

// Default income-tax advance rate (14% of net fee income), matching the
// auto-sync rule used by syncTaxTransactions and by computeYearEndForecast.
export const INCOME_TAX_ADVANCE_RATE = 0.14;

// Income-tax-advance categories. Anything in the 'tax' group whose category
// matches one of these is treated as an advance against the annual income tax.
// (VAT is excluded — it's a separate tax that doesn't offset income tax.)
const INCOME_TAX_ADVANCE_PATTERNS = ['מס הכנסה', 'מקדמת מס', 'מקדמות מס'];

export const isIncomeTaxAdvance = (transaction: Transaction): boolean => {
  if (transaction.group !== 'tax') return false;
  const category = transaction.category || '';
  const description = transaction.description || '';
  return INCOME_TAX_ADVANCE_PATTERNS.some(
    (pattern) => category.includes(pattern) || description.includes(pattern)
  );
};

// Deductible expense = anything that reduces taxable income for an
// independent professional (עוסק מורשה). Per the user's brief:
//   include: operational ('operational' group)
//   exclude: loans ('loan'), personal/withdrawals/alimony ('personal'),
//            taxes themselves ('tax'), bank adjustments ('bank_adjustment').
// Other-income ('other_income') has no expense rows.
export const isDeductibleExpense = (t: Transaction): boolean => {
  if (t.type !== 'expense') return false;
  return t.group === 'operational';
};

export interface TaxBracketBreakdown {
  rate: number;
  upTo: number;
  taxableInBracket: number;
  taxInBracket: number;
}

export const calculateAnnualTax = (
  taxableIncome: number,
  brackets: ReadonlyArray<{ upTo: number; rate: number }> = TAX_BRACKETS_2026
): { totalTax: number; breakdown: TaxBracketBreakdown[] } => {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) {
    return { totalTax: 0, breakdown: [] };
  }
  let remaining = taxableIncome;
  let lowerBound = 0;
  let totalTax = 0;
  const breakdown: TaxBracketBreakdown[] = [];

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const bracketWidth = bracket.upTo - lowerBound;
    const taxableInBracket = Math.min(remaining, bracketWidth);
    const taxInBracket = taxableInBracket * bracket.rate;
    totalTax += taxInBracket;
    breakdown.push({
      rate: bracket.rate,
      upTo: bracket.upTo,
      taxableInBracket,
      taxInBracket,
    });
    remaining -= taxableInBracket;
    lowerBound = bracket.upTo;
  }

  return { totalTax, breakdown };
};

export interface TaxForecastInput {
  transactions: Transaction[];
  referenceDate?: Date;
  annualCreditPointValue?: number;
  // Forecast tuning. Defaults are pulled from storageService so the tax
  // forecast automatically reflects whatever the user set in the regular
  // forecast modal (manual monthly total, per-bucket overrides, buffer).
  forecastItemOverrides?: Record<string, ForecastItemOverride>;
  forecastMonthlyBuffer?: number;
  forecastManualMonthlyTotal?: number | null;
}

export interface TaxForecastResult {
  year: number;
  // YTD actuals (from closed months: status irrelevant — see computeYearEndForecast).
  ytdIncome: number;                    // NET (gross / 1.18) - matches forecast
  ytdDeductibleExpenses: number;
  ytdAdvancesPaid: number;
  // Forecasted remaining-year amounts (driven by avg of closed months,
  // optionally overridden by the user's manual monthly expense total).
  remainingIncomeForecast: number;
  remainingExpensesForecast: number;
  remainingAdvancesForecast: number;
  // Full-year totals (YTD + remaining forecast).
  projectedAnnualIncome: number;
  projectedAnnualDeductibleExpenses: number;
  projectedAnnualAdvances: number;
  // Whether the user's manual monthly expense total is in use (informational).
  isManualMonthlyTotalUsed: boolean;
  // Tax math.
  taxableIncome: number;
  grossTax: number;
  bracketBreakdown: TaxBracketBreakdown[];
  creditPointsValue: number;
  netTaxOwed: number;
  balanceVsAdvances: number;            // positive = will still owe at year-end, negative = refund
  // Actionable: per-month adjustment to the advance for remaining months
  // (current month included, since its advance can usually still be modified).
  monthsRemainingForAdvance: number;
  monthlyAdvanceAdjustment: number;     // positive = increase, negative = decrease
  currentMonthlyAdvance: number;        // average of advances actually paid in closed months
  // Bookkeeping.
  closedMonthsCount: number;
  monthsRemaining: number;
  averageMonthlyIncome: number;
  averageMonthlyDeductibleExpenses: number;
}

const safeFromStorage = <T>(getter: () => T, fallback: T): T => {
  // computeYearEndForecast accepts plain values; in tests we may call
  // calculateTaxForecast outside of a browser context where localStorage
  // doesn't exist. Guard so tests don't have to mock window.localStorage.
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return fallback;
  }
  try {
    return getter();
  } catch {
    return fallback;
  }
};

export const calculateTaxForecast = ({
  transactions,
  referenceDate = new Date(),
  annualCreditPointValue = ANNUAL_CREDIT_POINT_VALUE_DEFAULT,
  forecastItemOverrides,
  forecastMonthlyBuffer,
  forecastManualMonthlyTotal,
}: TaxForecastInput): TaxForecastResult => {
  // Pull forecast tuning from storage when caller doesn't supply it. This
  // is what binds the tax forecast to whatever the user set in the regular
  // forecast modal — so as the user refines monthly buffer / per-bucket
  // overrides / manual monthly total, the tax forecast tracks them.
  const overrides =
    forecastItemOverrides ?? safeFromStorage(getForecastItemOverrides, {});
  const buffer = forecastMonthlyBuffer ?? safeFromStorage(getForecastMonthlyBuffer, 0);
  const manualTotal =
    forecastManualMonthlyTotal !== undefined
      ? forecastManualMonthlyTotal
      : safeFromStorage<number | null>(() => getForecastManualMonthlyTotal(), null);

  const f = computeYearEndForecast(
    transactions,
    referenceDate,
    overrides,
    buffer,
    manualTotal
  );

  // Use forecast outputs as the source of truth for income/expenses/advances.
  // f.incomeTotal already excludes VAT (fees / 1.18) and excludes other_income.
  // f.operationalExpensesTotal is operational only with manual override / buffer applied.
  // f.totalTaxAdvances = YTD advances (closed months) + 14% × avg income × remaining months.
  const projectedAnnualIncome = f.incomeTotal;
  const projectedAnnualDeductibleExpenses = f.operationalExpensesTotal;
  const projectedAnnualAdvances = f.totalTaxAdvances;

  const taxableIncome = Math.max(0, projectedAnnualIncome - projectedAnnualDeductibleExpenses);
  const { totalTax: grossTax, breakdown: bracketBreakdown } = calculateAnnualTax(taxableIncome);
  const creditPointsValue = Math.max(0, annualCreditPointValue);
  const netTaxOwed = Math.max(0, grossTax - creditPointsValue);
  const balanceVsAdvances = netTaxOwed - projectedAnnualAdvances;

  // Months in which the advance can still be adjusted: current month + future
  // (the current month's advance is paid on the 23rd of next month, so it
  // can usually still be modified by the time the user reads this).
  const monthsRemainingForAdvance = f.remainingMonthsCount;
  const monthlyAdvanceAdjustment =
    monthsRemainingForAdvance > 0 ? balanceVsAdvances / monthsRemainingForAdvance : 0;

  const currentMonthlyAdvance =
    f.closedMonthsCount > 0 ? f.taxAdvancesYTDActual / f.closedMonthsCount : 0;
  const averageMonthlyDeductibleExpenses =
    f.closedMonthsCount > 0 ? f.operationalExpensesYTDActual / f.closedMonthsCount : 0;

  return {
    year: f.year,
    ytdIncome: f.incomeYTDActual,
    ytdDeductibleExpenses: f.operationalExpensesYTDActual,
    ytdAdvancesPaid: f.taxAdvancesYTDActual,
    remainingIncomeForecast: f.incomeRemainingForecast,
    remainingExpensesForecast: f.operationalExpensesTotal - f.operationalExpensesYTDActual,
    remainingAdvancesForecast: f.taxAdvancesRemainingForecast,
    projectedAnnualIncome,
    projectedAnnualDeductibleExpenses,
    projectedAnnualAdvances,
    isManualMonthlyTotalUsed: f.isManualMonthlyTotalUsed,
    taxableIncome,
    grossTax,
    bracketBreakdown,
    creditPointsValue,
    netTaxOwed,
    balanceVsAdvances,
    monthsRemainingForAdvance,
    monthlyAdvanceAdjustment,
    currentMonthlyAdvance,
    closedMonthsCount: f.closedMonthsCount,
    monthsRemaining: f.remainingMonthsCount,
    averageMonthlyIncome: f.avgMonthlyIncome,
    averageMonthlyDeductibleExpenses,
  };
};
