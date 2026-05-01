import { describe, it, expect } from 'vitest';
import {
  normalize,
  normalizeRow,
  calculateDailyBalance,
  calculateMonthlyTotals,
  buildLedgerMapForRange,
  calculateLedgerEndBalance,
} from './cashflow';
import type { Transaction } from '../types';

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  date: '2026-01-01',
  amount: 1000,
  type: 'expense',
  group: 'operational',
  category: 'הוצאות',
  description: '',
  paymentMethod: 'transfer',
  status: 'completed',
  ...overrides,
});

describe('normalize', () => {
  it('coerces strings, nulls, and undefined to numbers', () => {
    expect(normalize('1234')).toBe(1234);
    expect(normalize(undefined)).toBe(0);
    expect(normalize(null)).toBe(0);
    expect(normalize('')).toBe(0);
    expect(normalize(NaN)).toBe(0);
    expect(normalize(Infinity)).toBe(0);
  });
});

describe('normalizeRow', () => {
  it('makes income positive and expenses negative', () => {
    const result = normalizeRow({
      date: '2026-01-01',
      salary: 1000,
      otherIncome: 500,
      loans: 200,
      withdrawals: 300,
      expenses: 400,
      taxes: 100,
      bankAdjustments: 50,
    });
    expect(result.salary).toBe(1000);
    expect(result.otherIncome).toBe(500);
    expect(result.loans).toBe(-200);
    expect(result.withdrawals).toBe(-300);
    expect(result.expenses).toBe(-400);
    expect(result.taxes).toBe(-100);
    expect(result.bankAdjustments).toBe(50); // sign-preserved
  });

  it('preserves bank adjustment sign (negative input stays negative)', () => {
    const result = normalizeRow({ date: '2026-01-01', bankAdjustments: -200 });
    expect(result.bankAdjustments).toBe(-200);
  });
});

describe('calculateDailyBalance', () => {
  it('sums all income/expense components correctly', () => {
    const balance = calculateDailyBalance({
      date: '2026-01-01',
      salary: 1000,
      otherIncome: 500,
      loans: 200, // -200 after normalize
      withdrawals: 100, // -100
      expenses: 300, // -300
      taxes: 50, // -50
      bankAdjustments: 20, // +20
    });
    // 1000 + 500 - 200 - 100 - 300 - 50 + 20 = 870
    expect(balance).toBe(870);
  });
});

describe('calculateMonthlyTotals', () => {
  it('runs balance forward from opening', () => {
    const rows = [
      { date: '2026-01-01', salary: 1000 },
      { date: '2026-01-02', expenses: 200 },
      { date: '2026-01-03', salary: 500 },
    ];
    const result = calculateMonthlyTotals(rows, 5000);
    expect(result[0].balance).toBe(6000); // 5000 + 1000
    expect(result[1].balance).toBe(5800); // 6000 - 200
    expect(result[2].balance).toBe(6300); // 5800 + 500
  });

  it('sorts rows by date even when input is out of order', () => {
    const rows = [
      { date: '2026-01-03', expenses: 100 },
      { date: '2026-01-01', salary: 1000 },
      { date: '2026-01-02', salary: 500 },
    ];
    const result = calculateMonthlyTotals(rows, 0);
    expect(result[0].date).toBe('2026-01-01');
    expect(result[0].balance).toBe(1000);
    expect(result[1].date).toBe('2026-01-02');
    expect(result[1].balance).toBe(1500);
    expect(result[2].date).toBe('2026-01-03');
    expect(result[2].balance).toBe(1400);
  });
});

describe('buildLedgerMapForRange', () => {
  it('builds a row for every day in the range', () => {
    const map = buildLedgerMapForRange({
      transactions: [],
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 5),
      openingBalance: 1000,
    });
    expect(map.size).toBe(5);
    expect(map.get('2026-01-01')!.balance).toBe(1000);
    expect(map.get('2026-01-05')!.balance).toBe(1000);
  });

  it('applies fee transactions to salary column', () => {
    const map = buildLedgerMapForRange({
      transactions: [tx({ date: '2026-01-03', group: 'fee', type: 'income', amount: 5000 })],
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 5),
      openingBalance: 0,
    });
    expect(map.get('2026-01-03')!.salary).toBe(5000);
    expect(map.get('2026-01-03')!.balance).toBe(5000);
    expect(map.get('2026-01-05')!.balance).toBe(5000);
  });

  it('keeps bank_adjustment sign (signed amount, not absolute)', () => {
    const map = buildLedgerMapForRange({
      transactions: [tx({ date: '2026-01-02', group: 'bank_adjustment', amount: -250, type: 'expense' })],
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 3),
      openingBalance: 1000,
    });
    expect(map.get('2026-01-02')!.bankAdjustments).toBe(-250);
    expect(map.get('2026-01-02')!.balance).toBe(750); // 1000 - 250
  });

  it('extends range automatically when transactions fall outside the requested window', () => {
    const map = buildLedgerMapForRange({
      transactions: [tx({ date: '2026-01-10', group: 'fee', type: 'income', amount: 100 })],
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 5),
      openingBalance: 0,
    });
    // The transaction on Jan 10 must still be applied even though range was 1-5
    expect(map.get('2026-01-10')).toBeDefined();
    expect(map.get('2026-01-10')!.balance).toBe(100);
  });
});

describe('calculateLedgerEndBalance', () => {
  it('returns the balance for the requested end date', () => {
    const balance = calculateLedgerEndBalance({
      transactions: [
        tx({ date: '2026-01-01', group: 'fee', type: 'income', amount: 10000 }),
        tx({ date: '2026-01-15', group: 'operational', amount: 3000 }),
      ],
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 31),
      openingBalance: 5000,
    });
    expect(balance).toBe(12000); // 5000 + 10000 - 3000
  });

  it('falls back to opening balance when end date is outside the ledger map', () => {
    const balance = calculateLedgerEndBalance({
      transactions: [],
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 1),
      openingBalance: 7777,
    });
    expect(balance).toBe(7777);
  });
});
