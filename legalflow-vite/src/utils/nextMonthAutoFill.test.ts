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
    expect(key1).toBe(key2);
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
    expect(target.month).toBe(5);
  });
  it('handles year transition (December → January next year)', () => {
    const dec15 = new Date(2026, 11, 15);
    const target = getDefaultTargetMonth(dec15);
    expect(target.year).toBe(2027);
    expect(target.month).toBe(0);
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
  it('returns the source month (target - 1) in Hebrew', () => {
    // Target = June 2026 → source = May 2026
    const label = formatLookbackLabel({ year: 2026, month: 5 });
    expect(label).toContain('מאי');
    expect(label).toContain('2026');
  });

  it('handles year transition (Jan target → Dec previous year source)', () => {
    const label = formatLookbackLabel({ year: 2027, month: 0 });
    expect(label).toContain('דצמבר');
    expect(label).toContain('2026');
  });
});

describe('DEFAULT_AUTOFILL_BLACKLIST', () => {
  it('includes the user-defined common one-offs', () => {
    expect(DEFAULT_AUTOFILL_BLACKLIST).toContain('אייפד');
    expect(DEFAULT_AUTOFILL_BLACKLIST).toContain('ISO 27001');
    expect(DEFAULT_AUTOFILL_BLACKLIST).toContain('מונית ולדה');
  });
});

describe('computeNextMonthSuggestions (copy from previous month)', () => {
  // Today = May 1, 2026. Target = June. Source = May (the month before target).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 1));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const target = { year: 2026, month: 5 }; // June

  it('copies every eligible item from the source month (target - 1) with exact amounts and dates', () => {
    const transactions: Transaction[] = [
      // May 2026 (source for June target)
      tx({ date: '2026-05-01', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-05-15', group: 'loan', category: 'הלוואה', amount: 1770 }),
      tx({ date: '2026-05-20', group: 'personal', category: 'משיכה פרטית', amount: 8000 }),
      // April 2026 (NOT source - earlier)
      tx({ date: '2026-04-01', category: 'משהו אחר', amount: 999 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(3);
    const cats = suggestions.map(s => s.category).sort();
    expect(cats).toEqual(['הלוואה', 'משיכה פרטית', 'שכר דירה']);
    // Same amount preserved exactly (no averaging)
    const rent = suggestions.find(s => s.category === 'שכר דירה')!;
    expect(rent.averageAmount).toBe(5000);
    // Same day-of-month, shifted to June
    expect(rent.proposedDate).toBe('2026-06-01');
    const loan = suggestions.find(s => s.category === 'הלוואה')!;
    expect(loan.proposedDate).toBe('2026-06-15');
  });

  it('falls back to the most recent earlier month with data when (target-1) is empty', () => {
    // Source month (May) has no eligible rows. April does → use April.
    const transactions: Transaction[] = [
      tx({ date: '2026-04-10', category: 'חשמל', amount: 800 }),
      tx({ date: '2026-04-20', category: 'מים', amount: 250 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].monthsAppeared[0]).toBe('2026-04');
    expect(suggestions.find(s => s.category === 'חשמל')!.proposedDate).toBe('2026-06-10');
  });

  it('returns empty when no earlier month has any eligible data', () => {
    const transactions: Transaction[] = [
      // Only data in target month itself
      tx({ date: '2026-06-15', category: 'שכר דירה' }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(0);
  });

  it('skips items in the DEFAULT_AUTOFILL_BLACKLIST', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-05-01', category: 'אייפד', amount: 5000 }),
      tx({ date: '2026-05-02', category: 'שכר דירה', amount: 6000 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].category).toBe('שכר דירה');
  });

  it('multiple entries with same description in the source month all come through (no slot dedup)', () => {
    // The user's actual flow: credit card billed twice in same month.
    const transactions: Transaction[] = [
      tx({ date: '2026-05-05', category: 'אשראי', amount: 1000 }),
      tx({ date: '2026-05-25', category: 'אשראי', amount: 500 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions.filter(s => s.category === 'אשראי')).toHaveLength(2);
  });

  it('skips loans whose loanEndMonth has passed', () => {
    const transactions: Transaction[] = [
      tx({
        date: '2026-05-01',
        group: 'loan',
        category: 'הלוואה ישנה',
        loanEndMonth: '2026-05',
        amount: 1000,
      }),
      tx({
        date: '2026-05-02',
        group: 'loan',
        category: 'הלוואה פעילה',
        loanEndMonth: '2026-12',
        amount: 1000,
      }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions.map(s => s.category)).toEqual(['הלוואה פעילה']);
  });

  it('skips income transactions (only operational/loan/personal)', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-05-15', group: 'fee', type: 'income', amount: 10000 }),
      tx({ date: '2026-05-15', group: 'other_income', type: 'income', amount: 5000 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(0);
  });

  it('skips auto-generated transactions (system-created tax/VAT)', () => {
    const transactions: Transaction[] = [
      tx({
        date: '2026-05-23',
        group: 'tax',
        category: 'מס הכנסה אישי',
        isAutoGenerated: true,
        amount: 5000,
      }),
      tx({
        date: '2026-05-25',
        group: 'tax',
        category: 'מע"מ',
        isAutoGenerated: true,
        amount: 8000,
      }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(0);
  });

  it('flags items already existing in the target month as alreadyExistsInTargetMonth', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-05-01', category: 'שכר דירה', amount: 5000 }),
      // Already added a June rent
      tx({ date: '2026-06-01', category: 'שכר דירה', amount: 5000, status: 'pending' }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].alreadyExistsInTargetMonth).toBe(true);
  });

  it('respects user blacklist (in addition to defaults)', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-05-01', category: 'מזונות', amount: 10000 }),
      tx({ date: '2026-05-02', category: 'אחר', amount: 1000 }),
    ];
    const withBlacklist = computeNextMonthSuggestions(transactions, target, ['מזונות']);
    expect(withBlacklist.map(s => s.category)).toEqual(['אחר']);
    const withoutBlacklist = computeNextMonthSuggestions(transactions, target, []);
    expect(withoutBlacklist).toHaveLength(2);
  });

  it('clamps day-of-month to last day of target month (e.g. 31 Jan → 28 Feb)', () => {
    // Source = January (Jan 31), target = February
    const targetFeb = { year: 2026, month: 1 };
    const transactions: Transaction[] = [
      tx({ date: '2026-01-31', category: 'שכר דירה', amount: 5000 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, targetFeb);
    expect(suggestions).toHaveLength(1);
    // Feb 2026 has 28 days
    expect(suggestions[0].proposedDate).toBe('2026-02-28');
  });

  it('output is sorted by date then by group, not bucket frequency', () => {
    const transactions: Transaction[] = [
      tx({ date: '2026-05-25', category: 'שכר דירה', amount: 5000 }),
      tx({ date: '2026-05-05', group: 'loan', category: 'הלוואה', amount: 1000 }),
      tx({ date: '2026-05-15', group: 'personal', category: 'משיכה', amount: 3000 }),
    ];
    const suggestions = computeNextMonthSuggestions(transactions, target);
    expect(suggestions.map(s => s.proposedDate)).toEqual([
      '2026-06-05',
      '2026-06-15',
      '2026-06-25',
    ]);
  });
});
