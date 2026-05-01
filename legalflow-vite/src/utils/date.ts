export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse a YYYY-MM-DD date key into a Date.
 *
 * Returns an Invalid Date (`new Date(NaN)`) for empty or unparseable input
 * rather than silently falling back to "today" - that fallback used to
 * silently corrupt transactions whose date field was missing or malformed
 * (they would be permanently rewritten to today on the next load).
 *
 * Callers MUST check `Number.isNaN(result.getTime())` before using the
 * result, or use `parseDateKeyOrToday()` if they explicitly want a fallback.
 */
export const parseDateKey = (dateKey: string | undefined | null): Date => {
  if (!dateKey || typeof dateKey !== 'string') {
    return new Date(NaN);
  }

  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return new Date(NaN);
  }

  // Validate day fits the month (e.g., reject Feb 30 -> would silently roll over)
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return new Date(NaN);
  }

  return candidate;
};

export const parseDateKeyOrToday = (dateKey: string | undefined | null): Date => {
  const parsed = parseDateKey(dateKey);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const isValidDateKey = (dateKey: string | undefined | null): boolean => {
  return !Number.isNaN(parseDateKey(dateKey).getTime());
};
