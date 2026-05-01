import { describe, it, expect } from 'vitest';
import { formatDateKey, parseDateKey, parseDateKeyOrToday, isValidDateKey } from './date';

describe('formatDateKey', () => {
  it('formats a Date as YYYY-MM-DD with zero padding', () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(formatDateKey(new Date(1999, 8, 9))).toBe('1999-09-09');
  });
});

describe('parseDateKey', () => {
  it('parses a valid YYYY-MM-DD into a Date', () => {
    const d = parseDateKey('2026-04-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // 0-indexed April
    expect(d.getDate()).toBe(15);
  });

  it('returns Invalid Date for empty/null/undefined input (does NOT silently return today)', () => {
    expect(Number.isNaN(parseDateKey('').getTime())).toBe(true);
    expect(Number.isNaN(parseDateKey(undefined).getTime())).toBe(true);
    expect(Number.isNaN(parseDateKey(null).getTime())).toBe(true);
  });

  it('returns Invalid Date for malformed strings', () => {
    expect(Number.isNaN(parseDateKey('not-a-date').getTime())).toBe(true);
    expect(Number.isNaN(parseDateKey('2026').getTime())).toBe(true);
    expect(Number.isNaN(parseDateKey('2026-13-01').getTime())).toBe(true); // month 13
    expect(Number.isNaN(parseDateKey('2026-02-30').getTime())).toBe(true); // Feb 30 - rejects rollover
    expect(Number.isNaN(parseDateKey('2026-04-31').getTime())).toBe(true); // April 31
  });

  it('rejects out-of-range years', () => {
    expect(Number.isNaN(parseDateKey('1899-01-01').getTime())).toBe(true);
    expect(Number.isNaN(parseDateKey('2101-01-01').getTime())).toBe(true);
  });

  it('does not silently roll Feb 30 to March 2 (regression for H5 audit finding)', () => {
    const d = parseDateKey('2026-02-30');
    expect(Number.isNaN(d.getTime())).toBe(true);
  });

  it('round-trips with formatDateKey', () => {
    expect(formatDateKey(parseDateKey('2026-04-15'))).toBe('2026-04-15');
    expect(formatDateKey(parseDateKey('2025-12-31'))).toBe('2025-12-31');
    expect(formatDateKey(parseDateKey('1999-09-09'))).toBe('1999-09-09');
  });
});

describe('parseDateKeyOrToday', () => {
  it('returns parsed date for valid input', () => {
    const d = parseDateKeyOrToday('2026-04-15');
    expect(d.getFullYear()).toBe(2026);
  });

  it('falls back to today for invalid input', () => {
    const today = new Date();
    const d = parseDateKeyOrToday('');
    expect(d.getFullYear()).toBe(today.getFullYear());
    expect(d.getMonth()).toBe(today.getMonth());
  });
});

describe('isValidDateKey', () => {
  it('validates correctly', () => {
    expect(isValidDateKey('2026-04-15')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });
});
