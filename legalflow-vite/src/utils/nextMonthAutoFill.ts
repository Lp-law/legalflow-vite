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
 * Build proposed transactions for the target month by copying every expense,
 * loan and withdrawal from the SOURCE MONTH (the month immediately before
 * the target). Same amounts, same day-of-month - just shifted forward.
 *
 * Source resolution: `target month - 1` first; if that month has no
 * eligible rows, fall back to the most recent earlier month with data
 * (so the user isn't stuck with an empty modal when the previous month
 * happens to be uneventful).
 *
 * Auto-generated tax rows are skipped (they re-generate themselves from
 * fee income). Loans whose loanEndMonth has passed are skipped.
 * Blacklisted descriptions/categories are skipped.
 *
 * Each source row produces exactly one suggestion - duplicates within the
 * same month (e.g. two separate operational expenses on the 5th) all come
 * through, so the user sees a faithful copy of the source month.
 */
export const computeNextMonthSuggestions = (
  transactions: Transaction[],
  target: { year: number; month: number }, // month is 0-indexed
  userBlacklist: string[] = [],
): AutoFillSuggestion[] => {
  const fullBlacklist = [...DEFAULT_AUTOFILL_BLACKLIST, ...userBlacklist];
  const targetMonthKey = `${target.year}-${String(target.month + 1).padStart(2, '0')}`;

  // Group source-eligible transactions by month so we can pick the source.
  type EligibleEntry = { tx: Transaction; date: Date };
  const eligibleByMonth = new Map<string, EligibleEntry[]>();
  const targetMonthSignatures = new Set<string>();

  transactions.forEach(t => {
    if (!RECURRING_GROUPS.includes(t.group)) return;
    if (t.type !== 'expense') return;

    const tDate = parseDateKey(t.date);
    if (Number.isNaN(tDate.getTime())) return;
    const tMonthKey = monthKey(tDate);

    // Track signatures already in the target month so we can flag dupes.
    if (tMonthKey === targetMonthKey) {
      targetMonthSignatures.add(
        `${normalizeForBucketKey(t.description || '')}|${normalizeForBucketKey(t.category || '')}|${t.group}`,
      );
      return;
    }

    // Auto-generated tax rows are NOT a source for copy (the user's only
    // copyable groups are operational/loan/personal — RECURRING_GROUPS
    // already excludes 'tax', but be defensive).
    if (t.isAutoGenerated) return;

    // Source candidate: must be strictly before the target month.
    if (tMonthKey >= targetMonthKey) return;

    // Loan that's already expired — skip.
    if (t.group === 'loan' && !isLoanStillActive(t.loanEndMonth, target.year, target.month)) return;
    if (matchesBlacklist(t.description || '', t.category || '', fullBlacklist)) return;

    const list = eligibleByMonth.get(tMonthKey);
    if (list) list.push({ tx: t, date: tDate });
    else eligibleByMonth.set(tMonthKey, [{ tx: t, date: tDate }]);
  });

  // Pick source month: prefer (target - 1); else most recent month with data.
  const preferredSourceDate = new Date(target.year, target.month - 1, 1);
  const preferredSourceKey = monthKey(preferredSourceDate);
  let sourceMonthKey: string | null = null;
  if (eligibleByMonth.has(preferredSourceKey)) {
    sourceMonthKey = preferredSourceKey;
  } else {
    const candidateKeys = Array.from(eligibleByMonth.keys())
      .filter(k => k < targetMonthKey)
      .sort();
    sourceMonthKey = candidateKeys.length ? candidateKeys[candidateKeys.length - 1] : null;
  }
  if (!sourceMonthKey) return [];

  const sourceEntries = eligibleByMonth.get(sourceMonthKey) || [];

  const suggestions: AutoFillSuggestion[] = sourceEntries.map((entry, idx) => {
    const t = entry.tx;
    const day = dayOfMonth(t.date);
    const proposedDate = buildProposedDate(target.year, target.month, day);
    const amount = Math.abs(Number(t.amount) || 0);
    const signature = `${normalizeForBucketKey(t.description || '')}|${normalizeForBucketKey(t.category || '')}|${t.group}`;
    const alreadyExists = targetMonthSignatures.has(signature);

    return {
      key: `${t.id}#${idx}`,
      description: (t.description || '').trim(),
      category: (t.category || '').trim(),
      group: t.group,
      type: 'expense',
      paymentMethod: t.paymentMethod,
      averageAmount: amount, // exact, not averaged
      monthlyAmounts: [amount],
      monthsAppeared: [sourceMonthKey],
      proposedDate,
      loanEndMonth: t.loanEndMonth,
      alreadyExistsInTargetMonth: alreadyExists,
    };
  });

  // Sort by date then group then description for a tidy display.
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
    if (a.proposedDate !== b.proposedDate) return a.proposedDate.localeCompare(b.proposedDate);
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
  target: { year: number; month: number },
  _today: Date = new Date(),
): string => {
  // Source month for the copy = the month immediately before the target.
  // (E.g., target = June 2026 → source = May 2026.)
  const source = new Date(target.year, target.month - 1, 1);
  return source.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
};
