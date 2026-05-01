import React, { useMemo, useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie
} from 'recharts';
import type { Transaction } from '../types';
import type { ForecastResult } from '../services/forecastService';
import { CATEGORIES } from '../constants';
import { TrendingUp, TrendingDown, Scale, Info, Activity, Download } from 'lucide-react';
import { exportToCSV } from '../services/exportService';
import { normalize, buildLedgerMapForRange } from '../utils/cashflow';
import type { CashflowRow } from '../utils/cashflow';
import { formatDateKey, parseDateKey } from '../utils/date';
import ChartBuilder from './ChartBuilder';

interface DashboardProps {
  transactions: Transaction[];
  initialBalance: number;
  forecastResult: ForecastResult;
}

const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  initialBalance,
  forecastResult,
}) => {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const startOfMonth = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today]
  );
  const endOfMonth = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + 1, 0),
    [today]
  );

  const committedTransactions = useMemo(
    () => transactions.filter(t => t.status === 'completed'),
    [transactions]
  );

  const daysInMonth = useMemo(() => {
    const days: Date[] = [];
    const date = new Date(startOfMonth);
    while (date.getMonth() === startOfMonth.getMonth()) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [startOfMonth]);

  const ledgerMap = useMemo(
    () =>
      buildLedgerMapForRange({
        transactions: committedTransactions,
        startDate: startOfMonth,
        endDate: endOfMonth,
        openingBalance: initialBalance,
      }),
    [committedTransactions, startOfMonth, endOfMonth, initialBalance]
  );

  const allMonthTransactions = useMemo(
    () =>
      transactions.filter(t => {
        const tDate = parseDateKey(t.date);
        return tDate >= startOfMonth && tDate <= endOfMonth;
      }),
    [transactions, startOfMonth, endOfMonth]
  );

  const allLedgerMap = useMemo(
    () =>
      buildLedgerMapForRange({
        transactions: transactions,
        startDate: startOfMonth,
        endDate: endOfMonth,
        openingBalance: initialBalance,
      }),
    [transactions, startOfMonth, endOfMonth, initialBalance]
  );

  const previousDayKey = useMemo(() => {
    const prev = new Date(startOfMonth);
    prev.setDate(prev.getDate() - 1);
    return formatDateKey(prev);
  }, [startOfMonth]);

  const openingBalance = useMemo(() => {
    const previousRow = ledgerMap.get(previousDayKey);
    return previousRow?.balance ?? initialBalance;
  }, [ledgerMap, previousDayKey, initialBalance]);

  const cashflowRows = useMemo(() => {
    return daysInMonth.map(day => {
      const dateKey = formatDateKey(day);
      const ledgerRow = ledgerMap.get(dateKey);
      if (ledgerRow) {
        return ledgerRow;
      }
      return {
        date: dateKey,
        salary: 0,
        otherIncome: 0,
        loans: 0,
        withdrawals: 0,
        expenses: 0,
        taxes: 0,
        bankAdjustments: 0,
        balance: openingBalance,
      } as CashflowRow;
    });
  }, [daysInMonth, ledgerMap, openingBalance]);

  const allCashflowRows = useMemo(() => {
    return daysInMonth.map(day => {
      const dateKey = formatDateKey(day);
      const ledgerRow = allLedgerMap.get(dateKey);
      if (ledgerRow) {
        return ledgerRow;
      }
      return {
        date: dateKey,
        salary: 0,
        otherIncome: 0,
        loans: 0,
        withdrawals: 0,
        expenses: 0,
        taxes: 0,
        bankAdjustments: 0,
        balance: openingBalance,
      } as CashflowRow;
    });
  }, [daysInMonth, allLedgerMap, openingBalance]);

  const todaysBalance = useMemo(() => {
    const todayRow = ledgerMap.get(todayKey);
    if (todayRow?.balance !== undefined) {
      return todayRow.balance;
    }
    const latestBalance = cashflowRows[cashflowRows.length - 1]?.balance;
    return latestBalance ?? openingBalance;
  }, [ledgerMap, todayKey, cashflowRows, openingBalance]);

  const projectedMonthEndBalance = useMemo(() => {
    const endKey = formatDateKey(endOfMonth);
    const endRow = allLedgerMap.get(endKey);
    if (endRow?.balance !== undefined) {
      return endRow.balance;
    }
    const fallbackBalance = allCashflowRows[allCashflowRows.length - 1]?.balance;
    return fallbackBalance ?? openingBalance;
  }, [allLedgerMap, endOfMonth, allCashflowRows, openingBalance]);

  const incomeTotal = useMemo(() => {
    return cashflowRows.reduce((sum, row) => {
      return (
        sum +
        Math.max(0, normalize(row.salary)) +
        Math.max(0, normalize(row.otherIncome)) +
        Math.max(0, normalize(row.bankAdjustments))
      );
    }, 0);
  }, [cashflowRows]);

  const expenseTotal = useMemo(() => {
    return allCashflowRows.reduce((sum, row) => {
      const loans = Math.abs(normalize(row.loans));
      const withdrawals = Math.abs(normalize(row.withdrawals));
      const expenses = Math.abs(normalize(row.expenses));
      const taxes = Math.abs(normalize(row.taxes));
      const bankAdjustments = Math.max(0, -normalize(row.bankAdjustments));
      return sum + loans + withdrawals + expenses + taxes + bankAdjustments;
    }, 0);
  }, [allCashflowRows]);

  const bankAdjustmentNet = useMemo(() => {
    return cashflowRows.reduce(
      (sum, row) => sum + normalize(row.bankAdjustments),
      0
    );
  }, [cashflowRows]);

  const totalsByGroup = useMemo(() => {
    const totals = {
      fee: 0,
      otherIncome: 0,
      operational: 0,
      taxes: 0,
      loans: 0,
      withdrawals: 0,
    };
    // Income totals from committed only (matches "הכנסות החודש" semantics)
    cashflowRows.forEach(row => {
      totals.fee += Math.max(0, normalize(row.salary));
      totals.otherIncome += Math.max(0, normalize(row.otherIncome));
    });
    // Expense totals from all transactions including pending (matches "הוצאות החודש" semantics)
    allCashflowRows.forEach(row => {
      totals.operational += Math.abs(normalize(row.expenses));
      totals.taxes += Math.abs(normalize(row.taxes));
      totals.loans += Math.abs(normalize(row.loans));
      totals.withdrawals += Math.abs(normalize(row.withdrawals));
    });
    return totals;
  }, [cashflowRows, allCashflowRows]);

  const [isChartBuilderOpen, setIsChartBuilderOpen] = useState(false);

  const chartData = useMemo(() => {
    if (allCashflowRows.length === 0) {
      return [];
    }

    return allCashflowRows.map(row => {
      const salary = Math.max(0, normalize(row.salary));
      const otherIncome = Math.max(0, normalize(row.otherIncome));
      const positiveBankAdjustments = Math.max(0, normalize(row.bankAdjustments));
      const negativeBankAdjustments = Math.max(0, -normalize(row.bankAdjustments));

      const income = salary + otherIncome + positiveBankAdjustments;
      const expense =
        Math.abs(normalize(row.loans)) +
        Math.abs(normalize(row.withdrawals)) +
        Math.abs(normalize(row.expenses)) +
        Math.abs(normalize(row.taxes)) +
        negativeBankAdjustments;

      return {
        date: row.date,
        balance: row.balance ?? openingBalance,
        income,
        expense,
      };
    });
  }, [allCashflowRows, openingBalance]);

  const startOfYear = useMemo(
    () => new Date(today.getFullYear(), 0, 1),
    [today]
  );

  const endOfPrevMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth(), 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [today]);

  const ytdData = useMemo(() => {
    const hasData = endOfPrevMonth >= startOfYear;
    let income = 0;
    let expenses = 0;

    if (hasData) {
      committedTransactions.forEach(t => {
        const tDate = parseDateKey(t.date);
        if (tDate < startOfYear || tDate > endOfPrevMonth) return;

        const amount = normalize(t.amount);
        const absAmount = Math.abs(amount);

        if (t.group === 'fee') {
          // שכר טרחה מוזן ברוטו (כולל מע"מ); ההכנסה האמיתית היא הנטו
          income += absAmount / 1.18;
        } else if (t.group === 'other_income') {
          // הכנסות אחרות לרוב לא חייבות מע"מ - נחשבות כפי שהוזנו
          income += absAmount;
        } else if (t.group === 'bank_adjustment') {
          if (amount > 0) income += amount;
          else expenses += Math.abs(amount);
        } else {
          // operational, tax, loan, personal
          expenses += absAmount;
        }
      });
    }

    const profit = income - expenses;
    const profitPct = income > 0 ? (profit / income) * 100 : 0;

    return { income, expenses, profit, profitPct, hasData };
  }, [committedTransactions, startOfYear, endOfPrevMonth]);

  const expensesByCategory = useMemo(() => {
    const data: Record<string, number> = {};
    allMonthTransactions.forEach(t => {
      if (t.type === 'expense') {
        data[t.category] = (data[t.category] || 0) + t.amount;
      }
    });
    
    return Object.keys(data).map(key => {
      const cat = CATEGORIES.find(c => c.name === key);
      return {
        name: key,
        value: data[key],
        color: cat ? cat.color : '#cbd5e1'
      };
    }).sort((a, b) => b.value - a.value);
  }, [allMonthTransactions]);

  // --- Components ---

  const KPICard = ({
    title,
    value,
    icon: Icon,
    trend,
    accentBgClass = 'bg-blue-100',
    accentTextClass = 'text-blue-600',
    subtitle,
  }: {
    title: string;
    value: number;
    icon: React.ComponentType<any>;
    trend?: number;
    accentBgClass?: string;
    accentTextClass?: string;
    subtitle?: string;
  }) => (
    <div className="bg-white/5 p-6 rounded-2xl shadow-lg border border-white/10 hover:border-white/30 transition-colors text-slate-100">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl border border-white/10 bg-white/10 ${accentBgClass}`}>
          <Icon className={`w-6 h-6 ${accentTextClass}`} />
        </div>
        {typeof trend === 'number' && (
          <span className={`text-sm font-medium ${trend > 0 ? 'text-emerald-300' : 'text-red-300'} flex items-center`}>
            {trend > 0 ? '+' : ''}{trend}%
            {trend > 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
          </span>
        )}
      </div>
      <h3 className="text-slate-300 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-bold text-[var(--law-gold)]">₪{value.toLocaleString()}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );

  const handleExportDashboard = () => {
    const headers = ['חלק', 'תיאור', 'ערך', 'פרטים נוספים'];
    const rows: (string | number)[][] = [
      ['KPI', 'יתרה נוכחית (תזרים)', todaysBalance, `יתרת פתיחה: ₪${openingBalance.toLocaleString()}`],
      ['KPI', 'סה"כ הכנסות', incomeTotal, ''],
      ['KPI', 'סה"כ הוצאות', expenseTotal, ''],
      ['KPI', 'התאמות בנק נטו', bankAdjustmentNet, ''],
      [
        'KPI',
        'תחזית סוף חודש',
        forecastResult.forecast,
        `טווח ביטחון: ₪${forecastResult.confidenceLow.toLocaleString()} - ₪${forecastResult.confidenceHigh.toLocaleString()}`,
      ],
    ];

    chartData.forEach(point => {
      rows.push([
        'מגמת יתרה',
        parseDateKey(point.date).toLocaleDateString('he-IL'),
        point.balance,
        `+₪${point.income.toLocaleString()} / -₪${point.expense.toLocaleString()}`
      ]);
    });

    expensesByCategory.forEach(cat => {
      rows.push([
        'התפלגות הוצאות',
        cat.name,
        cat.value,
        `${((cat.value / (expenseTotal || 1)) * 100).toFixed(1)}%`
      ]);
    });

    exportToCSV('dashboard_overview.csv', headers, rows);
  };

  return (
    <div className="space-y-8 text-slate-100">
      {/* Section 1: Projected balance - hero card */}
      <section>
        <div className="rounded-2xl shadow-lg border border-amber-500/20 bg-gradient-to-br from-amber-900/30 via-amber-800/10 to-transparent p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-amber-500/20 border border-amber-400/30 text-amber-200">
              <Scale className="w-7 h-7" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">יתרה צפויה לסוף החודש</p>
              <p className="text-xs text-slate-400 mt-1">
                {endOfMonth.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })} · כולל תנועות צפויות
              </p>
            </div>
          </div>
          <p className={`text-4xl font-bold ${projectedMonthEndBalance >= 0 ? 'text-[var(--law-gold)]' : 'text-rose-300'}`}>
            ₪{projectedMonthEndBalance.toLocaleString()}
          </p>
        </div>
      </section>

      {/* Section 2: YTD performance */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider px-1">מתחילת השנה</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="הכנסות מתחילת השנה"
          value={ytdData.income}
          icon={TrendingUp}
          accentBgClass="text-emerald-300"
          accentTextClass="text-emerald-300"
          subtitle={
            ytdData.hasData
              ? `נטו (לפני מע"מ) | מ-1.1.${today.getFullYear()} עד ${endOfPrevMonth.toLocaleDateString('he-IL')}`
              : 'אין חודש שנסגר עדיין השנה'
          }
        />
        <KPICard
          title="הוצאות מתחילת השנה"
          value={ytdData.expenses}
          icon={TrendingDown}
          accentBgClass="text-red-300"
          accentTextClass="text-red-300"
          subtitle={
            ytdData.hasData
              ? `מ-1.1.${today.getFullYear()} עד ${endOfPrevMonth.toLocaleDateString('he-IL')}`
              : 'אין חודש שנסגר עדיין השנה'
          }
        />
        <div className="bg-white/5 p-6 rounded-2xl shadow-lg border border-white/10 hover:border-white/30 transition-colors text-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl border border-white/10 bg-white/10 text-violet-300">
              <Activity className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-slate-300 text-sm font-medium mb-1">רווח תפעולי מוערך</h3>
          {ytdData.hasData && ytdData.income > 0 ? (
            <>
              <p className={`text-2xl font-bold ${ytdData.profit >= 0 ? 'text-[var(--law-gold)]' : 'text-rose-300'}`}>
                {ytdData.profitPct.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-400 mt-1">
                ₪{ytdData.profit.toLocaleString()} רווח על ₪{ytdData.income.toLocaleString()} הכנסות
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-500">—</p>
              <p className="text-xs text-slate-400 mt-1">
                {ytdData.hasData ? 'אין הכנסות' : 'אין חודש שנסגר עדיין השנה'}
              </p>
            </>
          )}
        </div>
        </div>
      </section>

      {/* Section 3: Current month breakdown */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider px-1">החודש - פירוט לפי קטגוריה</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <KPICard
          title={'סה"כ שכר טרחה'}
          value={totalsByGroup.fee}
          icon={TrendingUp}
          accentBgClass="text-emerald-300"
          accentTextClass="text-emerald-300"
        />
        <KPICard 
          title={'סה"כ הכנסות אחרות'}
          value={totalsByGroup.otherIncome}
          icon={TrendingUp}
          accentBgClass="text-teal-300"
          accentTextClass="text-teal-300"
        />
        <KPICard 
          title={'סה"כ הוצאות'}
          value={totalsByGroup.operational}
          icon={TrendingDown}
          accentBgClass="text-amber-300"
          accentTextClass="text-amber-300"
        />
        <KPICard 
          title={'סה"כ מיסים'}
          value={totalsByGroup.taxes}
          icon={Info}
          accentBgClass="text-yellow-300"
          accentTextClass="text-yellow-300"
        />
        <KPICard 
          title={'סה"כ הלוואות'}
          value={totalsByGroup.loans}
          icon={TrendingDown}
          accentBgClass="text-rose-300"
          accentTextClass="text-rose-300"
        />
        <KPICard 
          title={'סה"כ משיכות'}
          value={totalsByGroup.withdrawals}
          icon={TrendingDown}
          accentBgClass="text-pink-300"
          accentTextClass="text-pink-300"
        />
        </div>
      </section>

      {/* Section 4: Trends and breakdown */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider px-1">תרשימים ומגמות</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trend Chart */}
        <div className="lg:col-span-2 law-card">
        <div className="flex justify-between items-center mb-6 gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-300" />
                מגמת יתרה יומית
              </h3>
              <p className="text-xs text-slate-400">כולל תנועות צפויות (Pending)</p>
            </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExportDashboard}
              className="flex items-center gap-1 text-sm text-[var(--law-gold)] hover:text-white font-semibold"
            >
              <Download className="w-4 h-4" />
              ייצוא אקסל
            </button>
            <button
              onClick={() => setIsChartBuilderOpen(true)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#25d366] hover:text-[#1ebe5c]"
            >
              Custom Chart
            </button>
          </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => parseDateKey(String(val)).getDate().toString()}
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: '#cbd5f5', fontSize: 12}}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: '#cbd5f5', fontSize: 12}}
                  tickFormatter={(value) => `₪${(value/1000).toFixed(0)}k`}
                />
                <RechartsTooltip 
                  formatter={(value: number) => `₪${value.toLocaleString()}`}
                  labelFormatter={(label) => parseDateKey(String(label)).toLocaleDateString('he-IL')}
                  contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: '#0b1426', color: '#f8fafc' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="#2563eb" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorBalance)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenses Breakdown */}
        <div className="law-card">
          <h3 className="text-lg font-bold text-white mb-6">התפלגות הוצאות</h3>
          <div className="h-[320px] w-full">
             {expensesByCategory.length > 0 ? (
               <div className="h-full flex flex-col lg:flex-row gap-4">
                 <div className="flex-1 h-[220px] lg:h-full">
                   <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensesByCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {expensesByCategory.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                 </div>
                 <div className="lg:w-56 max-h-[300px] overflow-auto space-y-2 pr-1">
                   {expensesByCategory.map(cat => (
                     <div key={cat.name} className="flex items-center justify-between gap-2 text-sm text-slate-200">
                       <div className="flex items-center gap-2">
                         <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></span>
                         <span className="truncate">{cat.name}</span>
                       </div>
                       <span className="font-semibold text-[var(--law-gold)]">₪{cat.value.toLocaleString()}</span>
                     </div>
                   ))}
                 </div>
               </div>
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-slate-400">
                 <Info className="w-8 h-8 mb-2" />
                 <p>אין נתונים להצגה</p>
               </div>
             )}
          </div>
        </div>
        </div>
      </section>

      <ChartBuilder
        transactions={transactions}
        isOpen={isChartBuilderOpen}
        onClose={() => setIsChartBuilderOpen(false)}
      />
    </div>
  );
};

export default Dashboard;