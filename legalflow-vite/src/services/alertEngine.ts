import type {
  Transaction,
  TransactionGroup,
  LloydsCollectionItem,
  GenericCollectionItem,
  AccessCollectionItem,
  BaseCollectionItem,
} from '../types';
import { calculateOverdueDays } from '../utils/collectionStatus';
import { parseDateKey } from '../utils/date';

const EXPENSE_GROUPS: TransactionGroup[] = ['operational', 'tax', 'loan', 'personal'];
const MS_IN_DAY = 1000 * 60 * 60 * 24;

export type AlertSeverity = 'info' | 'warning' | 'high';
export type AlertCategory = 'collection_overdue' | 'cashflow_expense' | 'cashflow_client';
export type AlertTrackerType = 'lloyds' | 'generic' | 'access';

export type AlertTarget =
  | {
      type: 'collection';
      tracker: AlertTrackerType;
      itemId: string;
    }
  | {
      type: 'flow';
      date: string;
      transactionIds?: string[];
      group?: TransactionGroup;
    }
  | {
    type: 'dashboard';
    section?: 'insights' | 'forecast';
  };

export interface UnifiedAlert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  trackerLabel?: string;
  accountNumber?: string;
  demandDate?: string | null;
  amount?: number;
  overdueDays?: number;
  target?: AlertTarget;
}

export interface AlertBundle {
  alerts: UnifiedAlert[];
  counts: {
    total: number;
    bySeverity: Record<AlertSeverity, number>;
    collection: number;
  };
}

const severityWeight: Record<AlertSeverity, number> = {
  high: 2,
  warning: 1,
  info: 0,
};

const trackerLabel: Record<AlertTrackerType, string> = {
  lloyds: 'לוידס',
  generic: 'לקוחות שונים',
  access: 'אקסס',
};

const formatCurrency = (value: number) =>
  `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

const getMonthKey = (date: string) => date.slice(0, 7);

const formatMonth = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
};

const diffInDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / MS_IN_DAY);

const buildOverdueAlerts = (
  items: BaseCollectionItem[],
  tracker: AlertTrackerType
): UnifiedAlert[] => {
  const alerts: UnifiedAlert[] = [];

  items.forEach(item => {
    const overdueDays = calculateOverdueDays(item.demandDate, item.isPaid);
    if (overdueDays === null) return;

    alerts.push({
      id: `overdue-${tracker}-${item.id}`,
      title: `חוב מתעכב – ${trackerLabel[tracker]}`,
      description: `מס' חשבון ${item.accountNumber} בפיגור של ${overdueDays} ימים.`,
      severity: overdueDays >= 90 ? 'high' : 'warning',
      category: 'collection_overdue',
      trackerLabel: trackerLabel[tracker],
      accountNumber: item.accountNumber,
      demandDate: item.demandDate,
      amount: item.amount,
      overdueDays,
      target: { type: 'collection', tracker, itemId: item.id },
    });
  });

  return alerts;
};

const buildExpenseSpikeAlert = (transactions: Transaction[]): UnifiedAlert[] => {
  const monthlyTotals = new Map<string, number>();
  const monthlyTransactions = new Map<string, Transaction[]>();

  transactions.forEach(tx => {
    if (!EXPENSE_GROUPS.includes(tx.group)) return;
    const key = getMonthKey(tx.date);
    monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + Math.abs(tx.amount));
    const list = monthlyTransactions.get(key) || [];
    list.push(tx);
    monthlyTransactions.set(key, list);
  });

  const months = Array.from(monthlyTotals.keys()).sort();
  if (months.length < 2) return [];

  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const currentTotal = monthlyTotals.get(currentMonth) ?? 0;
  const previousTotal = monthlyTotals.get(previousMonth) ?? 0;

  if (previousTotal === 0) return [];

  const growth = (currentTotal - previousTotal) / previousTotal;
  if (growth <= 0.25) return [];

  const lastMonthTransactions = monthlyTransactions.get(currentMonth) ?? [];
  const anchorTransaction = lastMonthTransactions.reduce<Transaction | null>((prev, curr) => {
    if (!prev) return curr;
    return Math.abs(curr.amount) > Math.abs(prev.amount) ? curr : prev;
  }, null);

  return [
    {
      id: `expense-${currentMonth}`,
      title: 'קפיצה בהוצאות',
      description: `הוצאות ${formatMonth(currentMonth)} עלו ב-${Math.round(growth * 100)}% לעומת ${formatMonth(
        previousMonth
      )}.`,
      severity: growth >= 0.4 ? 'high' : 'warning',
      category: 'cashflow_expense',
      target: anchorTransaction
        ? {
            type: 'flow',
            date: anchorTransaction.date,
            transactionIds: [anchorTransaction.id],
            group: anchorTransaction.group,
          }
        : { type: 'dashboard', section: 'insights' },
    },
  ];
};

const buildClientTrendAlerts = (
  lloyds: LloydsCollectionItem[],
  generic: GenericCollectionItem[],
  access: AccessCollectionItem[],
  today: Date
): UnifiedAlert[] => {
  type TrendEntry = {
    recent: Array<{ days: number; tracker: AlertTrackerType; itemId: string }>;
    baseline: number[];
  };

  const grouped = new Map<string, TrendEntry>();
  const append = (tracker: AlertTrackerType, item: BaseCollectionItem) => {
    if (!item.demandDate || !item.updatedAt || !item.isPaid) return;
    const demandDate = parseDateKey(item.demandDate);
    const paidDate = parseDateKey(item.updatedAt);
    const cycleDays = diffInDays(demandDate, paidDate);
    if (cycleDays <= 0) return;
    const daysSincePaid = diffInDays(paidDate, today);
    const label =
      tracker === 'lloyds'
        ? (item as LloydsCollectionItem).claimantName || (item as LloydsCollectionItem).insuredName || 'ללא שם'
        : tracker === 'generic'
        ? (item as GenericCollectionItem).clientName || (item as GenericCollectionItem).caseName || 'ללא שם'
        : (item as AccessCollectionItem).insuredName || (item as AccessCollectionItem).caseName || 'ללא שם';

    if (!grouped.has(label)) {
      grouped.set(label, { recent: [], baseline: [] });
    }
    const bucket = grouped.get(label)!;
    if (daysSincePaid <= 30) {
      bucket.recent.push({ days: cycleDays, tracker, itemId: item.id });
    } else if (daysSincePaid <= 120) {
      bucket.baseline.push(cycleDays);
    }
  };

  lloyds.forEach(item => append('lloyds', item));
  generic.forEach(item => append('generic', item));
  access.forEach(item => append('access', item));

  const alerts: UnifiedAlert[] = [];

  grouped.forEach((bucket, client) => {
    if (!bucket.recent.length || bucket.baseline.length < 2) return;
    const recentAvg = bucket.recent.reduce((sum, entry) => sum + entry.days, 0) / bucket.recent.length;
    const baselineAvg = bucket.baseline.reduce((sum, entry) => sum + entry, 0) / bucket.baseline.length;
    if (baselineAvg <= 0 || recentAvg <= baselineAvg * 1.3) return;
    const representative = bucket.recent.sort((a, b) => b.days - a.days)[0];

    alerts.push({
      id: `client-trend-${client}`,
      title: 'זמן גבייה מתארך',
      description: `"${client}" משלם בממוצע לאחר ${Math.round(recentAvg)} ימים לעומת ${Math.round(
        baselineAvg
      )} ב-3 החודשים האחרונים.`,
      severity: recentAvg >= baselineAvg * 1.6 ? 'high' : 'warning',
      category: 'cashflow_client',
      target: {
        type: 'collection',
        tracker: representative.tracker,
        itemId: representative.itemId,
      },
    });
  });

  return alerts;
};

export const buildUnifiedAlerts = (
  transactions: Transaction[],
  lloyds: LloydsCollectionItem[],
  generic: GenericCollectionItem[],
  access: AccessCollectionItem[],
  today: Date = new Date()
): AlertBundle => {
  const alerts: UnifiedAlert[] = [
    ...buildOverdueAlerts(lloyds, 'lloyds'),
    ...buildOverdueAlerts(generic, 'generic'),
    ...buildOverdueAlerts(access, 'access'),
    ...buildExpenseSpikeAlert(transactions),
    ...buildClientTrendAlerts(lloyds, generic, access, today),
  ];

  alerts.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);

  const counts: AlertBundle['counts'] = {
    total: alerts.length,
    bySeverity: { info: 0, warning: 0, high: 0 },
    collection: alerts.filter(alert => alert.category === 'collection_overdue').length,
  };

  alerts.forEach(alert => {
    counts.bySeverity[alert.severity] += 1;
  });

  return { alerts, counts };
};

