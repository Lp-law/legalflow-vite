import type { Transaction, TransactionGroup } from '../types';
import { parseDateKey } from '../utils/date';

export type MonthlyPerformanceInsight = {
  monthKey: string;
  netProfit: number;
  referenceAverage: number;
  deviationPercent: number;
};

export type SlowClientInsight = {
  clientName: string;
  averageDelay: number;
  pendingAmount: number;
};

export type CashflowInsights = {
  weakMonths: MonthlyPerformanceInsight[];
  slowClients: SlowClientInsight[];
  referenceWindowSize: number;
};

export type InsightAlert = {
  id: string;
  severity: 'info' | 'warning' | 'high';
  message: string;
  relatedMonth?: string;
  relatedClient?: string;
};

export type CategorySuggestion = {
  category: string;
  confidence: number;
  reason?: string;
};

const INCOME_GROUPS: TransactionGroup[] = ['fee', 'other_income'];
const EXPENSE_GROUPS: TransactionGroup[] = ['operational', 'tax', 'loan', 'personal'];
const BANK_ADJUSTMENT_GROUP: TransactionGroup = 'bank_adjustment';

const MONTH_NAMES = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' });

const normalizeMonthKey = (dateKey: string) => dateKey.slice(0, 7);

const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return MONTH_NAMES.format(new Date(year, month - 1, 1));
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export const analyzeCashflow = (
  transactions: Transaction[],
  window = 3
): CashflowInsights => {
  const monthlyMap = new Map<
    string,
    { income: number; expenses: number; bankAdjustments: number }
  >();

  transactions.forEach(transaction => {
    const monthKey = normalizeMonthKey(transaction.date);
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { income: 0, expenses: 0, bankAdjustments: 0 });
    }

    const bucket = monthlyMap.get(monthKey)!;
    const amount = Math.abs(transaction.amount);
    if (INCOME_GROUPS.includes(transaction.group)) {
      bucket.income += amount;
    } else if (EXPENSE_GROUPS.includes(transaction.group)) {
      bucket.expenses += amount;
    } else if (transaction.group === BANK_ADJUSTMENT_GROUP) {
      bucket.bankAdjustments += transaction.amount;
    }
  });

  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  const weakMonths: MonthlyPerformanceInsight[] = [];
  sortedMonths.forEach((monthKey, index) => {
    const bucket = monthlyMap.get(monthKey)!;
    const netProfit = bucket.income - bucket.expenses + bucket.bankAdjustments;
    const referenceWindow = sortedMonths.slice(Math.max(0, index - window), index);
    if (!referenceWindow.length) {
      return;
    }
    const referenceAverage = average(
      referenceWindow.map(referenceMonth => {
        const referenceBucket = monthlyMap.get(referenceMonth)!;
        return referenceBucket.income - referenceBucket.expenses + referenceBucket.bankAdjustments;
      })
    );
    if (referenceAverage <= 0) {
      return;
    }
    const deviationPercent = ((netProfit - referenceAverage) / referenceAverage) * 100;
    if (deviationPercent <= -15) {
      weakMonths.push({
        monthKey,
        netProfit,
        referenceAverage,
        deviationPercent,
      });
    }
  });

  const today = new Date();
  const slowClientMap = new Map<
    string,
    { accumDelay: number; count: number; pendingAmount: number }
  >();

  transactions.forEach(transaction => {
    if (!INCOME_GROUPS.includes(transaction.group)) return;
    if (transaction.status !== 'pending') return;

    const clientKey =
      transaction.clientReference?.trim() ||
      transaction.description?.trim() ||
      'לקוח לא מזוהה';
    const txDate = parseDateKey(transaction.date);
    const delay = Math.max(0, (today.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));

    if (!slowClientMap.has(clientKey)) {
      slowClientMap.set(clientKey, { accumDelay: 0, count: 0, pendingAmount: 0 });
    }

    const bucket = slowClientMap.get(clientKey)!;
    bucket.accumDelay += delay;
    bucket.count += 1;
    bucket.pendingAmount += Math.abs(transaction.amount);
  });

  const slowClients: SlowClientInsight[] = [];
  slowClientMap.forEach((bucket, clientName) => {
    if (!bucket.count) return;
    const averageDelay = bucket.accumDelay / bucket.count;
    if (averageDelay < 30) return;
    slowClients.push({
      clientName,
      averageDelay: Math.round(averageDelay),
      pendingAmount: bucket.pendingAmount,
    });
  });

  slowClients.sort((a, b) => b.averageDelay - a.averageDelay);

  return {
    weakMonths,
    slowClients,
    referenceWindowSize: window,
  };
};

export const generateAlerts = (insights: CashflowInsights): InsightAlert[] => {
  const alerts: InsightAlert[] = [];

  insights.weakMonths.forEach(month => {
    alerts.push({
      id: `weak-month-${month.monthKey}`,
      severity: month.deviationPercent <= -30 ? 'high' : 'warning',
      message: `בחודש ${formatMonthLabel(
        month.monthKey
      )} הרווח הנקי היה נמוך ב-${Math.abs(month.deviationPercent).toFixed(
        1
      )}% מהממוצע של ${insights.referenceWindowSize} החודשים שקדמו לו.`,
      relatedMonth: month.monthKey,
    });
  });

  insights.slowClients.forEach(client => {
    alerts.push({
      id: `slow-client-${client.clientName}`,
      severity: client.averageDelay >= 60 ? 'high' : 'warning',
      message: `הלקוח "${client.clientName}" משלם בממוצע לאחר ${client.averageDelay} ימים, עם חוב פתוח של ‎${Math.round(
        client.pendingAmount
      ).toLocaleString('he-IL')} ₪.`,
      relatedClient: client.clientName,
    });
  });

  return alerts;
};

const KEYWORD_CATEGORY_MAP: Record<string, string> = {
  טרם: 'שכר טרחה',
  לוידס: 'שכר טרחה',
  ריגוס: 'הוצאות משרד',
  regus: 'הוצאות משרד',
  שכירות: 'שכר דירה',
  דמי: 'שכר דירה',
  נסיעה: 'נסיעות',
  טיסה: 'נסיעות',
};

const DEFAULT_CATEGORY_BY_GROUP: Partial<Record<TransactionGroup, string>> = {
  fee: 'שכר טרחה',
  other_income: 'הכנסות אחרות',
  operational: 'הוצאות משרד',
  tax: 'מיסים',
  loan: 'הלוואות',
  personal: 'משיכות פרטיות',
  bank_adjustment: 'התאמת בנק',
};

const computeSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  const shorter = a.length > b.length ? b : a;
  const longer = a.length > b.length ? a : b;
  let same = 0;
  for (let i = 0; i < shorter.length; i += 1) {
    if (longer.includes(shorter[i])) {
      same += 1;
    }
  }
  return same / longer.length;
};

export const suggestCategoryForTransaction = (
  draft: Partial<Transaction>,
  history: Transaction[] = []
): CategorySuggestion | null => {
  const normalizedDescription = (draft.description || '').trim().toLowerCase();
  if (!normalizedDescription && !history.length) {
    return null;
  }

  for (const keyword of Object.keys(KEYWORD_CATEGORY_MAP)) {
    if (normalizedDescription.includes(keyword)) {
      return {
        category: KEYWORD_CATEGORY_MAP[keyword],
        confidence: 0.95,
        reason: `זוהה ביטוי "${keyword}"`,
      };
    }
  }

  if (history.length && normalizedDescription) {
    const similar = history
      .filter(item => item.category && item.category.trim())
      .map(item => ({
        similarity: computeSimilarity(normalizedDescription, item.description?.toLowerCase() || ''),
        category: item.category,
      }))
      .filter(item => item.similarity >= 0.45)
      .sort((a, b) => b.similarity - a.similarity);
    if (similar.length) {
      return {
        category: similar[0].category!,
        confidence: Math.min(0.9, similar[0].similarity),
        reason: 'נבחר לפי תנועות דומות בעבר',
      };
    }
  }

  if (draft.group && DEFAULT_CATEGORY_BY_GROUP[draft.group]) {
    return {
      category: DEFAULT_CATEGORY_BY_GROUP[draft.group]!,
      confidence: 0.5,
      reason: 'ברירת מחדל לפי קבוצה',
    };
  }

  return null;
};

// Future extension:
// analyzeWithLLM(transactions) could call a real LLM / AI service and return the same types.
// When integrating an external provider, keep this file as the orchestration layer so the UI code does not change.


