import React, { useMemo, useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie
} from 'recharts';
import type { Transaction } from '../types';
import type { ForecastResult } from '../services/forecastService';
import { CATEGORIES } from '../constants';
import { TrendingUp, TrendingDown, Wallet, Scale, Activity, Info, Download } from 'lucide-react';
import { exportToCSV } from '../services/exportService';
import { addTotals, normalize, calculateLedgerEndBalance } from '../utils/cashflow';
import type { CashflowRow } from '../utils/cashflow';
import { formatDateKey, parseDateKey } from '../utils/date';
import FeeSummaryModal from './FeeSummaryModal';
import ChartBuilder from './ChartBuilder';
import { analyzeCashflow, generateAlerts, type InsightAlert } from '../services/insightService';

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
  const [isFeeSummaryOpen, setIsFeeSummaryOpen] = useState(false);
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

  const daysInMonth = useMemo(() => {
    const days: Date[] = [];
    const date = new Date(startOfMonth);
    while (date.getMonth() === startOfMonth.getMonth()) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [startOfMonth]);

  const monthTransactions = useMemo(
    () =>
      transactions.filter(t => {
        const tDate = parseDateKey(t.date);
        return tDate >= startOfMonth && tDate <= endOfMonth;
      }),
    [transactions, startOfMonth, endOfMonth]
  );

  const monthStartBalance = useMemo(() => {
    const previousTransactions = transactions.filter(t => {
      const tDate = parseDateKey(t.date);
      return tDate < startOfMonth;
    });

    const prevIncome = previousTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const prevExpense = previousTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return initialBalance + prevIncome - prevExpense;
  }, [transactions, startOfMonth, initialBalance]);

  const cashflowRows = useMemo(() => {
    const rows: CashflowRow[] = daysInMonth.map(day => ({
      date: formatDateKey(day),
      salary: 0,
      otherIncome: 0,
      loans: 0,
      withdrawals: 0,
      expenses: 0,
      taxes: 0,
      bankAdjustments: 0,
    }));

    const rowMap = rows.reduce<Record<string, CashflowRow>>((acc, row) => {
      acc[row.date] = row;
      return acc;
    }, {});

    monthTransactions.forEach(t => {
      const row = rowMap[t.date];
      if (!row) return;
      const rawAmount = Number(t.amount) || 0;
      const absoluteAmount = Math.abs(rawAmount);

      switch (t.group) {
        case 'fee':
          row.salary = (Number(row.salary) || 0) + absoluteAmount;
          break;
        case 'other_income':
          row.otherIncome = (Number(row.otherIncome) || 0) + absoluteAmount;
          break;
        case 'loan':
          row.loans = (Number(row.loans) || 0) + absoluteAmount;
          break;
        case 'personal':
          row.withdrawals = (Number(row.withdrawals) || 0) + absoluteAmount;
          break;
        case 'operational':
          row.expenses = (Number(row.expenses) || 0) + absoluteAmount;
          break;
        case 'tax':
          row.taxes = (Number(row.taxes) || 0) + absoluteAmount;
          break;
        case 'bank_adjustment':
          row.bankAdjustments =
            (Number(row.bankAdjustments) || 0) + rawAmount;
          break;
        default:
          break;
      }
    });

    return addTotals(rows, monthStartBalance);
  }, [daysInMonth, monthTransactions, monthStartBalance]);

  const monthEndBalance = useMemo(
    () =>
      calculateLedgerEndBalance({
        transactions,
        startDate: startOfMonth,
        endDate: endOfMonth,
        openingBalance: initialBalance,
      }),
    [transactions, startOfMonth, endOfMonth, initialBalance]
  );

  const todaysBalance = useMemo(() => {
    if (cashflowRows.length === 0) {
      return monthStartBalance;
    }
    let lastKnown = monthStartBalance;
    for (const row of cashflowRows) {
      if (row.date <= todayKey) {
        lastKnown = row.balance ?? lastKnown;
      } else {
        break;
      }
    }
    return lastKnown;
  }, [cashflowRows, monthStartBalance, todayKey]);

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
    return cashflowRows.reduce((sum, row) => {
      const loans = Math.abs(normalize(row.loans));
      const withdrawals = Math.abs(normalize(row.withdrawals));
      const expenses = Math.abs(normalize(row.expenses));
      const taxes = Math.abs(normalize(row.taxes));
      const bankAdjustments = Math.max(0, -normalize(row.bankAdjustments));
      return sum + loans + withdrawals + expenses + taxes + bankAdjustments;
    }, 0);
  }, [cashflowRows]);

  const bankAdjustmentNet = useMemo(() => {
    return cashflowRows.reduce(
      (sum, row) => sum + normalize(row.bankAdjustments),
      0
    );
  }, [cashflowRows]);

  const totalsByGroup = useMemo(() => {
    return cashflowRows.reduce(
      (acc, row) => {
        acc.fee += Math.max(0, normalize(row.salary));
        acc.otherIncome += Math.max(0, normalize(row.otherIncome));
        acc.operational += Math.abs(normalize(row.expenses));
        acc.taxes += Math.abs(normalize(row.taxes));
        acc.loans += Math.abs(normalize(row.loans));
        acc.withdrawals += Math.abs(normalize(row.withdrawals));
        return acc;
      },
      {
        fee: 0,
        otherIncome: 0,
        operational: 0,
        taxes: 0,
        loans: 0,
        withdrawals: 0,
      }
    );
  }, [cashflowRows]);

  const operatingProfit = useMemo(
    () => profitMetrics.totalIncome - profitMetrics.totalNonTaxExpenses,
    [profitMetrics]
  );

  const netProfit = useMemo(
    () => operatingProfit - profitMetrics.totalTaxExpenses,
    [operatingProfit, profitMetrics.totalTaxExpenses]
  );

  // --- Calculations ---
  const summary = useMemo(() => {
    const net = monthEndBalance - monthStartBalance;
    return { income: incomeTotal, expenses: expenseTotal, net };
  }, [monthEndBalance, monthStartBalance, incomeTotal, expenseTotal]);

  const [isChartBuilderOpen, setIsChartBuilderOpen] = useState(false);

  const chartData = useMemo(() => {
    if (cashflowRows.length === 0) {
      return [];
    }

    return cashflowRows.map(row => {
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
        balance: row.balance ?? monthStartBalance,
        income,
        expense,
      };
    });
  }, [cashflowRows, monthStartBalance]);

  const expensesByCategory = useMemo(() => {
    const data: Record<string, number> = {};
    monthTransactions.forEach(t => {
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
  }, [monthTransactions]);

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
      ['KPI', 'יתרה נוכחית (תזרים)', todaysBalance, `יתרת פתיחה: ₪${monthStartBalance.toLocaleString()}`],
      ['KPI', 'סה"כ הכנסות', summary.income, ''],
      ['KPI', 'סה"כ הוצאות', summary.expenses, ''],
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
        `${((cat.value / (summary.expenses || 1)) * 100).toFixed(1)}%`
      ]);
    });

    exportToCSV('dashboard_overview.csv', headers, rows);
  };

  const BalanceHeroCard = ({
    title,
    value,
    icon: Icon,
    accentBgClass,
    accentIconClass,
    subtitle,
  }: {
    title: string;
    value: number;
    icon: React.ComponentType<any>;
    accentBgClass: string;
    accentIconClass: string;
    subtitle: string;
  }) => (
    <div className={`rounded-2xl shadow-lg border border-white/10 p-6 flex flex-col gap-4 ${accentBgClass}`}>
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-white/10 border border-white/10 ${accentIconClass}`}>
          <Icon className="w-6 h-6" />
        </div>
        <p className="text-base font-semibold text-white">{title}</p>
      </div>
      <p className="text-4xl font-bold text-[var(--law-gold)]">₪{value.toLocaleString()}</p>
      <p className="text-sm text-slate-300">{subtitle}</p>
    </div>
  );

  const insights = useMemo(() => analyzeCashflow(transactions), [transactions]);
  const insightAlerts = useMemo<InsightAlert[]>(() => generateAlerts(insights), [insights]);

  const severityStyles: Record<InsightAlert['severity'], string> = {
    info: 'border-blue-200/40 text-blue-200 bg-blue-900/30',
    warning: 'border-amber-200/50 text-amber-200 bg-amber-900/20',
    high: 'border-rose-300/60 text-rose-200 bg-rose-900/30',
  };

  return (
    <div className="space-y-6 text-slate-100">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BalanceHeroCard
          title="יתרה נוכחית"
          value={todaysBalance}
          icon={Wallet}
          accentBgClass="bg-gradient-to-br from-blue-900/40 to-blue-600/10"
          accentIconClass="text-blue-300"
          subtitle={`נכון ל-${today.toLocaleDateString('he-IL')}`}
        />
        <BalanceHeroCard
          title="יתרה צפויה"
          value={monthEndBalance}
          icon={Scale}
          accentBgClass="bg-gradient-to-br from-amber-900/40 to-amber-500/10"
          accentIconClass="text-amber-300"
          subtitle={`סוף ${endOfMonth.toLocaleDateString('he-IL', { month: 'long', day: 'numeric' })}`}
        />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-8 gap-4">
        <KPICard 
          title="יתרה נוכחית" 
          value={todaysBalance} 
          icon={Wallet}
          accentBgClass="text-blue-300"
          accentTextClass="text-blue-300"
          subtitle={`נכון ל-${today.toLocaleDateString('he-IL')}`}
        />
        <KPICard 
          title="יתרה צפויה" 
          value={monthEndBalance} 
          icon={Scale} 
          accentBgClass="text-amber-300"
          accentTextClass="text-amber-300"
          subtitle={`סוף ${endOfMonth.toLocaleDateString('he-IL', { month: 'long', day: 'numeric' })}`}
        />
        <KPICard 
          title="הכנסות החודש" 
          value={summary.income} 
          icon={TrendingUp} 
          trend={12} 
          accentBgClass="text-emerald-300"
          accentTextClass="text-emerald-300"
        />
        <KPICard 
          title="הוצאות החודש" 
          value={summary.expenses} 
          icon={TrendingDown} 
          trend={-5} 
          accentBgClass="text-red-300"
          accentTextClass="text-red-300"
        />
        <KPICard 
          title="תזרים נטו" 
          value={summary.net} 
          icon={Scale} 
          accentBgClass="text-purple-300"
          accentTextClass="text-purple-300"
        />
        <KPICard 
          title="רווח תפעולי" 
          value={operatingProfit}
          icon={Activity}
          accentBgClass="text-indigo-300"
          accentTextClass="text-indigo-300"
        />
        <KPICard 
          title="רווח נטו" 
          value={netProfit}
          icon={Scale}
          accentBgClass="text-slate-300"
          accentTextClass="text-slate-300"
        />
      </div>
      <div className="law-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-white">תובנות חכמות</p>
            <p className="text-xs text-slate-400">
              ניתוח טרנדים חריגים והתראות מבוססות נתונים פנימיים
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {insightAlerts.map(alert => (
            <div
              key={alert.id}
              className={`rounded-2xl border px-4 py-3 text-sm ${severityStyles[alert.severity]}`}
            >
              {alert.message}
            </div>
          ))}
          {!insightAlerts.length && (
            <p className="text-xs text-slate-400">אין חריגות משמעותיות כרגע.</p>
          )}
        </div>
      </div>
      <div className="law-card flex flex-col justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300 mb-1">ניתוח שכר טרחה</p>
          <p className="text-base text-slate-300">
            עקוב אחר תרומת לקוחות מיוחדים לשכר הטרחה בתאריכים נבחרים.
          </p>
        </div>
        <button
          onClick={() => setIsFeeSummaryOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-slate-900 bg-gradient-to-l from-[#d4af37] to-[#b37a12] rounded-full shadow-lg hover:shadow-xl transition-colors"
        >
          סיכום שכר טרחה לפי סוג לקוח
          <Download className="w-4 h-4" />
        </button>
      </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trend Chart */}
        <div className="lg:col-span-2 law-card">
        <div className="flex justify-between items-center mb-6 gap-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-300" />
              מגמת יתרה יומית
            </h3>
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
      <FeeSummaryModal
        isOpen={isFeeSummaryOpen}
        onClose={() => setIsFeeSummaryOpen(false)}
        transactions={transactions}
      />
      <ChartBuilder
        transactions={transactions}
        isOpen={isChartBuilderOpen}
        onClose={() => setIsChartBuilderOpen(false)}
      />
    </div>
  );
};

export default Dashboard;