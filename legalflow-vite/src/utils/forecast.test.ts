import { describe, it, expect } from 'vitest';
import { computeYearEndForecast } from './forecast';
import type { Transaction } from '../types';

const MOCK_TODAY = new Date(2026, 4, 1); // May 1, 2026 - 4 closed months (Jan-Apr)

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  date: '2026-04-15',
  amount: 1000,
  type: 'expense',
  group: 'operational',
  category: 'הוצאות משרד',
  description: '',
  paymentMethod: 'transfer',
  status: 'completed',
  ...overrides,
});

describe('computeYearEndForecast', () => {
  it('reports zero closed months when called in January', () => {
    const today = new Date(2026, 0, 5);
    const result = computeYearEndForecast([], today);
    expect(result.closedMonthsCount).toBe(0);
    expect(result.remainingMonthsCount).toBe(12);
    expect(result.incomeYTDActual).toBe(0);
  });

  it('counts every month before today as a closed month', () => {
    const result = computeYearEndForecast([], MOCK_TODAY);
    expect(result.closedMonthsCount).toBe(4); // Jan, Feb, Mar, Apr
    expect(result.remainingMonthsCount).toBe(8);
  });

  it('sums fee income as NET (÷1.18) and ignores other_income', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-02-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      // Other income should NOT be counted
      tx({ date: '2026-01-20', group: 'other_income', type: 'income', amount: 50000, category: 'החזר חוב' }),
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY);
    // 118000 / 1.18 = 100000; two months of it = 200000
    expect(result.incomeYTDActual).toBeCloseTo(200000, 0);
  });

  it('includes pending transactions for closed months (matches cashflow grid)', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-15', amount: 5000, status: 'completed' }),
      tx({ date: '2026-01-20', amount: 3000, status: 'pending' }), // pending past month
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY);
    expect(result.operationalExpensesYTDActual).toBe(8000);
  });

  it('computes monthly breakdown for each closed month', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-10', amount: 10000 }),
      tx({ date: '2026-02-10', amount: 20000 }),
      tx({ date: '2026-03-10', amount: 30000 }),
      tx({ date: '2026-04-10', amount: 40000 }),
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY);
    expect(result.monthlyBreakdown).toHaveLength(4);
    expect(result.monthlyBreakdown[0].operationalExpenses).toBe(10000);
    expect(result.monthlyBreakdown[3].operationalExpenses).toBe(40000);
  });

  it('manual monthly total overrides auto-detected sum + buffer', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-10', amount: 10000 }),
      tx({ date: '2026-02-10', amount: 20000 }),
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY, {}, 5000, 50000);
    expect(result.isManualMonthlyTotalUsed).toBe(true);
    expect(result.effectiveMonthlyExpense).toBe(50000);
    // Should NOT use buffer or auto-sum since manual override is set
    expect(result.fixedExpensesRemainingForecast).toBe(0);
    expect(result.bufferRemainingForecast).toBe(0);
    expect(result.operationalExpensesTotal).toBe(30000 + 50000 * 8);
  });

  it('falls back to auto-detected average + buffer when manual is null', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-10', amount: 5000 }),
      tx({ date: '2026-02-10', amount: 5000 }),
      tx({ date: '2026-03-10', amount: 5000 }),
      tx({ date: '2026-04-10', amount: 5000 }),
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY, {}, 1000, null);
    expect(result.isManualMonthlyTotalUsed).toBe(false);
    // Single bucket appearing in all 4 months → fixed → avg=5000
    expect(result.avgFixedMonthlyExpense).toBe(5000);
    expect(result.effectiveMonthlyExpense).toBe(5000 + 1000); // avg + buffer
  });

  it('item override: marking as excluded removes from projection', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-10', amount: 5000, category: 'הוצאות משרד' }),
      tx({ date: '2026-02-10', amount: 5000, category: 'הוצאות משרד' }),
      tx({ date: '2026-03-10', amount: 5000, category: 'הוצאות משרד' }),
      tx({ date: '2026-04-10', amount: 5000, category: 'הוצאות משרד' }),
    ];
    const result = computeYearEndForecast(
      transactions,
      MOCK_TODAY,
      { 'cat:הוצאותמשרד|operational': { excluded: true } },
      0,
      null,
    );
    expect(result.avgFixedMonthlyExpense).toBe(0);
    expect(result.fixedExpenseBreakdown[0].isExcluded).toBe(true);
    expect(result.fixedExpenseBreakdown[0].effectiveMonthlyAmount).toBe(0);
  });

  it('item override: monthlyAmount replaces the auto computed average', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-10', amount: 12000, category: 'גט טקסי' }),
      tx({ date: '2026-02-10', amount: 12000, category: 'גט טקסי' }),
      tx({ date: '2026-03-10', amount: 12000, category: 'גט טקסי' }),
      tx({ date: '2026-04-10', amount: 12000, category: 'גט טקסי' }),
    ];
    const result = computeYearEndForecast(
      transactions,
      MOCK_TODAY,
      { 'cat:גטטקסי|operational': { monthlyAmount: 5000 } },
      0,
      null,
    );
    // Auto avg would be 12000 but override forces 5000
    expect(result.avgFixedMonthlyExpense).toBe(5000);
    const item = result.fixedExpenseBreakdown[0];
    expect(item.isAmountOverridden).toBe(true);
    expect(item.effectiveMonthlyAmount).toBe(5000);
    expect(item.avgPerMonth).toBe(12000);
  });

  it('income tax forecast for remaining months uses 14% × NET avg income', () => {
    const transactions: Transaction[] = [
      // Each month: 118000 gross fee → 100000 net → tax should be 14%
      tx({ date: '2026-01-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-02-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-03-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-04-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY);
    expect(result.avgMonthlyIncome).toBeCloseTo(100000, 0);
    // Remaining tax = 14% × 100000 × 8 months = 112000
    expect(result.taxAdvancesRemainingForecast).toBeCloseTo(112000, 0);
  });

  it('one-time expenses (appearing in <50% of closed months) are NOT in fixed', () => {
    const transactions: Transaction[] = [
      // Appears once → 25% of closed months → not fixed
      tx({ date: '2026-01-10', amount: 50000, category: 'אייפד' }),
      // Appears in 4 of 4 → fixed
      tx({ date: '2026-01-10', amount: 5000, category: 'שכר דירה' }),
      tx({ date: '2026-02-10', amount: 5000, category: 'שכר דירה' }),
      tx({ date: '2026-03-10', amount: 5000, category: 'שכר דירה' }),
      tx({ date: '2026-04-10', amount: 5000, category: 'שכר דירה' }),
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY);
    const fixedCategories = result.fixedExpenseBreakdown.map(b => b.description);
    expect(fixedCategories).toContain('שכר דירה');
    expect(fixedCategories).not.toContain('אייפד');
    expect(result.excludedOneTimeAmount).toBe(50000);
  });

  it('netCashFlowEoY does NOT subtract personal withdrawals', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-02-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-03-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-04-15', group: 'fee', type: 'income', amount: 118000, category: 'שכר טרחה' }),
      tx({ date: '2026-01-20', group: 'personal', amount: 10000, category: 'משיכה פרטית' }),
      tx({ date: '2026-02-20', group: 'personal', amount: 10000, category: 'משיכה פרטית' }),
      tx({ date: '2026-03-20', group: 'personal', amount: 10000, category: 'משיכה פרטית' }),
      tx({ date: '2026-04-20', group: 'personal', amount: 10000, category: 'משיכה פרטית' }),
    ];
    const result = computeYearEndForecast(transactions, MOCK_TODAY);
    // Personal withdrawals are kept entirely OUT of forecast subtraction
    expect(result.totalWithdrawals).toBe(0);
    // F3 = profitAfterTax - loans (not - withdrawals)
    expect(result.netCashFlowEoY).toBeCloseTo(result.profitAfterTax - result.totalLoans, 0);
  });
});
