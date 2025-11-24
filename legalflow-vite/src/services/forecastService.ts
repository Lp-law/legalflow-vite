import type { Transaction } from '../types';
import { parseDateKey } from '../utils/date';

export interface ForecastResult {
  forecast: number;
  confidenceLow: number;
  confidenceHigh: number;
  averageMonthlyIncome: number;
  pendingIncome: number;
  projectedWorkingIncome: number;
  weekendAdjustment: number;
  recurringExpenses: number;
  seasonalFactor: number;
}

interface ForecastInput {
  transactions: Transaction[];
  currentBalance: number;
  initialBalance: number;
  referenceDate?: Date;
  monthsForAverage?: number;
}

const RECURRING_KEYWORDS = [
  'משכורת',
  'שכר',
  'salary',
  'rent',
  'שכירות',
  'regus',
  "רג'ס",
  'רג׳ס',
  'רגוס',
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const formatMonthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}`;

const isSameMonth = (dateStr: string, reference: Date) => {
  const parsed = parseDateKey(dateStr);
  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth()
  );
};

const isRecurringExpense = (transaction: Transaction) => {
  if (transaction.type !== 'expense') return false;
  if (transaction.isRecurring) return true;
  const description = (transaction.description || '').toLowerCase();
  return RECURRING_KEYWORDS.some(keyword => description.includes(keyword.toLowerCase()));
};

export const calculateForecast = ({
  transactions,
  currentBalance,
  initialBalance,
  referenceDate = new Date(),
  monthsForAverage = 6,
}: ForecastInput): ForecastResult => {
  const today = referenceDate;
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysInMonth = endOfMonth.getDate();
  const daysRemaining = Math.max(0, endOfMonth.getDate() - today.getDate());

  // Monthly income history
  const monthlyStats: Record<
    string,
    {
      income: number;
      expense: number;
    }
  > = {};

  transactions.forEach(transaction => {
    const date = parseDateKey(transaction.date);
    const key = formatMonthKey(date);
    if (!monthlyStats[key]) {
      monthlyStats[key] = { income: 0, expense: 0 };
    }
    if (transaction.status === 'completed') {
      if (transaction.type === 'income') {
        monthlyStats[key].income += transaction.amount;
      } else if (transaction.type === 'expense') {
        monthlyStats[key].expense += Math.abs(transaction.amount);
      }
    }
  });

  const currentMonthKey = formatMonthKey(startOfMonth);
  const historicalKeys = Object.keys(monthlyStats)
    .filter(key => key !== currentMonthKey && parseInt(key.split('-')[0], 10) >= today.getFullYear() - 2)
    .sort();

  const relevantKeys = historicalKeys.slice(-monthsForAverage);
  const historicalIncomes = relevantKeys.map(key => monthlyStats[key].income);
  const averageMonthlyIncome =
    historicalIncomes.length > 0
      ? historicalIncomes.reduce((sum, value) => sum + value, 0) / historicalIncomes.length
      : 0;

  const variance =
    historicalIncomes.length > 1
      ? historicalIncomes.reduce((sum, value) => sum + Math.pow(value - averageMonthlyIncome, 2), 0) /
        (historicalIncomes.length - 1)
      : 0;
  const incomeStdDev = Math.sqrt(variance);

  // Seasonal adjustment
  const sameMonthKeys = Object.keys(monthlyStats).filter(key => {
    const [yearStr, monthStr] = key.split('-');
    const monthIndex = Number(monthStr) - 1;
    return monthIndex === startOfMonth.getMonth() && key !== currentMonthKey;
  });

  const sameMonthAverage =
    sameMonthKeys.length > 0
      ? sameMonthKeys.reduce((sum, key) => sum + monthlyStats[key].income, 0) / sameMonthKeys.length
      : 0;

  const baseline = averageMonthlyIncome || initialBalance || 1;
  const seasonalFactor =
    sameMonthAverage > 0 ? clamp(sameMonthAverage / baseline, 0.85, 1.15) : 1;

  // Pending incomes for current month
  const pendingIncome = transactions
    .filter(
      transaction =>
        transaction.type === 'income' &&
        transaction.status === 'pending' &&
        isSameMonth(transaction.date, today)
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  // Recurring expenses estimation
  const recurringHistory = transactions.filter(
    transaction =>
      isRecurringExpense(transaction) &&
      parseDateKey(transaction.date) < startOfMonth &&
      parseDateKey(transaction.date) >= new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 4, 1)
  );

  const averageRecurringExpense =
    recurringHistory.length > 0
      ? recurringHistory.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0) /
        recurringHistory.length
      : 0;

  const recurringThisMonth = transactions.some(
    transaction => isRecurringExpense(transaction) && isSameMonth(transaction.date, today)
  );

  const recurringExpenses = recurringThisMonth ? 0 : averageRecurringExpense;

  // Working days vs weekends
  let weekendDaysRemaining = 0;
  for (let day = today.getDate() + 1; day <= endOfMonth.getDate(); day += 1) {
    const sampleDate = new Date(today.getFullYear(), today.getMonth(), day);
    const dayOfWeek = sampleDate.getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      weekendDaysRemaining += 1;
    }
  }

  const workingDaysRemaining = Math.max(0, daysRemaining - weekendDaysRemaining);
  const averageDailyIncome = daysInMonth > 0 ? averageMonthlyIncome / daysInMonth : 0;
  const projectedWorkingIncome = averageDailyIncome * workingDaysRemaining;
  const weekendAdjustment = averageDailyIncome * weekendDaysRemaining * 0.4;

  const seasonalIncome =
    (pendingIncome + projectedWorkingIncome - weekendAdjustment) * seasonalFactor;

  const forecast =
    currentBalance +
    Math.max(0, seasonalIncome) -
    recurringExpenses;

  const confidencePct = clamp(
    historicalIncomes.length > 1 && averageMonthlyIncome > 0
      ? incomeStdDev / averageMonthlyIncome
      : 0.05,
    0.05,
    0.1
  );

  const confidenceLow = forecast * (1 - confidencePct);
  const confidenceHigh = forecast * (1 + confidencePct);

  return {
    forecast,
    confidenceLow,
    confidenceHigh,
    averageMonthlyIncome,
    pendingIncome,
    projectedWorkingIncome,
    weekendAdjustment,
    recurringExpenses,
    seasonalFactor,
  };
};

