import { describe, it, expect } from 'vitest';
import {
  calculateAnnualTax,
  calculateTaxForecast,
  isDeductibleExpense,
  isIncomeTaxAdvance,
  ANNUAL_CREDIT_POINT_VALUE_DEFAULT,
  TAX_BRACKETS_2026,
  INCOME_TAX_ADVANCE_RATE,
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
    const r = calculateAnnualTax(50_000);
    expect(r.totalTax).toBeCloseTo(5_000, 2);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].rate).toBe(0.10);
  });

  it('walks brackets cumulatively (10 + 14 + 20)', () => {
    // 150,000:
    //   10% × 84,120 = 8,412
    //   14% × 36,600 = 5,124
    //   20% × 29,280 = 5,856
    //   total = 19,392
    const r = calculateAnnualTax(150_000);
    expect(r.totalTax).toBeCloseTo(19_392, 2);
    expect(r.breakdown).toHaveLength(3);
  });

  it('reaches the 31% bracket', () => {
    // 250,000 → total = 45,574
    const r = calculateAnnualTax(250_000);
    expect(r.totalTax).toBeCloseTo(45_574, 2);
  });

  it('reaches the top 50% bracket on very high income', () => {
    // 800,000 → 268,422.40
    const r = calculateAnnualTax(800_000);
    expect(r.totalTax).toBeCloseTo(268_422.4, 1);
    expect(r.breakdown.length).toBe(7);
    expect(r.breakdown.at(-1)?.rate).toBe(0.50);
  });

  it('matches the bracket table — exactly at first threshold', () => {
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
      expect(isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מס הכנסה אישי' }))).toBe(true);
    });
    it('matches "מקדמת מס" / "מקדמות מס"', () => {
      expect(isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מקדמת מס' }))).toBe(true);
      expect(isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מקדמות מס' }))).toBe(true);
    });
    it('does NOT match VAT', () => {
      expect(isIncomeTaxAdvance(makeTx({ group: 'tax', category: 'מע"מ' }))).toBe(false);
    });
    it('does NOT match non-tax groups', () => {
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

describe('calculateTaxForecast (delegates to forecast service)', () => {
  it('uses 2.25 base credit points (~6,750 ₪/yr) by default', () => {
    expect(ANNUAL_CREDIT_POINT_VALUE_DEFAULT).toBeCloseTo(6_750, 2);
  });

  it('exports the 14% advance rate constant', () => {
    expect(INCOME_TAX_ADVANCE_RATE).toBe(0.14);
  });

  it('handles empty transactions (zero everywhere, no NaN)', () => {
    const r = calculateTaxForecast({
      transactions: [],
      referenceDate: new Date(2026, 4, 15),
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: null,
    });
    expect(r.year).toBe(2026);
    expect(r.taxableIncome).toBe(0);
    expect(r.grossTax).toBe(0);
    expect(r.netTaxOwed).toBe(0);
  });

  it('strips VAT from fee income (fee.amount / 1.18 = net)', () => {
    // 4 closed months × 354,000 ₪ gross fees (= 300,000 net per month).
    // No expenses, no advances. May 2026 → 4 closed months, 8 remaining.
    const txs: Transaction[] = [];
    for (let m = 0; m < 4; m++) {
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-15`,
          type: 'income',
          group: 'fee',
          amount: 354_000, // gross with VAT
          status: 'completed',
        })
      );
    }
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15),
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0, // no manual override
    });
    // YTD net: 4 × 300,000 = 1,200,000
    expect(r.ytdIncome).toBeCloseTo(1_200_000, 0);
    // Avg/month net: 300,000. 8 remaining months × 300k = 2,400,000
    expect(r.remainingIncomeForecast).toBeCloseTo(2_400_000, 0);
    expect(r.projectedAnnualIncome).toBeCloseTo(3_600_000, 0);
  });

  it('does NOT include other_income in income forecast', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'fee',
        amount: 118_000, // 100k net
        status: 'completed',
      }),
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'other_income',
        amount: 50_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 1, 15), // Feb (Jan closed)
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0,
    });
    expect(r.ytdIncome).toBeCloseTo(100_000, 0); // only the fee net, not other_income
  });

  it('only counts operational expenses (excludes loans, personal, taxes, bank adj)', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-10',
        type: 'income',
        group: 'fee',
        amount: 118_000,
        status: 'completed',
      }),
      makeTx({
        date: '2026-01-15',
        type: 'expense',
        group: 'operational',
        amount: 5_000,
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
        group: 'bank_adjustment',
        amount: 1_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 1, 15),
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0,
    });
    expect(r.ytdDeductibleExpenses).toBe(5_000);
  });

  it("user's actual Jan-Apr 2026 advances roll up correctly", () => {
    // From the user's confirmed payments:
    //   Jan 32,382  Feb 47,170  Mar 51,594  Apr 47,609  → total 178,755
    const advances = [32_382, 47_170, 51_594, 47_609];
    const txs: Transaction[] = advances.map((amount, i) =>
      makeTx({
        date: `2026-${String(i + 1).padStart(2, '0')}-23`,
        type: 'expense',
        group: 'tax',
        category: 'מס הכנסה אישי',
        amount,
        status: 'completed',
      })
    );
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15),
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0,
    });
    expect(r.ytdAdvancesPaid).toBe(178_755);
    expect(r.currentMonthlyAdvance).toBeCloseTo(178_755 / 4, 1);
  });

  it('flags an under-paying monthly advance as positive adjustment', () => {
    // 4 closed months × 354,000 gross fees (= 300k net), 1,000 ₪/mo advance.
    // Net forecast tax >> what's projected → should recommend increase.
    const txs: Transaction[] = [];
    for (let m = 0; m < 4; m++) {
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-15`,
          type: 'income',
          group: 'fee',
          amount: 354_000,
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
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0,
    });
    expect(r.currentMonthlyAdvance).toBe(1_000);
    expect(r.monthsRemainingForAdvance).toBe(8);
    expect(r.monthlyAdvanceAdjustment).toBeGreaterThan(0);
    expect(r.balanceVsAdvances).toBeGreaterThan(0);
    // Adjustment × monthsLeft ≈ balance
    expect(r.monthlyAdvanceAdjustment * r.monthsRemainingForAdvance).toBeCloseTo(
      r.balanceVsAdvances,
      0
    );
  });

  it('flags an over-paying monthly advance as negative adjustment (refund)', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'fee',
        amount: 35_400, // 30k net
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
      referenceDate: new Date(2026, 1, 15),
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0,
    });
    expect(r.balanceVsAdvances).toBeLessThan(0);
    expect(r.monthlyAdvanceAdjustment).toBeLessThan(0);
  });

  it('respects forecastManualMonthlyTotal override (uses 185k×8 instead of buckets)', () => {
    // 4 closed months × 354k gross fees, no expenses entered, manual=185k/mo
    const txs: Transaction[] = [];
    for (let m = 0; m < 4; m++) {
      txs.push(
        makeTx({
          date: `2026-${String(m + 1).padStart(2, '0')}-15`,
          type: 'income',
          group: 'fee',
          amount: 354_000,
          status: 'completed',
        })
      );
    }
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 4, 15),
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 185_000,
    });
    expect(r.isManualMonthlyTotalUsed).toBe(true);
    // 8 remaining months × 185k = 1,480,000 projected expenses
    // YTD operational = 0
    expect(r.projectedAnnualDeductibleExpenses).toBeCloseTo(1_480_000, 0);
  });

  it('honors a custom credit-point value override', () => {
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-15',
        type: 'income',
        group: 'fee',
        amount: 354_000,
        status: 'completed',
      }),
    ];
    const r = calculateTaxForecast({
      transactions: txs,
      referenceDate: new Date(2026, 11, 31),
      annualCreditPointValue: 0,
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0,
    });
    expect(r.creditPointsValue).toBe(0);
    expect(r.netTaxOwed).toBe(r.grossTax);
  });

  it('balanceVsAdvances goes negative (refund) when advances exceed net tax', () => {
    // Modest income, very high advance YTD
    const txs: Transaction[] = [
      makeTx({
        date: '2026-01-10',
        type: 'income',
        group: 'fee',
        amount: 59_000, // 50k net
        status: 'completed',
      }),
      makeTx({
        date: '2026-01-23',
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
      forecastItemOverrides: {},
      forecastMonthlyBuffer: 0,
      forecastManualMonthlyTotal: 0,
    });
    expect(r.balanceVsAdvances).toBeLessThan(0);
  });
});
