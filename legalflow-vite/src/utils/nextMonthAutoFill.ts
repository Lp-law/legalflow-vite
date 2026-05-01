import type { Transaction, TransactionGroup } from '../types';
import { formatDateKey, parseDateKey } from './date';

const RECURRING_GROUPS: TransactionGroup[] = ['operational', 'loan', 'personal'];

// Default tokens (substrings) to NEVER suggest when filling next month.
// These are typically one-off purchases or descriptions the user marked
// as not recurring. The user can extend this list at runtime via
// addToAutoFillBlacklist() in storageService.
export const DEFAULT_AUTOFILL_BLACKLIST: string[] = [
  'אייפד',
  'iPad',
  'חיובי חו"ל',
  'חיובי חוץ',
  'היימן',
  'קומפלקס כימיקלים',
  'להבין על מה ההוצאה מול ליאור',
  'מונית ולדה',
  'מחשב נייח - נויה',
  'מסלול ערוץ',
  'נסיעות - מוניות',
  'ריבית רבעונית',
  'ISO 27001',
  'iso27001',
];

const normalize = (value: string | undefined | null) =>
  (value || '')
    .toLowerCase()
    .replace(/[\s"'\-_.]/g, '');

// Aggressive normalization for grouping: strip month names, year and dates so
// that "ספיקן ינואר 2026", "ספיקן - פברואר", "ספיקן" all collapse into the
// same bucket. Used only for bucketing - the display description keeps the
// original (most recent) form.
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export const normalizeForBucketKey = (s: string | undefined | null): string => {
  if (!s) return '';
  let result = s.toLowerCase();
  // Remove date patterns FIRST (otherwise stripping the year separately can
  // leave dangling digits like "01/" from "01/2026").
  result = result.replace(/\d{1,2}[\/.\-]\d{1,4}/g, '');
  // Remove leftover year tokens (1900-2099)
  result = result.replace(/(19|20)\d{2}/g, '');
  // Remove month names (sort longer first so "ספטמבר" matches before "ספט")
  HEBREW_MONTHS.slice().sort((a, b) => b.length - a.length).forEach(month => {
    result = result.split(month).join('');
  });
  // Remove any leftover standalone digits (e.g., '01' alone, '5')
  result = result.replace(/\d+/g, '');
  // Remove whitespace and punctuation
  result = result.replace(/[\s"'״׳\-_.()/\\,]+/g, '');
  return result.trim();
};

const matchesBlacklist = (description: string, category: string, blacklist: string[]): boolean => {
  const haystack = `${normalize(description)} ${normalize(category)}`;
  return blacklist.some(token => {
    const t = normalize(token);
    return t.length > 0 && haystack.includes(t);
  });
};

export type AutoFillSuggestion = {
  key: string;
  description: string;
  category: string;
  group: TransactionGroup;
  averageAmount: number;
  monthlyAmounts: number[]; // amounts from the lookback months (one entry per occurrence)
  monthsAppeared: string[]; // YYYY-MM keys where this transaction was seen
  proposedDate: string; // YYYY-MM-DD
  paymentMethod: Transaction['paymentMethod'];
  loanEndMonth?: string;
  alreadyExistsInTargetMonth: boolean;
  type: Transaction['type'];
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const dayOfMonth = (dateStr: string) => parseDateKey(dateStr).getDate();

const lastDayOfMonth = (year: number, monthZeroBased: number) =>
  new Date(year, monthZeroBased + 1, 0).getDate();

const buildProposedDate = (
  targetYear: number,
  targetMonth: number,
  preferredDay: number,
): string => {
  const maxDay = lastDayOfMonth(targetYear, targetMonth);
  const safeDay = Math.min(preferredDay, maxDay);
  return formatDateKey(new Date(targetYear, targetMonth, safeDay, 12));
};

const isLoanStillActive = (
  loanEndMonth: string | undefined,
  targetYear: number,
  targetMonth: number,
): boolean => {
  if (!loanEndMonth) return true;
  const [endYearStr, endMonthStr] = loanEndMonth.split('-');
  const endYear = parseInt(endYearStr, 10);
  const endMonth = parseInt(endMonthStr, 10) - 1;
  if (Number.isNaN(endYear) || Number.isNaN(endMonth)) return true;
  // Loan still active if its end month is on/after the target month
  if (endYear > targetYear) return true;
  if (endYear < targetYear) return false;
  return endMonth >= targetMonth;
};

/**
 * Build proposed transactions for the target month based on the previous 3 calendar months.
 * Includes operational, loan, and personal groups only. Skips auto-generated entries.
 * Excludes any transaction whose description/category matches the blacklist.
 *
 * For each unique (description, category, group), the function detects the
 * typical occurrences-per-month frequency and proposes that many transactions:
 * - Loans, salaries: 1 per month → 1 proposal
 * - Credit cards billed twice a month → 2 proposals
 * - Withdrawals 3x per month → 3 proposals
 * Each "slot" is matched across months by day-of-month order, then the day
 * and amount are averaged across months.
 */
export const computeNextMonthSuggestions = (
  transactions: Transaction[],
  target: { year: number; month: number }, // month is 0-indexed
  userBlacklist: string[] = [],
): AutoFillSuggestion[] => {
  const fullBlacklist = [...DEFAULT_AUTOFILL_BLACKLIST, ...userBlacklist];
  const targetMonthKey = `${target.year}-${String(target.month + 1).padStart(2, '0')}`;

  // Lookback = all closed months in the current calendar year
  // (months strictly before today's month).
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth();
  const lookbackKeys: string[] = [];
  for (let m = 0; m < currentMonthIdx; m += 1) {
    const d = new Date(currentYear, m, 1);
    lookbackKeys.push(monthKey(d));
  }
  const lookbackSet = new Set(lookbackKeys);
  const requiredMonthsCount = lookbackKeys.length;

  type Occurrence = { day: number; amount: number; date: Date };
  type Bucket = {
    key: string;
    descriptionDisplay: string;
    categoryDisplay: string;
    group: TransactionGroup;
    paymentMethod: Transaction['paymentMethod'];
    occurrencesByMonth: Map<string, Occurrence[]>; // month key -> occurrences in that month
    latestSeenAt: Date;
    loanEndMonth?: string;
  };

  const buckets = new Map<string, Bucket>();
  const targetMonthSignatures = new Set<string>();

  transactions.forEach(t => {
    if (!RECURRING_GROUPS.includes(t.group)) return;
    if (t.isAutoGenerated) return;
    if (t.type !== 'expense') return;

    const tDate = parseDateKey(t.date);
    const tMonthKey = monthKey(tDate);

    if (tMonthKey === targetMonthKey) {
      targetMonthSignatures.add(
        `${normalizeForBucketKey(t.description || '')}|${normalizeForBucketKey(t.category || '')}|${t.group}`,
      );
      return;
    }

    if (!lookbackSet.has(tMonthKey)) return;

    if (t.group === 'loan' && !isLoanStillActive(t.loanEndMonth, target.year, target.month)) return;
    if (matchesBlacklist(t.description || '', t.category || '', fullBlacklist)) return;

    const descKey = normalizeForBucketKey(t.description || '');
    const catKey = normalizeForBucketKey(t.category || '');
    const bucketKey = `${descKey}|${catKey}|${t.group}`;
    const amount = Math.abs(Number(t.amount) || 0);
    const occurrence: Occurrence = { day: dayOfMonth(t.date), amount, date: tDate };

    const existing = buckets.get(bucketKey);
    if (existing) {
      const monthOccurrences = existing.occurrencesByMonth.get(tMonthKey);
      if (monthOccurrences) monthOccurrences.push(occurrence);
      else existing.occurrencesByMonth.set(tMonthKey, [occurrence]);
      if (tDate.getTime() > existing.latestSeenAt.getTime()) {
        existing.latestSeenAt = tDate;
        existing.descriptionDisplay = (t.description || '').trim() || existing.descriptionDisplay;
        existing.categoryDisplay = (t.category || '').trim() || existing.categoryDisplay;
        existing.paymentMethod = t.paymentMethod;
        existing.loanEndMonth = t.loanEndMonth;
      }
    } else {
      const monthOccurrences = new Map<string, Occurrence[]>();
      monthOccurrences.set(tMonthKey, [occurrence]);
      buckets.set(bucketKey, {
        key: bucketKey,
        descriptionDisplay: (t.description || '').trim(),
        categoryDisplay: (t.category || '').trim(),
        group: t.group,
        paymentMethod: t.paymentMethod,
        occurrencesByMonth: monthOccurrences,
        latestSeenAt: tDate,
        loanEndMonth: t.loanEndMonth,
      });
    }
  });

  const suggestions: AutoFillSuggestion[] = [];
  buckets.forEach(b => {
    const monthArrays = Array.from(b.occurrencesByMonth.values());
    if (monthArrays.length === 0) return;

    const maxPerMonth = Math.max(...monthArrays.map(arr => arr.length));
    const signature = `${normalizeForBucketKey(b.descriptionDisplay)}|${normalizeForBucketKey(b.categoryDisplay)}|${b.group}`;
    const alreadyExists = targetMonthSignatures.has(signature);

    for (let slot = 0; slot < maxPerMonth; slot += 1) {
      const slotEntries: Occurrence[] = [];
      const slotMonthKeys: string[] = [];
      b.occurrencesByMonth.forEach((monthOccurrences, mKey) => {
        const sorted = monthOccurrences.slice().sort((a, c) => a.day - c.day);
        if (sorted[slot]) {
          slotEntries.push(sorted[slot]);
          slotMonthKeys.push(mKey);
        }
      });
      // Strict mode: only emit a slot if it has an entry in EVERY closed
      // month of the current year. If even one month is missing, drop it.
      // SAFETY: when there are fewer than 2 closed months (Jan/early Feb),
      // a single occurrence would otherwise become a "recurring" suggestion.
      // Require at least 2 closed months before the strict-equality check
      // can call something fixed - otherwise refuse to suggest.
      if (requiredMonthsCount < 2) continue;
      if (slotEntries.length < requiredMonthsCount) continue;
      if (slotEntries.length === 0) continue;

      const avgDay = Math.round(slotEntries.reduce((s, x) => s + x.day, 0) / slotEntries.length);
      const avgAmount = slotEntries.reduce((s, x) => s + x.amount, 0) / slotEntries.length;
      const slotKey = maxPerMonth > 1 ? `${b.key}#slot${slot + 1}` : b.key;

      suggestions.push({
        key: slotKey,
        description: b.descriptionDisplay,
        category: b.categoryDisplay,
        group: b.group,
        type: 'expense',
        paymentMethod: b.paymentMethod,
        averageAmount: Math.round(avgAmount * 100) / 100,
        monthlyAmounts: slotEntries.map(e => e.amount),
        monthsAppeared: slotMonthKeys.sort(),
        proposedDate: buildProposedDate(target.year, target.month, avgDay),
        loanEndMonth: b.loanEndMonth,
        alreadyExistsInTargetMonth: alreadyExists,
      });
    }
  });

  // Sort by group then description
  const groupOrder: Record<TransactionGroup, number> = {
    fee: 0,
    other_income: 1,
    operational: 2,
    tax: 3,
    loan: 4,
    personal: 5,
    bank_adjustment: 6,
  };
  suggestions.sort((a, b) => {
    const g = (groupOrder[a.group] ?? 99) - (groupOrder[b.group] ?? 99);
    if (g !== 0) return g;
    return a.description.localeCompare(b.description, 'he');
  });

  return suggestions;
};

export const getDefaultTargetMonth = (today = new Date()): { year: number; month: number } => {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
};

export const formatTargetMonthLabel = (target: { year: number; month: number }): string => {
  const date = new Date(target.year, target.month, 1);
  return date.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
};

export const formatLookbackLabel = (
  _target: { year: number; month: number },
  today: Date = new Date(),
): string => {
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth();
  const labels: string[] = [];
  for (let m = 0; m < currentMonthIdx; m += 1) {
    const d = new Date(currentYear, m, 1);
    labels.push(d.toLocaleDateString('he-IL', { month: 'long' }));
  }
  return labels.length > 0 ? labels.join(' / ') : 'אין חודשים שנסגרו השנה';
};
