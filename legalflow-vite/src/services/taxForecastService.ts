import type { Transaction } from '../types';
import { parseDateKey } from '../utils/date';

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
  year?: number;
  referenceDate?: Date;
  annualCreditPointValue?: number;
}

export interface TaxForecastResult {
  year: number;
  // YTD actuals (status === 'completed', within `year`).
  ytdIncome: number;
  ytdDeductibleExpenses: number;
  ytdAdvancesPaid: number;
  // Projected full-year totals (YTD + linear projection of remaining months).
  projectedAnnualIncome: number;
  projectedAnnualDeductibleExpenses: number;
  projectedAnnualAdvances: number;
  // Tax math.
  taxableIncome: number;
  grossTax: number;
  bracketBreakdown: TaxBracketBreakdown[];
  creditPointsValue: number;
  netTaxOwed: number;
  balanceVsAdvances: number; // positive = need to pay more, negative = refund
  // Actionable: what monthly advance the user *should* be paying to break even
  // by year-end, vs what they're paying now (average from YTD advances).
  recommendedMonthlyAdvance: number;
  currentMonthlyAdvance: number;
  monthlyAdvanceDelta: number; // positive = under-paying, negative = over-paying
  // Bookkeeping.
  closedMonthsCount: number;
  monthsRemaining: number;
  averageMonthlyIncome: number;
  averageMonthlyDeductibleExpenses: number;
}

const isInYear = (dateStr: string, year: number) => {
  const d = parseDateKey(dateStr);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
};

const getMonth = (dateStr: string) => {
  const d = parseDateKey(dateStr);
  return Number.isNaN(d.getTime()) ? -1 : d.getMonth(); // 0-11
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

export const calculateTaxForecast = ({
  transactions,
  year,
  referenceDate = new Date(),
  annualCreditPointValue = ANNUAL_CREDIT_POINT_VALUE_DEFAULT,
}: TaxForecastInput): TaxForecastResult => {
  const targetYear = year ?? referenceDate.getFullYear();

  // Reference month is the current month if we're inside the target year,
  // otherwise we treat the entire year as "closed" (for past-year forecasts).
  const isCurrentYear = referenceDate.getFullYear() === targetYear;
  const currentMonth = isCurrentYear ? referenceDate.getMonth() : 12; // 0-11; 12 = past year

  // Closed months: months strictly before the current month, in the target year.
  // For Jan 2026 (currentMonth=0), closedMonthsCount = 0 → fall back to current-month-so-far.
  const closedMonthsCount = isCurrentYear ? currentMonth : 12;
  const monthsRemaining = Math.max(0, 12 - closedMonthsCount - (isCurrentYear ? 1 : 0));

  // YTD actuals (completed only, within the target year).
  let ytdIncome = 0;
  let ytdDeductibleExpenses = 0;
  let ytdAdvancesPaid = 0;
  // Closed-month totals (used to compute monthly averages for projection).
  let closedIncome = 0;
  let closedDeductibleExpenses = 0;
  // Pending future amounts inside the target year (treated as scheduled and projected).
  let scheduledFutureIncome = 0;
  let scheduledFutureDeductibleExpenses = 0;
  let scheduledFutureAdvances = 0;
  // Current-month-so-far totals (used as fallback when closedMonthsCount === 0).
  let currentMonthIncomeCompleted = 0;
  let currentMonthDeductibleCompleted = 0;

  transactions.forEach((t) => {
    if (!isInYear(t.date, targetYear)) return;
    const month = getMonth(t.date);
    if (month < 0) return;

    const isClosedMonth = isCurrentYear && month < currentMonth;
    const isCurrentMonth = isCurrentYear && month === currentMonth;
    const isFutureMonth = isCurrentYear && month > currentMonth;
    const completed = t.status === 'completed';

    // --- Fee income (net of VAT — fees are stored without VAT) ---
    if (t.type === 'income' && t.group === 'fee') {
      const amount = Math.abs(t.amount);
      if (completed) {
        ytdIncome += amount;
        if (isClosedMonth) closedIncome += amount;
        else if (isCurrentMonth) currentMonthIncomeCompleted += amount;
      } else if (isFutureMonth || isCurrentMonth) {
        scheduledFutureIncome += amount;
      }
      return;
    }

    // --- Deductible expenses ---
    if (isDeductibleExpense(t)) {
      const amount = Math.abs(t.amount);
      if (completed) {
        ytdDeductibleExpenses += amount;
        if (isClosedMonth) closedDeductibleExpenses += amount;
        else if (isCurrentMonth) currentMonthDeductibleCompleted += amount;
      } else if (isFutureMonth || isCurrentMonth) {
        scheduledFutureDeductibleExpenses += amount;
      }
      return;
    }

    // --- Income tax advances paid (or scheduled) for the target year ---
    if (isIncomeTaxAdvance(t)) {
      const amount = Math.abs(t.amount);
      if (completed) {
        ytdAdvancesPaid += amount;
      } else {
        scheduledFutureAdvances += amount;
      }
      return;
    }
  });

  // Monthly averages for projection (only meaningful when at least one closed month).
  const averageMonthlyIncome =
    closedMonthsCount > 0 ? closedIncome / closedMonthsCount : 0;
  const averageMonthlyDeductibleExpenses =
    closedMonthsCount > 0 ? closedDeductibleExpenses / closedMonthsCount : 0;

  // Project remaining months.
  // Strategy:
  //   - For closed months: use actual completed totals.
  //   - For current month: use larger of (scheduled+completed) vs (monthly average).
  //   - For future months: use scheduled amounts where available, else monthly average.
  // To keep it simple and conservative: take YTD actual + scheduled-future + monthly-average × months_without_data.
  // We can't easily tell "future months without scheduled data" from individual rows, so:
  //   projected_remaining = max(scheduled_future, monthly_average × months_remaining_including_current)
  //   - This avoids double-counting when the user has already entered explicit future rows.

  const monthsToFill = isCurrentYear ? Math.max(0, 12 - closedMonthsCount) : 0;
  const projectionFromAverageIncome = averageMonthlyIncome * monthsToFill;
  const projectionFromAverageExpenses = averageMonthlyDeductibleExpenses * monthsToFill;

  // If user has scheduled more than the average → use their schedule (they know better).
  // Else → use the average (covers months not yet entered).
  const projectedRemainingIncome = Math.max(
    scheduledFutureIncome + currentMonthIncomeCompleted,
    projectionFromAverageIncome
  );
  const projectedRemainingExpenses = Math.max(
    scheduledFutureDeductibleExpenses + currentMonthDeductibleCompleted,
    projectionFromAverageExpenses
  );

  // For past-year forecast (isCurrentYear === false), there's no projection — YTD is the full year.
  const projectedAnnualIncome = isCurrentYear
    ? closedIncome + projectedRemainingIncome
    : ytdIncome;
  const projectedAnnualDeductibleExpenses = isCurrentYear
    ? closedDeductibleExpenses + projectedRemainingExpenses
    : ytdDeductibleExpenses;
  const projectedAnnualAdvances = ytdAdvancesPaid + scheduledFutureAdvances;

  const taxableIncome = Math.max(0, projectedAnnualIncome - projectedAnnualDeductibleExpenses);
  const { totalTax: grossTax, breakdown: bracketBreakdown } = calculateAnnualTax(taxableIncome);
  const creditPointsValue = Math.max(0, annualCreditPointValue);
  const netTaxOwed = Math.max(0, grossTax - creditPointsValue);
  const balanceVsAdvances = netTaxOwed - projectedAnnualAdvances;

  // Recommended monthly advance: the level that would zero out the balance.
  // Currently-paying-monthly = mean of advances actually completed YTD (closed months only).
  // If 0 closed months, fall back to YTD/1 to give *something* meaningful in early year.
  const recommendedMonthlyAdvance = netTaxOwed / 12;
  const currentMonthlyAdvance =
    closedMonthsCount > 0 ? ytdAdvancesPaid / closedMonthsCount : ytdAdvancesPaid;
  const monthlyAdvanceDelta = recommendedMonthlyAdvance - currentMonthlyAdvance;

  return {
    year: targetYear,
    ytdIncome,
    ytdDeductibleExpenses,
    ytdAdvancesPaid,
    projectedAnnualIncome,
    projectedAnnualDeductibleExpenses,
    projectedAnnualAdvances,
    taxableIncome,
    grossTax,
    bracketBreakdown,
    creditPointsValue,
    netTaxOwed,
    balanceVsAdvances,
    recommendedMonthlyAdvance,
    currentMonthlyAdvance,
    monthlyAdvanceDelta,
    closedMonthsCount,
    monthsRemaining,
    averageMonthlyIncome,
    averageMonthlyDeductibleExpenses,
  };
};
