import { Transaction } from '../types';

export const generateExecutiveSummary = (
  period: 'month' | 'quarter' | 'year',
  transactions: Transaction[]
): string => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // Filter transactions based on period
  const relevantTransactions = transactions.filter(t => {
    const tDate = new Date(t.date);
    if (tDate.getFullYear() !== currentYear && period !== 'year') {
        // simple logic: if looking at monthly/quarterly, assume current year. 
        // For 'year' report, check specific year logic below if needed, but usually means "This Year".
        if (tDate.getFullYear() !== currentYear) return false; 
    }
    if (period === 'year' && tDate.getFullYear() !== currentYear) return false;

    if (period === 'month') {
      return tDate.getMonth() === currentMonth;
    } else if (period === 'quarter') {
      const currentQuarter = Math.floor(currentMonth / 3);
      const tQuarter = Math.floor(tDate.getMonth() / 3);
      return tQuarter === currentQuarter;
    }
    return true;
  });

  // Calculate basic stats
  const income = relevantTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = relevantTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - expenses;
  const profitMargin = income > 0 ? (net / income) * 100 : 0;

  // Group Analysis
  const expenseByGroup: Record<string, number> = {};
  relevantTransactions.filter(t => t.type === 'expense').forEach(t => {
      const g = t.group;
      expenseByGroup[g] = (expenseByGroup[g] || 0) + t.amount;
  });

  // Top Client Analysis (Income by Description)
  const clientIncome: Record<string, number> = {};
  relevantTransactions.filter(t => t.type === 'income').forEach(t => {
      // Assuming 'description' holds the client name or 'category' holds it? 
      // In TransactionForm, description is used for Client Name.
      const client = t.description || 'אחר'; 
      clientIncome[client] = (clientIncome[client] || 0) + t.amount;
  });
  const topClientEntry = Object.entries(clientIncome).sort((a, b) => b[1] - a[1])[0];

  // Pending Collection Analysis (Snapshot - All time)
  // Filter: Income + Pending + Category 'שכר טרחה'
  const pendingTransactions = transactions.filter(t => 
      t.type === 'income' && 
      t.status === 'pending' && 
      t.category === 'שכר טרחה'
  );
  const pendingAmount = pendingTransactions.reduce((s, t) => s + t.amount, 0);
  
  // Check for aging debts (> 30 days)
  const overdueCount = pendingTransactions.filter(t => {
      const days = Math.floor((now.getTime() - new Date(t.date).getTime()) / (1000 * 60 * 60 * 24));
      return days > 30;
  }).length;

  // Generate Text
  let periodText = '';
  switch(period) {
      case 'month': periodText = `חודש ${now.toLocaleString('he-IL', { month: 'long' })}`; break;
      case 'quarter': periodText = `רבעון ${Math.floor(currentMonth / 3) + 1}`; break;
      case 'year': periodText = `שנת ${currentYear}`; break;
  }

  return `
תקציר מנהלים - ${periodText}
עבור: משרד עו"ד ליאור פרי
תאריך הפקה: ${now.toLocaleDateString('he-IL')}
----------------------------------------

1. שורה תחתונה (פיננסית):
   סה"כ הכנסות: ₪${income.toLocaleString()}
   סה"כ הוצאות: ₪${expenses.toLocaleString()}
   -----------------------------------
   רווח נקי לתקופה: ₪${net.toLocaleString()} (${profitMargin.toFixed(1)}% רווחיות)

2. ניתוח הוצאות מרכזי:
   - תפעול שוטף: ₪${(expenseByGroup['operational'] || 0).toLocaleString()}
   - מיסים: ₪${(expenseByGroup['tax'] || 0).toLocaleString()}
   - החזרי הלוואות: ₪${(expenseByGroup['loan'] || 0).toLocaleString()}
   - משיכות אישיות: ₪${(expenseByGroup['personal'] || 0).toLocaleString()}

3. פעילות עסקית ולקוחות:
   ${topClientEntry ? `הלקוח המוביל בתקופה זו הוא "${topClientEntry[0]}" עם היקף של ₪${topClientEntry[1].toLocaleString()}.` : 'טרם נרשמו הכנסות בתקופה זו.'}

4. מצב גבייה (Snapshot עדכני):
   יתרת חוב לקוחות פתוחה (שכ"ט בלבד): ₪${pendingAmount.toLocaleString()}
   מספר דרישות תשלום פתוחות: ${pendingTransactions.length}
   ${overdueCount > 0 ? `⚠️ התראה: קיימים ${overdueCount} חשבונות בפיגור של מעל 30 יום!` : '✅ אין חריגות גבייה מעל 30 יום.'}

5. הערכת מצב ומסקנות:
${net > 0 ? 'המשרד נמצא במגמה חיובית.' : 'המשרד נמצא בגירעון לתקופה זו, יש לבחון את תזרים ההוצאות או מועדי הגבייה.'} 
${pendingAmount > 30000 ? 'המלצה: לבצע סבב טלפונים יזום לגביית חובות פתוחים.' : ''}

בברכה,
מערכת LegalFlow
`;
};