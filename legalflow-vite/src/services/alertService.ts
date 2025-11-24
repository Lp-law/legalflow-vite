import type {
  Transaction,
  TransactionGroup,
  LloydsCollectionItem,
  GenericCollectionItem,
  AccessCollectionItem,
  BaseCollectionItem,
} from '../types';
import { parseDateKey } from '../utils/date';

const MS_DAY = 1000 * 60 * 60 * 24;

export type CollectionAlertSource = 'lloyds' | 'generic' | 'access';

export interface CollectionAlert {
  id: string;
  source: CollectionAlertSource;
  itemId: string;
  severity: 'warning' | 'high';
  message: string;
  daysOverdue: number;
}

export interface CashflowAlert {
  id: string;
  severity: 'warning' | 'high';
  type: 'expense_spike' | 'client_collection_trend';
  message: string;
  relatedMonth?: string;
  relatedClient?: string;
  source?: CollectionAlertSource;
  itemId?: string;
}

const EXPENSE_GROUPS: TransactionGroup[] = ['operational', 'tax', 'loan', 'personal'];

const formatCurrency = (value: number) => `${Math.round(value).toLocaleString('he-IL')} ₪`;

const getMonthKey = (dateKey: string) => dateKey.slice(0, 7);

const formatMonth = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
};

const getClientLabel = (item: BaseCollectionItem, source: CollectionAlertSource) => {
  if (source === 'lloyds') {
    const lItem = item as LloydsCollectionItem;
    return lItem.claimantName || lItem.insuredName || 'ללא שם';
  }
  if (source === 'generic') {
    const gItem = item as GenericCollectionItem;
    return gItem.clientName || gItem.caseName || 'ללא שם';
  }
  const aItem = item as AccessCollectionItem;
  return aItem.insuredName || aItem.caseName || 'ללא שם';
};

const diffInDays = (start: Date, end: Date) => Math.floor((end.getTime() - start.getTime()) / MS_DAY);

export const detectCollectionRiskAlerts = (
  lloyds: LloydsCollectionItem[],
  generic: GenericCollectionItem[],
  access: AccessCollectionItem[],
  today: Date = new Date()
): CollectionAlert[] => {
  const alerts: CollectionAlert[] = [];
  const pushAlert = (source: CollectionAlertSource, item: BaseCollectionItem) => {
    if (!item.demandDate) return;
    const demandDate = parseDateKey(item.demandDate);
    const daysOverdue = diffInDays(demandDate, today);
    if (item.isPaid || daysOverdue < 90) return;
    alerts.push({
      id: `${source}-${item.id}`,
      source,
      itemId: item.id,
      severity: 'high',
      message: `חוב בן ${daysOverdue} ימים ללקוח "${getClientLabel(item, source)}" מסומן בסיכון גבוה.`,
      daysOverdue,
    });
  };

  lloyds.forEach(item => pushAlert('lloyds', item));
  generic.forEach(item => pushAlert('generic', item));
  access.forEach(item => pushAlert('access', item));
  return alerts;
};

export const detectExpenseSpikeAlert = (transactions: Transaction[]): CashflowAlert[] => {
  const monthlyExpenses = new Map<string, number>();
  transactions.forEach(tx => {
    if (!EXPENSE_GROUPS.includes(tx.group)) return;
    const monthKey = getMonthKey(tx.date);
    monthlyExpenses.set(monthKey, (monthlyExpenses.get(monthKey) || 0) + Math.abs(tx.amount));
  });
  const months = Array.from(monthlyExpenses.keys()).sort();
  if (months.length < 2) return [];
  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const lastValue = monthlyExpenses.get(lastMonth)!;
  const prevValue = monthlyExpenses.get(prevMonth)!;
  if (prevValue === 0) return [];
  const growth = (lastValue - prevValue) / prevValue;
  if (growth <= 0.25) return [];
  return [
    {
      id: `expense-spike-${lastMonth}`,
      severity: growth >= 0.4 ? 'high' : 'warning',
      type: 'expense_spike',
      message: `הוצאות החודש (${formatMonth(lastMonth)}) עלו ב-${Math.round(growth * 100)}% לעומת ${formatMonth(
        prevMonth
      )}.`,
      relatedMonth: lastMonth,
    },
  ];
};

export const detectClientCollectionTrendAlerts = (
  lloyds: LloydsCollectionItem[],
  generic: GenericCollectionItem[],
  access: AccessCollectionItem[],
  today: Date = new Date()
): CashflowAlert[] => {
  const alerts: CashflowAlert[] = [];
  const allItems: Array<{ source: CollectionAlertSource; item: BaseCollectionItem }> = [
    ...lloyds.map(item => ({ source: 'lloyds' as const, item })),
    ...generic.map(item => ({ source: 'generic' as const, item })),
    ...access.map(item => ({ source: 'access' as const, item })),
  ];

  const group = new Map<
    string,
    {
      recent: Array<{ days: number; source: CollectionAlertSource; itemId: string }>;
      baseline: number[];
    }
  >();

  allItems.forEach(({ source, item }) => {
    if (!item.isPaid || !item.demandDate || !item.updatedAt) return;
    const demand = parseDateKey(item.demandDate);
    const paidDate = parseDateKey(item.updatedAt);
    const days = diffInDays(demand, paidDate);
    if (days <= 0) return;
    const daysSincePaid = diffInDays(paidDate, today);
    const label = getClientLabel(item, source);
    if (!group.has(label)) {
      group.set(label, { recent: [], baseline: [] });
    }
    const bucket = group.get(label)!;
    if (daysSincePaid <= 30) {
      bucket.recent.push({ days, source, itemId: item.id });
    } else if (daysSincePaid <= 120) {
      bucket.baseline.push(days);
    }
  });

  group.forEach((bucket, client) => {
    if (!bucket.recent.length || bucket.baseline.length < 2) return;
    const recentAvg = bucket.recent.reduce((sum, entry) => sum + entry.days, 0) / bucket.recent.length;
    const baselineAvg = bucket.baseline.reduce((sum, entry) => sum + entry, 0) / bucket.baseline.length;
    if (baselineAvg <= 0) return;
    if (recentAvg <= baselineAvg * 1.3) return;

    const representative = bucket.recent.sort((a, b) => b.days - a.days)[0];
    alerts.push({
      id: `client-trend-${client}`,
      severity: recentAvg >= baselineAvg * 1.6 ? 'high' : 'warning',
      type: 'client_collection_trend',
      message: `זמן הגבייה הממוצע של "${client}" עלה ל-${Math.round(recentAvg)} ימים (לעומת ${Math.round(
        baselineAvg
      )} ב-3 החודשים הקודמים).`,
      relatedClient: client,
      source: representative.source,
      itemId: representative.itemId,
    });
  });

  return alerts;
};

export const buildAdvancedAlerts = (
  transactions: Transaction[],
  lloyds: LloydsCollectionItem[],
  generic: GenericCollectionItem[],
  access: AccessCollectionItem[]
) => {
  const collectionAlerts = detectCollectionRiskAlerts(lloyds, generic, access);
  const expenseAlerts = detectExpenseSpikeAlert(transactions);
  const clientTrendAlerts = detectClientCollectionTrendAlerts(lloyds, generic, access);

  return {
    collectionAlerts,
    cashflowAlerts: [...expenseAlerts, ...clientTrendAlerts],
  };
};


