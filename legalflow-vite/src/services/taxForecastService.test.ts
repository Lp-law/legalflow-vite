import { describe, it, expect } from 'vitest';
import {
  calculateAnnualTax,
  calculateTaxForecast,
  isDeductibleExpense,
  isIncomeTaxAdvance,
  ANNUAL_CREDIT_POINT_VALUE_DEFAULT,
  TAX_BRACKETS_2026,
} from './taxForecastService';
import type { Transaction } from '../types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2)}`,
  date: '2026-01-15',
  amount: 0,
  type: 'expense',
  group: 'operational',
  category: 'אחר',
  description: '',
  paymentMethod: 'transfer',
  status: 'completed',
  ...overrides,
});

describe('calculateAnnualTax', () => {
  it('returns 0 for non-positive taxable income', () => {
    expect(calculateAnnualTax(0).totalTax).toBe(0);
    expect(calculateAnnualTax(-1000).totalTax).toBe(0);
    expect(calculateAnnualTax(NaN).totalTax).toBe(0);
  });

  it('applies just the 10% bracket for low income', () => {
    // 50,000 < 84,120 → 10% × 50,000 = 5,000
    const r = calculateAnnualTax(50_000);
    expect(r.totalTax).toBeCloseTo(5_000, 2);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].rate).toBe(0.10);
  });

  it('walks brackets cumulatively (10 + 14 + 20)', () => {
    // 150,000:
    //   10% × 84,120                         = 8,412
    //   14% × (120,720 - 84,120) = 36,600    = 5,124
    //   20% × (150,000 - 120,720) = 29,280   = 5,856
    //   total = 19,392
    const r = calculateAnnualTax(150_000);
    expect(r.totalTax).toBeCloseTo(19_392, 2);
    expect(r.breakdown).toHaveLength(3);
  });

  it('reaches the 31% bracket', () => {
    // 250,000:
    //   10% × 84,120 = 8,412
    //   14% × 36,600 = 5,124
    //   20% × 73,080 = 14,616
    //   31% × (250,000 - 193,800) = 56,200 → 17,422
    //   total = 45,574
    const r = calculateAnnualTax(250_000);
    expect(r.totalTax).toBeCloseTo(45_574, 2);
  });

  it('reaches the top 50% bracket on very high income', () => {
    // 800,000:
    //   10 × 84,120        = 8,412
    //   14 × 36,600        = 5,124
    //   20 × 73,080        = 14,616
    //   31 × 75,480        = 23,398.8
    //   35 × (560,280 - 269,280) = 291,000 → 101,850
    //   47 × (721,560 - 560,280) = 161,280 → 75,801.6
    //   50 × (800,000 - 721,560) = 78,440 → 39,220
    //   total ≈ 268,422.40
    const r = calculateAnnualTax(800_000);
    expect(r.totalTax).toBeCloseTo(268_422.4, 1);
    expect(r.breakdown.length).toBe(7);
    expect(r.breakdown.at(-1)?.rate).toBe(0.50);
  });

  it('matches the bracket table — exactly at first threshold', () => {
    // 84,120 = exact top of bracket 1 → 10% × 84,120 = 8,412
    const r = calculateAnnualTax(84_120);
    expect(r.totalTax).toBeCloseTo(8_412, 2);
  });

  it('default brackets reference is the 2026 table', () => {
    expect(TAX_BRACKETS_2026[0].rate).toBe(0.10);
    expect(TAX_BRACKETS_2026.at(-1)?.rate).toBe(0.50);
  });
});

describe('classifiers', () => {
  describe('isDeductibleExpense', () => {
    it('includes operational expenses', () => {
      expect(isDeductibleExpense(makeTx({ group: 'operational', type: 'expense' }))).toBe(true);
    });

    it('excludes loans (not a business expense)', () => {
      expect(isDeductibleExpense(makeTx({ group: 'loan', type: 'expense' }))).toBe(false);
    });

    it('excludes personal/withdrawals/alimony', () => {
      expect(isDeductibleExpense(makeTx({ group: 'personal', type: 'expense' }))).toBe(false);
    });

    it('excludes the tax payments themselves', () => {
      expect(isDeductibleExpense(makeTx({ group: 'tax', type: 'expense' }))).toBe(false);
    });

    it('excludes bank adjustments', () => {
      expect(isDeductibleExpense(makeTx({ group: 'bank_adjustment', type: 'expense' }))).toBe(false);
    });

    it('rejects income rows even if group=operational', () => {
      expect(isDeductibleExpense(makeTx({ group: 'operational', type: 'income' }))).toBe(false);
    });
  });

  describe('isIncomeTaxAdvance', () => {
    it('matches "מס הכנסה אישי"', () => {
      expect(
        isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מס הכנסה אישי' }))
      ).toBe(true);
    });

    it('matches "מקדמת מס" / "מקדמות מס"', () => {
      expect(isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מקדמת מס' }))).toBe(true);
      expect(isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מקדמות מס' }))).toBe(true);
    });

    it('does NOT match VAT', () => {
      expect(isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מע"מ' }))).toBe(false);
    });

    it('does NOT match non-tax groups even if category mentions מס', () => {
      expect(isIncomeTaxAdvance(makeTx({ group: 'operational', category: 'מס הכנסה' }))).toBe(false);
    });

    it('matches via description text', () => {
      expect(
        isIncomeTaxAdvance(
          makeTx({ group: 'tax', category: 'אחר', description: 'מקדמות מס בגין 02/2026' })
        )
      ).toBe(true);
    });
  });
});

describe('calculateTaxForecast', () => {
  it('handles empty transactions (zero everywhere, no NaN)', () => {
    const r = calculateTaxForecast({ transactions: [], referenceDate: new Date(2026, 4, 15) });
    expect(r.year).toBe(2026);
    expect(r.taxableIncome).toBe(0);
    expect(r.grossTax).toBe(0);
    expect(r.netTaxOwed).toBe(0);
    expect(r.balanceVsAdvances).toBe(0);
  });

  it('uses 2.25 base credit points (~6,750 ₪/yr) by default', () => {
    expect(ANNUAL_CREDIT_POINT_VALUE_DEFAULT).toBeCloseTo(6_750, 2);
  });

  it('projects from 4 closed months YTD (May 2026)', () => {
    // 4 closed months × 100,000 ₪ fee/month and 30,000 ₪ deductible/month
    const txs: Transaction[] = [];
    for (let m = 0; m < 4; m++) {
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-15`,
          type: 'income',
          group: 'fee',
          category: 'שכר טרחה',
          amount: 100_000,
          status: 'completed',
        })
      );
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-20`,
          type: 'expense',
          group: 'operational',
          amount: 30_000,
          status: 'completed',
        })
      );
    }
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15), // May
    });
    expect(r.closedMonthsCount).toBe(4);
    // Months to fill (May-Dec) = 8. Average × 8 = 800,000 income / 240,000 expenses.
    // YTD = 400,000 income / 120,000 expenses.
    // Projected annual: 400 + 800 = 1,200,000 income, 120 + 240 = 360,000 expenses.
    expect(r.projectedAnnualIncome).toBeCloseTo(1_200_000, 0);
    expect(r.projectedAnnualDeductibleExpenses).toBeCloseTo(360_000, 0);
    expect(r.taxableIncome).toBeCloseTo(840_000, 0);
    // Tax on 840,000 (manually):
    //   10 × 84,120 = 8,412
    //   14 × 36,600 = 5,124
    //   20 × 73,080 = 14,616
    //   31 × 75,480 = 23,398.8
    //   35 × 291,000 = 101,850
    //   47 × 161,280 = 75,801.6
    //   50 × (840,000 - 721,560) = 118,440 → 59,220
    //   total ≈ 288,422.40
    expect(r.grossTax).toBeCloseTo(288_422.4, 1);
    expect(r.netTaxOwed).toBeCloseTo(288_422.4 - 6_750, 1);
  });

  it('balanceVsAdvances goes negative (refund) when advances exceed net tax', () => {
    // Low income, but big advances paid
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-10',
        type: 'income',
        group: 'fee',
        amount: 50_000,
        status: 'completed',
      }),
      makeTx({
        date: '2026-02-23',
        type: 'expense',
        group: 'tax',
        category: 'מס הכנסה אישי',
        amount: 100_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15),
    });
    expect(r.balanceVsAdvances).toBeLessThan(0);
  });

  it('counts pending future tax advances toward projected advances', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-06-23',
        type: 'expense',
        group: 'tax',
        category: 'מס הכנסה אישי',
        amount: 5_000,
        status: 'pending',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15),
    });
    expect(r.ytdAdvancesPaid).toBe(0);
    expect(r.projectedAnnualAdvances).toBe(5_000);
  });

  it('past-year mode: no projection, just YTD totals', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2025-03-10',
        type: 'income',
        group: 'fee',
        amount: 100_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      year: 2025,
      referenceDate: new Date(2026, 4, 15),
    });
    expect(r.projectedAnnualIncome).toBeCloseTo(100_000, 0);
    expect(r.monthsRemaining).toBe(0);
  });

  it('respects year filter (ignores transactions from other years)', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2025-12-31',
        type: 'income',
        group: 'fee',
        amount: 1_000_000,
        status: 'completed',
      }),
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'fee',
        amount: 100_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      year: 2026,
      referenceDate: new Date(2026, 4, 15),
    });
    expect(r.ytdIncome).toBe(100_000);
  });

  it('excludes non-deductible groups from projected expenses', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'fee',
        amount: 100_000,
        status: 'completed',
      }),
      makeTx({
        date: '2026-01-15',
        type: 'expense',
        group: 'loan',
        amount: 20_000,
        status: 'completed',
      }),
      makeTx({
        date: '2026-01-15',
        type: 'expense',
        group: 'personal',
        amount: 10_000,
        status: 'completed',
        category: 'מזונות אורלי',
      }),
      makeTx({
        date: '2026-01-15',
        type: 'expense',
        group: 'operational',
        amount: 5_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      year: 2026,
      referenceDate: new Date(2026, 1, 15), // Feb (Jan closed)
    });
    expect(r.ytdDeductibleExpenses).toBe(5_000); // only operational
  });

  it('uses scheduled future income when greater than monthly average', () => {
    // 4 closed months at 50,000 → average 50k/mo
    // 1 huge scheduled June fee at 1,000,000
    const txs: Transaction[] = [];
    for (let m = 0; m < 4; m++) {
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-15`,
          type: 'income',
          group: 'fee',
          amount: 50_000,
          status: 'completed',
        })
      );
    }
    txs.push(
      makeTx({
        date: '2026-06-30',
        type: 'income',
        group: 'fee',
        amount: 1_000_000,
        status: 'pending',
      })
    );
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15), // May
    });
    // Closed = 200k. monthsToFill = 8. avg projection = 8 × 50k = 400k.
    // Scheduled future = 1,000k > 400k → use scheduled.
    // Projected annual = 200k + 1,000k = 1,200k
    expect(r.projectedAnnualIncome).toBeCloseTo(1_200_000, 0);
  });

  it('flags an under-paying monthly advance as positive delta', () => {
    // 4 closed months × 100,000 fee, no expenses, only 1,000 ₪/mo advances paid.
    // Net tax forecast will be huge → recommended monthly advance >> current.
    const txs: Transaction[] = [];
    for (let m = 0; m < 4; m++) {
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-15`,
          type: 'income',
          group: 'fee',
          amount: 100_000,
          status: 'completed',
        })
      );
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-23`,
          type: 'expense',
          group: 'tax',
          category: 'מס הכנסה אישי',
          amount: 1_000,
          status: 'completed',
        })
      );
    }
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15),
    });
    expect(r.currentMonthlyAdvance).toBe(1_000);
    expect(r.recommendedMonthlyAdvance).toBeGreaterThan(20_000);
    expect(r.monthlyAdvanceDelta).toBeGreaterThan(0); // under-paying
  });

  it('flags an over-paying monthly advance as negative delta', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'fee',
        amount: 30_000,
        status: 'completed',
      }),
      makeTx({
        date: '2026-01-23',
        type: 'expense',
        group: 'tax',
        category: 'מס הכנסה אישי',
        amount: 50_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 1, 15), // Feb (Jan closed)
    });
    expect(r.monthlyAdvanceDelta).toBeLessThan(0);
  });

  it('honors a custom credit-point value override', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'fee',
        amount: 200_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      year: 2026,
      referenceDate: new Date(2026, 11, 31), // Dec - no projection
      annualCreditPointValue: 0,
    });
    expect(r.creditPointsValue).toBe(0);
    expect(r.netTaxOwed).toBe(r.grossTax);
  });
});
