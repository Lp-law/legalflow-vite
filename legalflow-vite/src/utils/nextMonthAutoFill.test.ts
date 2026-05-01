import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeNextMonthSuggestions,
  getDefaultTargetMonth,
  formatTargetMonthLabel,
  formatLookbackLabel,
  normalizeForBucketKey,
  DEFAULT_AUTOFILL_BLACKLIST,
} from './nextMonthAutoFill';
import { buildForecastBucketKey } from './forecast';
import type { Transaction } from '../types';

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  date: '2026-04-15',
  amount: 1000,
  type: 'expense',
  group: 'operational',
  category: 'שכר דירה',
  description: '',
  paymentMethod: 'transfer',
  status: 'completed',
  ...overrides,
});

describe('normalizeForBucketKey', () => {
  it('strips Hebrew month names', () => {
    expect(normalizeForBucketKey('ספיקן ינואר')).toBe(normalizeForBucketKey('ספיקן'));
    expect(normalizeForBucketKey('ספיקן פברואר')).toBe(normalizeForBucketKey('ספיקן'));
  });
  it('strips year and date patterns', () => {
    expect(normalizeForBucketKey('ספיקן 2026')).toBe(normalizeForBucketKey('ספיקן'));
    expect(normalizeForBucketKey('שכר 01/2026')).toBe(normalizeForBucketKey('שכר'));
  });
  it('strips whitespace and punctuation', () => {
    expect(normalizeForBucketKey('  ספיקן . ')).toBe(normalizeForBucketKey('ספיקן'));
    expect(normalizeForBucketKey('שכ"ר טרחה')).toBe(normalizeForBucketKey('שכר טרחה'));
  });
  it('returns empty string for empty input', () => {
    expect(normalizeForBucketKey('')).toBe('');
    expect(normalizeForBucketKey(null)).toBe('');
    expect(normalizeForBucketKey(undefined)).toBe('');
  });
});

describe('buildForecastBucketKey', () => {
  it('uses category when provided', () => {
    const key1 = buildForecastBucketKey('משכורות עובדים', 'יוסי', 'operational');
    const key2 = buildForecastBucketKey('משכורות עובדים', 'דני', 'operational');
    expect(key1).toBe(key2); // same category → same bucket regardless of description
  });
  it('falls back to description when no category', () => {
    const key = buildForecastBucketKey('', 'משכורות', 'operational');
    expect(key).toContain('desc:');
  });
});

describe('getDefaultTargetMonth', () => {
  it('returns next calendar month from today', () => {
    const may1 = new Date(2026, 4, 1);
    const target = getDefaultTargetMonth(may1);
    expect(target.year).toBe(2026);
    expect(target.month).toBe(5); // June (0-indexed)
  });
  it('handles year transition (December → January next year)', () => {
    const dec15 = new Date(2026, 11, 15);
    const target = getDefaultTargetMonth(dec15);
    expect(target.year).toBe(2027);
    expect(target.month).toBe(0); // January
  });
});

describe('formatTargetMonthLabel', () => {
  it('formats month + year in Hebrew', () => {
    const label = formatTargetMonthLabel({ year: 2026, month: 5 });
    expect(label).toContain('יוני');
    expect(label).toContain('2026');
  });
});

describe('formatLookbackLabel', () => {
  it('lists every closed month of the current year', () => {
    const may1 = new Date(2026, 4, 1);
    const label = formatLookbackLabel({ year: 2026, month: 5 }, may1);
    expect(label).toContain('ינואר');
    expect(label).toContain('אפריל');
    expect(label).not.toContain('מאי');
  });
  it('returns fallback when no closed months yet', () => {
    const jan5 = new Date(2026, 0, 5);
    const label = formatLookbackLabel({ year: 2026, month: 1 }, jan5);
    expect(label).toBe('אין חודשים שנסגרו השנה');
  });
});

describe('DEFAULT_AUTOFILL_BLACKLIST', () => {
  it('includes the user-defined common one-offs', () => {
    expect(DEFAULT_AUTOFILL_BLACKLIST).toContain('אייפד');
    expect(DEFAULT_AUTOFILL_BLACKLIST).toContain('ISO 27001');
    expect(DEFAULT_AUTOFILL_BLACKLIST).toContain('מונית ולדה');
  });
});

describe('computeNextMonthSuggestions', () => {
  // Mock today = May 1, 2026 → closed months = Jan, Feb, Mar, Apr (4 months)
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 1));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const target = { year: 2026, month: 5 }; // June

  it('strict mode: only suggests items present in EVERY closed month', () => {
    const transactions: Transaction[] = [
      // שכר דירה - in all 4 months → should suggest
      tx({ date: '2026-01-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-02-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-03-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-04-01', category: 'שכר דירה', amount: 5000 }),
      // אייפד - only in 1 month → should NOT suggest (and is in blacklist anyway)
      tx({ date: '2026-01-15', category: 'אייפד', amount: 4000 }),
      // משהו אחר - only in 3 of 4 months → should NOT suggest (strict rule)
      tx({ date: '2026-01-10', category: 'חשמל', amount: 800 }),
      tx({ date: '2026-02-10', category: 'חשמל', amount: 900 }),
      tx({ date: '2026-03-10', category: 'חשמל', amount: 1000 }),
      // missing April for חשמל
    ];

    const suggestions = computeNextMonthSuggestions(transactions, target);
    const categories = suggestions.map(s => s.category);
    expect(categories).toContain('שכר דירה');
    expect(categories).not.toContain('חשמל');
    expect(categories).not.toContain('אייפד');
  });

  it('skips items in DEFAULT_AUTOFILL_BLACKLIST even when present in all months', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-01', category: 'אייפד', amount: 5000 }),
      tx({ date: '2026-02-01', category: 'אייפד', amount: 5000 }),
      tx({ date: '2026-03-01', category: 'אייפד', amount: 5000 }),
      tx({ date: '2026-04-01', category: 'אייפד', amount: 5000 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(0);
  });

  it('merges variant descriptions across months via normalization', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-01', description: 'ספיקן ינואר 2026', category: '' }),
      tx({ date: '2026-02-01', description: 'ספיקן פברואר', category: '' }),
      tx({ date: '2026-03-01', description: 'ספיקן - מרץ', category: '' }),
      tx({ date: '2026-04-01', description: 'ספיקן', category: '' }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].monthsAppeared).toHaveLength(4);
  });

  it('frequency-aware slots: items with multiple monthly occurrences get N suggestions', () => {
    const transactions: Transaction[] = [
      // Credit card billed 2x per month, every month
      tx({ date: '2026-01-05', category: 'אשראי', amount: 1000 }),
      tx({ date: '2026-01-25', category: 'אשראי', amount: 500 }),
      tx({ date: '2026-02-05', category: 'אשראי', amount: 1100 }),
      tx({ date: '2026-02-25', category: 'אשראי', amount: 600 }),
      tx({ date: '2026-03-05', category: 'אשראי', amount: 1200 }),
      tx({ date: '2026-03-25', category: 'אשראי', amount: 700 }),
      tx({ date: '2026-04-05', category: 'אשראי', amount: 1300 }),
      tx({ date: '2026-04-25', category: 'אשראי', amount: 800 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    const creditSlots = suggestions.filter(s => s.category === 'אשראי');
    expect(creditSlots).toHaveLength(2);
    // Sorted by day - first slot ~5th, second ~25th
    const sorted = creditSlots.slice().sort(
      (a, b) => parseInt(a.proposedDate.slice(8), 10) - parseInt(b.proposedDate.slice(8), 10),
    );
    expect(parseInt(sorted[0].proposedDate.slice(8), 10)).toBe(5);
    expect(parseInt(sorted[1].proposedDate.slice(8), 10)).toBe(25);
  });

  it('skips loans whose loanEndMonth has passed', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-01', group: 'loan', category: 'הלוואה ישנה', loanEndMonth: '2026-04', amount: 1000 }),
      tx({ date: '2026-02-01', group: 'loan', category: 'הלוואה ישנה', loanEndMonth: '2026-04', amount: 1000 }),
      tx({ date: '2026-03-01', group: 'loan', category: 'הלוואה ישנה', loanEndMonth: '2026-04', amount: 1000 }),
      tx({ date: '2026-04-01', group: 'loan', category: 'הלוואה ישנה', loanEndMonth: '2026-04', amount: 1000 }),
    ];
    // Target = June 2026, but loan ends April → should NOT be suggested
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(0);
  });

  it('skips income transactions (only operational/loan/personal)', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-15', group: 'fee', type: 'income', amount: 10000 }),
      tx({ date: '2026-02-15', group: 'fee', type: 'income', amount: 10000 }),
      tx({ date: '2026-03-15', group: 'fee', type: 'income', amount: 10000 }),
      tx({ date: '2026-04-15', group: 'fee', type: 'income', amount: 10000 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(0);
  });

  it('skips auto-generated transactions', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-23', group: 'tax', category: 'מס הכנסה אישי', isAutoGenerated: true, amount: 5000 }),
      tx({ date: '2026-02-23', group: 'tax', category: 'מס הכנסה אישי', isAutoGenerated: true, amount: 5000 }),
      tx({ date: '2026-03-23', group: 'tax', category: 'מס הכנסה אישי', isAutoGenerated: true, amount: 5000 }),
      tx({ date: '2026-04-23', group: 'tax', category: 'מס הכנסה אישי', isAutoGenerated: true, amount: 5000 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(0);
  });

  it('flags items already existing in the target month as alreadyExistsInTargetMonth', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-02-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-03-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-04-01', category: 'שכר דירה', amount: 5000 }),
      // already created for June
      tx({ date: '2026-06-01', category: 'שכר דירה', amount: 5000, status: 'pending' }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].alreadyExistsInTargetMonth).toBe(true);
  });

  it('respects user blacklist (in addition to defaults)', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-01', category: 'מזונות', amount: 10000 }),
      tx({ date: '2026-02-01', category: 'מזונות', amount: 10000 }),
      tx({ date: '2026-03-01', category: 'מזונות', amount: 10000 }),
      tx({ date: '2026-04-01', category: 'מזונות', amount: 10000 }),
    ];
    const withBlacklist = computeNextMonthSuggestions(transactions, target, ['מזונות']);
    expect(withBlacklist).toHaveLength(0);

    const withoutBlacklist = computeNextMonthSuggestions(transactions, target, []);
    expect(withoutBlacklist).toHaveLength(1);
  });

  it('averages amounts per slot across months', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-01-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-02-01', category: 'שכר דירה', amount: 6000 }),
      tx({ date: '2026-03-01', category: 'שכר דירה', amount: 5500 }),
      tx({ date: '2026-04-01', category: 'שכר דירה', amount: 5500 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].averageAmount).toBeCloseTo(5500, 0); // (5000+6000+5500+5500)/4
  });
});
