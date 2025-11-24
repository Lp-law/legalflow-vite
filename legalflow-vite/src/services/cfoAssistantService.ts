import { addTotals, type CashflowRow } from '../utils/cashflow';
import { formatDateKey, parseDateKey } from '../utils/date';
import type { Transaction, TransactionGroup } from '../types';

const HEBREW_CURRENCY = new Intl.NumberFormat('he-IL', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const MS_IN_DAY = 1000 * 60 * 60 * 24;
const BALANCE_THRESHOLD = -150_000;
const INCOME_GROUPS: TransactionGroup[] = ['fee', 'other_income'];
const EXPENSE_GROUPS: TransactionGroup[] = ['operational', 'tax', 'loan', 'personal'];

const buildEmptyRow = (dateKey: string): CashflowRow => ({
  date: dateKey,
  salary: 0,
  otherIncome: 0,
  loans: 0,
  withdrawals: 0,
  expenses: 0,
  taxes: 0,
  bankAdjustments: 0,
});

const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

const formatCurrency = (value: number) => `${HEBREW_CURRENCY.format(Math.round(value))} ₪`;

const incrementRowValue = (value: CashflowRow[keyof CashflowRow], amount: number) => {
  const numeric = Number(value) || 0;
  return numeric + amount;
};

const findRowOnOrBefore = (rows: CashflowRow[], targetKey: string) => {
  const targetDate = parseDateKey(targetKey);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const rowDate = parseDateKey(rows[i].date);
    if (rowDate.getTime() <= targetDate.getTime()) {
      return rows[i];
    }
  }
  return undefined;
};

export function buildDailyWhatsappSummary(
  transactions: Transaction[],
  initialBalance: number,
  today: Date
): string {
  const todayKey = formatDateKey(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const horizonEnd = new Date(monthEnd);
  horizonEnd.setDate(horizonEnd.getDate() + 10);

  const normalizedTransactions = transactions.map(transaction => ({
    ...transaction,
    date: formatDateKey(parseDateKey(transaction.date)),
  }));

  const sortedDates = normalizedTransactions
    .map(t => parseDateKey(t.date))
    .sort((a, b) => a.getTime() - b.getTime());

  const earliestTransactionDate = sortedDates[0] ?? monthStart;
  const latestTransactionDate = sortedDates[sortedDates.length - 1] ?? today;

  const rangeStart = new Date(Math.min(earliestTransactionDate.getTime(), monthStart.getTime()));
  const rangeEnd = new Date(Math.max(latestTransactionDate.getTime(), horizonEnd.getTime()));

  const rows: CashflowRow[] = [];
  const cursor = new Date(rangeStart);
  while (cursor.getTime() <= rangeEnd.getTime()) {
    rows.push(buildEmptyRow(formatDateKey(cursor)));
    cursor.setDate(cursor.getDate() + 1);
  }

  const rowMap = new Map(rows.map(row => [row.date, row]));

  normalizedTransactions.forEach(transaction => {
    const row = rowMap.get(transaction.date);
    if (!row) return;

    const absoluteAmount = Math.abs(transaction.amount);
    switch (transaction.group) {
      case 'fee':
        row.salary = incrementRowValue(row.salary, absoluteAmount);
        break;
      case 'other_income':
        row.otherIncome = incrementRowValue(row.otherIncome, absoluteAmount);
        break;
      case 'operational':
        row.expenses = incrementRowValue(row.expenses, absoluteAmount);
        break;
      case 'tax':
        row.taxes = incrementRowValue(row.taxes, absoluteAmount);
        break;
      case 'loan':
        row.loans = incrementRowValue(row.loans, absoluteAmount);
        break;
      case 'personal':
        row.withdrawals = incrementRowValue(row.withdrawals, absoluteAmount);
        break;
      case 'bank_adjustment':
        row.bankAdjustments = incrementRowValue(row.bankAdjustments, transaction.amount);
        break;
      default:
        break;
    }
  });

  const enrichedRows = addTotals(rows, initialBalance);
  const todayRow = findRowOnOrBefore(enrichedRows, todayKey);
  const monthEndRow = findRowOnOrBefore(enrichedRows, formatDateKey(monthEnd));

  const currentBalance = todayRow?.balance ?? initialBalance;
  const projectedMonthEndBalance = monthEndRow?.balance ?? currentBalance;

  const firstThresholdBreach = enrichedRows.find(row => {
    const rowDate = parseDateKey(row.date);
    return (
      rowDate.getTime() >= parseDateKey(todayKey).getTime() &&
      rowDate.getTime() <= horizonEnd.getTime() &&
      typeof row.balance === 'number' &&
      row.balance < BALANCE_THRESHOLD
    );
  });

  const todaysTransactions = normalizedTransactions.filter(tx => tx.date === todayKey);
  const sumByGroup = (group: TransactionGroup) =>
    todaysTransactions
      .filter(tx => tx.group === group)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const bankAdjustmentToday = todaysTransactions
    .filter(tx => tx.group === 'bank_adjustment')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const feeToday = sumByGroup('fee');
  const otherIncomeToday = sumByGroup('other_income');
  const expensesToday =
    EXPENSE_GROUPS.reduce((sum, group) => sum + sumByGroup(group), 0) + bankAdjustmentToday;

  const overduePending = normalizedTransactions.filter(tx => {
    if (tx.status !== 'pending') return false;
    if (!INCOME_GROUPS.includes(tx.group)) return false;
    const txDate = parseDateKey(tx.date);
    const diffDays = Math.floor((today.getTime() - txDate.getTime()) / MS_IN_DAY);
    return diffDays > 45;
  });

  const overdueSum = overduePending.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const overdueCount = overduePending.length;

  const lines: string[] = [];
  lines.push(`🧾 תקציר תזרים יומי – ${formatDisplayDate(today)}`);
  lines.push('');
  lines.push(`💰 יתרה נוכחית היום: ${formatCurrency(currentBalance)}`);
  lines.push(`📅 יתרה צפויה לסוף החודש: ${formatCurrency(projectedMonthEndBalance)}`);

  if (firstThresholdBreach && typeof firstThresholdBreach.balance === 'number') {
    lines.push(
      `⚠️ חריגה צפויה מתחת ל־${formatCurrency(BALANCE_THRESHOLD)} בתאריך ${formatDisplayDate(
        parseDateKey(firstThresholdBreach.date)
      )} (יתרה צפויה: ${formatCurrency(firstThresholdBreach.balance)}).`
    );
  } else {
    lines.push('✅ אין חריגה צפויה מתחת ל־‎-150,000 ₪ בעשרת הימים הקרובים.');
  }

  lines.push('');
  lines.push(`🧑‍⚖️ שכר טרחה היום: ${formatCurrency(feeToday)}`);
  lines.push(`➕ הכנסות אחרות היום: ${formatCurrency(otherIncomeToday)}`);
  lines.push(`💸 הוצאות היום: ${formatCurrency(expensesToday)}`);
  lines.push('');
  lines.push(
    `📂 חובות פתוחים מעל 45 יום: ${formatCurrency(overdueSum)} (${overdueCount} תיקים)`
  );
  lines.push('');

  if (firstThresholdBreach) {
    lines.push(
      '⚠️ מומלץ להאיץ גבייה בתיקים גדולים לפני מועד החריגה כדי לצמצם את העומק ביתרה השלילית.'
    );
  } else {
    lines.push('✅ מצב התזרים החודשי נראה מאוזן ביחס ליעד. מומלץ להמשיך במעקב גבייה שוטף.');
  }

  return lines.join('\n');
}


