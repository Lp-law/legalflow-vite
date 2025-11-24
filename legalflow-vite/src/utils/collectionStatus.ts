import { parseDateKey } from './date';

const OVERDUE_THRESHOLD_DAYS = 45;

export const calculateDaysSince = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) {
    return null;
  }

  try {
    const date = parseDateKey(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) {
      return 0;
    }
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
};

export const calculateOverdueDays = (demandDate: string | null | undefined, isPaid: boolean): number | null => {
  if (isPaid) {
    return null;
  }

  const daysSince = calculateDaysSince(demandDate);
  if (daysSince === null || daysSince <= OVERDUE_THRESHOLD_DAYS) {
    return null;
  }

  return daysSince - OVERDUE_THRESHOLD_DAYS;
};

export const isOverdue = (demandDate: string | null | undefined, isPaid: boolean): boolean =>
  calculateOverdueDays(demandDate, isPaid) !== null;

export const formatOverdueLabel = (overdueDays: number | null): string | null =>
  overdueDays !== null ? `+${overdueDays} ימים` : null;

export { OVERDUE_THRESHOLD_DAYS };

