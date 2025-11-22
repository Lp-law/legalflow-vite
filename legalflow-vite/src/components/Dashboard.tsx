import React, { useMemo, useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie
} from 'recharts';
import type { Transaction } from '../types';
import { CATEGORIES } from '../constants';
import { TrendingUp, TrendingDown, Wallet, Scale, Activity, Info, Download } from 'lucide-react';
import { exportToCSV } from '../services/exportService';
import { addTotals, normalize } from '../utils/cashflow';
import type { CashflowRow } from '../utils/cashflow';
import { formatDateKey, parseDateKey } from '../utils/date';
import FeeSummaryModal from './FeeSummaryModal';

interface DashboardProps {
  transactions: Transaction[];
  initialBalance: number;
  currentBalance: number;
  onEditInitialBalance: () => void;
}

const LOAN_FREEZE_CUTOFF = parseDateKey('2025-12-01');

const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  initialBalance,
  currentBalance,
  onEditInitialBalance,
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

  const completedTransactions = useMemo(
    () => transactions.filter(t => t.status === 'completed'),
    [transactions]
  );

  const monthTransactions = useMemo(
    () =>
      completedTransactions.filter(t => {
        const tDate = parseDateKey(t.date);
        return tDate >= startOfMonth && tDate <= endOfMonth;
      }),
    [completedTransactions, startOfMonth, endOfMonth]
  );

  const monthStartBalance = useMemo(() => {
    const previousTransactions = completedTransactions.filter(t => {
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
  }, [completedTransactions, startOfMonth, initialBalance]);

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

  const monthEndBalance = useMemo(() => {
    if (cashflowRows.length === 0) {
      return monthStartBalance;
    }
    return cashflowRows[cashflowRows.length - 1].balance ?? monthStartBalance;
  }, [cashflowRows, monthStartBalance]);

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

  const profitMetrics = useMemo(() => {
    return monthTransactions.reduce(
      (acc, transaction) => {
        if (transaction.type === 'income') {
          acc.totalIncome += transaction.amount;
        } else if (transaction.type === 'expense') {
          if (transaction.group === 'tax') {
            acc.totalTaxExpenses += transaction.amount;
          } else {
            acc.totalNonTaxExpenses += transaction.amount;
          }
        }
        return acc;
      },
      {
        totalIncome: 0,
        totalNonTaxExpenses: 0,
        totalTaxExpenses: 0,
      }
    );
  }, [monthTransactions]);

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
        balance: row.monthlyTotal ?? monthStartBalance,
        income,
        expense,
      };
    });
  }, [cashflowRows, monthStartBalance]);

  const expensesByCategory = useMemo(() => {
    const data: Record<string, number> = {};
    monthTransactions.forEach(t => {
      if (t.group === 'loan' && parseDateKey(t.date) >= LOAN_FREEZE_CUTOFF) {
        return;
      }
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
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${accentBgClass}`}>
          <Icon className={`w-6 h-6 ${accentTextClass}`} />
        </div>
        {typeof trend === 'number' && (
          <span className={`text-sm font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
            {trend > 0 ? '+' : ''}{trend}%
            {trend > 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
          </span>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-bold text-slate-800">₪{value.toLocaleString()}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );

  const handleExportDashboard = () => {
    const headers = ['חלק', 'תיאור', 'ערך', 'פרטים נוספים'];
    const rows: (string | number)[][] = [
      ['KPI', 'יתרה נוכחית (תזרים)', todaysBalance, `יתרת פתיחה: ₪${monthStartBalance.toLocaleString()}`],
      ['KPI', 'סה"כ הכנסות', summary.income, ''],
      ['KPI', 'סה"כ הוצאות', summary.expenses, ''],
      ['KPI', 'התאמות בנק נטו', bankAdjustmentNet, '']
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div>
            <p className="text-sm text-slate-500 font-medium">יתרה במערכת</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">
              ₪{currentBalance.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              יתרה מתוזמנת מתבססת על נתוני המערכת והחזוי לסוף החודש.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">יתרה נוכחית</p>
              <p className="text-xl font-bold text-slate-800 mt-1">₪{todaysBalance.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">נכון ל-{today.toLocaleDateString('he-IL')}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">יתרה צפויה</p>
              <p className="text-xl font-bold text-slate-800 mt-1">₪{monthEndBalance.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">סוף {endOfMonth.toLocaleDateString('he-IL', { month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onEditInitialBalance}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg shadow-sm hover:bg-slate-800 transition-colors"
            >
              עדכן יתרת פתיחה
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between gap-4 lg:w-[320px]">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">ניתוח שכר טרחה</p>
            <p className="text-base text-slate-600">
              עקוב אחר תרומת לקוחות מיוחדים לשכר הטרחה בתאריכים נבחרים.
            </p>
          </div>
          <button
            onClick={() => setIsFeeSummaryOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-500 transition-colors"
          >
            סיכום שכר טרחה לפי סוג לקוח
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <KPICard 
          title="יתרה נוכחית" 
          value={todaysBalance} 
          icon={Wallet}
          accentBgClass="bg-blue-100"
          accentTextClass="text-blue-600"
          subtitle={`נכון ל-${today.toLocaleDateString('he-IL')}`}
        />
        <KPICard 
          title="יתרה צפויה" 
          value={monthEndBalance} 
          icon={Scale} 
          accentBgClass="bg-amber-100"
          accentTextClass="text-amber-600"
          subtitle={`סוף ${endOfMonth.toLocaleDateString('he-IL', { month: 'long', day: 'numeric' })}`}
        />
        <KPICard 
          title="הכנסות החודש" 
          value={summary.income} 
          icon={TrendingUp} 
          trend={12} 
          accentBgClass="bg-emerald-100"
          accentTextClass="text-emerald-600"
        />
        <KPICard 
          title="הוצאות החודש" 
          value={summary.expenses} 
          icon={TrendingDown} 
          trend={-5} 
          accentBgClass="bg-red-100"
          accentTextClass="text-red-600"
        />
        <KPICard 
          title="תזרים נטו" 
          value={summary.net} 
          icon={Scale} 
          accentBgClass="bg-purple-100"
          accentTextClass="text-purple-600"
        />
        <KPICard 
          title="רווח תפעולי" 
          value={operatingProfit}
          icon={Activity}
          accentBgClass="bg-indigo-100"
          accentTextClass="text-indigo-600"
        />
        <KPICard 
          title="רווח נטו" 
          value={netProfit}
          icon={Scale}
          accentBgClass="bg-slate-100"
          accentTextClass="text-slate-700"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <KPICard 
          title={'סה"כ שכר טרחה'}
          value={totalsByGroup.fee}
          icon={TrendingUp}
          accentBgClass="bg-emerald-100"
          accentTextClass="text-emerald-600"
        />
        <KPICard 
          title={'סה"כ הכנסות אחרות'}
          value={totalsByGroup.otherIncome}
          icon={TrendingUp}
          accentBgClass="bg-teal-100"
          accentTextClass="text-teal-600"
        />
        <KPICard 
          title={'סה"כ הוצאות'}
          value={totalsByGroup.operational}
          icon={TrendingDown}
          accentBgClass="bg-amber-100"
          accentTextClass="text-amber-600"
        />
        <KPICard 
          title={'סה"כ מיסים'}
          value={totalsByGroup.taxes}
          icon={Info}
          accentBgClass="bg-yellow-100"
          accentTextClass="text-yellow-600"
        />
        <KPICard 
          title={'סה"כ הלוואות'}
          value={totalsByGroup.loans}
          icon={TrendingDown}
          accentBgClass="bg-rose-100"
          accentTextClass="text-rose-600"
        />
        <KPICard 
          title={'סה"כ משיכות'}
          value={totalsByGroup.withdrawals}
          icon={TrendingDown}
          accentBgClass="bg-pink-100"
          accentTextClass="text-pink-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trend Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              מגמת יתרה יומית
            </h3>
            <button 
              onClick={handleExportDashboard}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500 font-semibold"
            >
              <Download className="w-4 h-4" />
              ייצוא אקסל
            </button>
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => parseDateKey(String(val)).getDate().toString()}
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: '#94a3b8', fontSize: 12}}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: '#94a3b8', fontSize: 12}}
                  tickFormatter={(value) => `₪${(value/1000).toFixed(0)}k`}
                />
                <RechartsTooltip 
                  formatter={(value: number) => `₪${value.toLocaleString()}`}
                  labelFormatter={(label) => parseDateKey(String(label)).toLocaleDateString('he-IL')}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">התפלגות הוצאות</h3>
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
                     <div key={cat.name} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                       <div className="flex items-center gap-2">
                         <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></span>
                         <span className="truncate">{cat.name}</span>
                       </div>
                       <span className="font-semibold text-slate-900">₪{cat.value.toLocaleString()}</span>
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
    </div>
  );
};

export default Dashboard;