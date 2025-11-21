import type { Transaction } from '../types';
import type { CashflowRow } from '../utils/cashflow';
import { addTotals, normalize } from '../utils/cashflow';
import { formatDateKey, parseDateKey } from '../utils/date';

type Period = 'month' | 'quarter' | 'year';

type PeriodRange = {
  start: Date;
  end: Date;
  label: string;
};

const formatCurrency = (value: number) =>
  `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

const getPeriodRange = (period: Period): PeriodRange => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === 'month') {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return {
      start,
      end,
      label: `חודש ${now.toLocaleString('he-IL', { month: 'long' })}`,
    };
  }

  if (period === 'quarter') {
    const quarter = Math.floor(month / 3);
    const startMonth = quarter * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return {
      start,
      end,
      label: `רבעון ${quarter + 1} ${year}`,
    };
  }

  const start = new Date(year, 0, 1);
  const end = new Date(year, 12, 0);
  return {
    start,
    end,
    label: `שנת ${year}`,
  };
};

const computeOpeningBalance = (
  transactions: Transaction[],
  initialBalance: number,
  startDate: Date
) => {
  const cutoff = startDate.getTime();
  const historicDelta = transactions
    .filter(
      (t) =>
        t.status === 'completed' && parseDateKey(t.date).getTime() < cutoff
    )
    .reduce((sum, t) => {
      if (t.type === 'income') return sum + t.amount;
      if (t.type === 'expense') return sum - t.amount;
      return sum;
    }, 0);

  return initialBalance + historicDelta;
};

const buildCashflowRows = (
  transactions: Transaction[],
  startDate: Date,
  endDate: Date,
  openingBalance: number
) => {
  const rows: CashflowRow[] = [];
  const rowMap: Record<string, CashflowRow> = {};
  const cursor = new Date(startDate);

  while (cursor.getTime() <= endDate.getTime()) {
    const dateStr = formatDateKey(cursor);
    const baseRow: CashflowRow = {
      date: dateStr,
      salary: 0,
      otherIncome: 0,
      loans: 0,
      withdrawals: 0,
      expenses: 0,
      taxes: 0,
      bankAdjustments: 0,
    };
    rows.push(baseRow);
    rowMap[dateStr] = baseRow;
    cursor.setDate(cursor.getDate() + 1);
  }

  transactions.forEach((t) => {
    const dateStr = t.date;
    const row = rowMap[dateStr];
    if (!row) return;
    const amount = Math.abs(t.amount);

    switch (t.group) {
      case 'fee':
        row.salary = (Number(row.salary) || 0) + amount;
        break;
      case 'other_income':
        row.otherIncome = (Number(row.otherIncome) || 0) + amount;
        break;
      case 'loan':
        row.loans = (Number(row.loans) || 0) + amount;
        break;
      case 'personal':
        row.withdrawals = (Number(row.withdrawals) || 0) + amount;
        break;
      case 'operational':
        row.expenses = (Number(row.expenses) || 0) + amount;
        break;
      case 'tax':
        row.taxes = (Number(row.taxes) || 0) + amount;
        break;
      case 'bank_adjustment':
        row.bankAdjustments =
          (Number(row.bankAdjustments) || 0) + t.amount;
        break;
      default:
        break;
    }
  });

  return addTotals(rows, openingBalance);
};

const describeDay = (
  label: string,
  row: CashflowRow | null | undefined
): string => {
  if (!row || typeof row.dailyTotal !== 'number') {
    return `   ${label}: לא נמצאו נתוני תזרים ליום זה.`;
  }
  const amount = row.dailyTotal;
  const descriptor =
    amount >= 0 ? 'תזרים חיובי' : 'תזרים שלילי';
  const date = parseDateKey(row.date).toLocaleDateString('he-IL');
  return `   ${label}: ${descriptor} של ${formatCurrency(
    Math.abs(amount)
  )} בתאריך ${date}`;
};

export const generateExecutiveSummary = (
  period: Period,
  transactions: Transaction[],
  initialBalance: number
): string => {
  const now = new Date();
  const range = getPeriodRange(period);

  const relevantTransactions = transactions.filter((t) => {
    const tTime = parseDateKey(t.date).getTime();
    return tTime >= range.start.getTime() && tTime <= range.end.getTime();
  });

  const openingBalance = computeOpeningBalance(
    transactions,
    initialBalance,
    range.start
  );

  const cashflowRows = buildCashflowRows(
    transactions,
    range.start,
    range.end,
    openingBalance
  );

  const netCashflow = cashflowRows.reduce(
    (sum, row) => sum + (row.dailyTotal ?? 0),
    0
  );
  const closingBalance = openingBalance + netCashflow;
  const bankAdjustmentNet = cashflowRows.reduce(
    (sum, row) => sum + normalize(row.bankAdjustments),
    0
  );

  const bestDay = cashflowRows.reduce((best, row) => {
    if (!best || (row.dailyTotal ?? -Infinity) > (best?.dailyTotal ?? -Infinity)) {
      return row;
    }
    return best;
  }, null as CashflowRow | null);

  const worstDay = cashflowRows.reduce((worst, row) => {
    if (
      !worst ||
      (row.dailyTotal ?? Infinity) < (worst?.dailyTotal ?? Infinity)
    ) {
      return row;
    }
    return worst;
  }, null as CashflowRow | null);

  const income = relevantTransactions
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const expenses = relevantTransactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const net = income - expenses;
  const profitMargin = income > 0 ? (net / income) * 100 : 0;

  const expenseByGroup: Record<string, number> = {};
  relevantTransactions
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      expenseByGroup[t.group] =
        (expenseByGroup[t.group] || 0) + t.amount;
    });

  const clientIncome: Record<string, number> = {};
  relevantTransactions
    .filter((t) => t.type === 'income')
    .forEach((t) => {
      const client = t.description || 'אחר';
      clientIncome[client] = (clientIncome[client] || 0) + t.amount;
    });
  const topClientEntry = Object.entries(clientIncome).sort(
    (a, b) => b[1] - a[1]
  )[0];

  const pendingTransactions = transactions.filter(
    (t) =>
      t.type === 'income' &&
      t.status === 'pending' &&
      t.category === 'שכר טרחה'
  );
  const pendingAmount = pendingTransactions.reduce(
    (s, t) => s + t.amount,
    0
  );
  const overdueCount = pendingTransactions.filter((t) => {
    const days =
      (now.getTime() - parseDateKey(t.date).getTime()) /
      (1000 * 60 * 60 * 24);
    return days > 30;
  }).length;

  const loanExpenses = expenseByGroup['loan'] || 0;

  return `
תקציר מנהלים - ${range.label}
עבור: משרד עו"ד ליאור פרי
תאריך הפקה: ${now.toLocaleDateString('he-IL')}
----------------------------------------

1. תזרים ויתרות:
   יתרת פתיחה מחושבת: ${formatCurrency(openingBalance)}
   תזרים נטו בתקופה: ${formatCurrency(netCashflow)}
   יתרת סיום צפויה: ${formatCurrency(closingBalance)}
${describeDay('   היום החיובי ביותר', bestDay)}
${describeDay('   היום המאתגר ביותר', worstDay)}
   התאמות בנק נטו: ${formatCurrency(bankAdjustmentNet)}

2. שורה תחתונה פיננסית:
   סה"כ הכנסות: ${formatCurrency(income)}
   סה"כ הוצאות: ${formatCurrency(expenses)}
   רווח נקי: ${formatCurrency(net)} (${profitMargin.toFixed(1)}% רווחיות)

3. ניתוח הוצאות מרכזי:
   - תפעול שוטף: ${formatCurrency(expenseByGroup['operational'] || 0)}
   - מיסים: ${formatCurrency(expenseByGroup['tax'] || 0)}
   - החזרי הלוואות: ${formatCurrency(loanExpenses)}
   - משיכות פרטיות: ${formatCurrency(expenseByGroup['personal'] || 0)}

4. פעילות עסקית ולקוחות:
   ${
     topClientEntry
       ? `הלקוח המוביל: "${topClientEntry[0]}" עם הכנסות של ${formatCurrency(
           topClientEntry[1]
         )}.`
       : 'טרם נרשמו הכנסות בתקופה זו.'
   }

5. מצב גבייה (זמן אמת):
   יתרת חוב פתוחה בשכר טרחה: ${formatCurrency(pendingAmount)}
   מספר דרישות תשלום פתוחות: ${pendingTransactions.length}
   ${
     overdueCount > 0
       ? `⚠️ קיימים ${overdueCount} חיובים מעל 30 יום – מומלץ טיפול מיידי.`
       : '✅ אין חריגות גבייה מעל 30 יום.'
   }

6. הערכת מצב ומסקנות:
${net > 0 ? '   המשרד מציג מגמה חיובית ויכולת כיסוי טובה.' : '   יש לבחון את מנועי ההכנסה או מבנה ההוצאות לשיפור.'}
${pendingAmount > 30000 ? '   המלצה: ליזום סבב גבייה אקטיבי בחודש הקרוב.' : ''}

בברכה,
מערכת LegalFlow
`;
};