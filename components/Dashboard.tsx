import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { Transaction } from '../types';
import { CATEGORIES } from '../constants';
import { TrendingUp, TrendingDown, Wallet, Scale, Activity, Info, Download } from 'lucide-react';
import FeeSummaryModal from './FeeSummaryModal';
import { addTotals, normalize, type CashflowRow } from '../utils/cashflow';
import { formatDateKey, parseDateKey } from '../utils/date';

interface DashboardProps {
  transactions: Transaction[];
  initialBalance: number;
  currentBalance: number;
  onEditInitialBalance: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  initialBalance,
  currentBalance,
  onEditInitialBalance,
}) => {
  const [isFeeSummaryOpen, setIsFeeSummaryOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
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
    const cursor = new Date(startOfMonth);
    while (cursor.getMonth() === startOfMonth.getMonth()) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
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
        default:
          break;
      }
    });

    return addTotals(rows, monthStartBalance);
  }, [daysInMonth, monthTransactions, monthStartBalance]);

  const flowCurrentBalance = useMemo(() => {
    if (cashflowRows.length === 0) {
      return monthStartBalance;
    }
    return cashflowRows[cashflowRows.length - 1].monthlyTotal ?? monthStartBalance;
  }, [cashflowRows, monthStartBalance]);

  const summary = useMemo(() => {
    const income = cashflowRows.reduce((sum, row) => {
      return sum + Math.max(0, normalize(row.salary)) + Math.max(0, normalize(row.otherIncome));
    }, 0);
    const expenses = cashflowRows.reduce((sum, row) => {
      return (
        sum +
        Math.abs(normalize(row.loans)) +
        Math.abs(normalize(row.withdrawals)) +
        Math.abs(normalize(row.expenses)) +
        Math.abs(normalize(row.taxes))
      );
    }, 0);
    const net = flowCurrentBalance - monthStartBalance;
    return { income, expenses, net };
  }, [cashflowRows, flowCurrentBalance, monthStartBalance]);

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
        } else {
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

  const chartData = useMemo(() => {
    if (cashflowRows.length === 0) {
      return [];
    }

    return cashflowRows.map(row => {
      const salary = Math.max(0, normalize(row.salary));
      const otherIncome = Math.max(0, normalize(row.otherIncome));
      const income = salary + otherIncome;
      const expense =
        Math.abs(normalize(row.loans)) +
        Math.abs(normalize(row.withdrawals)) +
        Math.abs(normalize(row.expenses)) +
        Math.abs(normalize(row.taxes));

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
      if (t.type === 'expense') {
        data[t.category] = (data[t.category] || 0) + t.amount;
      }
    });

    return Object.keys(data)
      .map(key => {
        const cat = CATEGORIES.find(c => c.name === key);
        return {
          name: key,
          value: data[key],
          color: cat ? cat.color : '#cbd5e1',
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthTransactions]);

  const KPICard = ({ title, value, icon: Icon, trend, colorClass }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
        {trend && (
          <span
            className={`text-sm font-medium ${
              trend > 0 ? 'text-green-600' : 'text-red-600'
            } flex items-center`}
          >
            {trend > 0 ? '+' : ''}
            {trend}%
            {trend > 0 ? (
              <TrendingUp className="w-4 h-4 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 mr-1" />
            )}
          </span>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-bold text-slate-800">₪{value.toLocaleString()}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div>
            <p className="text-sm text-slate-500 font-medium">יתרה נוכחית</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">
              ₪{currentBalance.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              יתרה לפי דוח: ₪{(flowCurrentBalance || 0).toLocaleString()} · יתרת פתיחה: ₪
              {monthStartBalance.toLocaleString()}
            </p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <KPICard title="יתרה נוכחית" value={flowCurrentBalance || currentBalance} icon={Wallet} colorClass="bg-blue-600" />
        <KPICard title="הכנסות החודש" value={summary.income} icon={TrendingUp} trend={12} colorClass="bg-emerald-600" />
        <KPICard title="הוצאות החודש" value={summary.expenses} icon={TrendingDown} trend={-5} colorClass="bg-red-600" />
        <KPICard title="תזרים נטו" value={summary.net} icon={Scale} colorClass="bg-purple-600" />
        <KPICard title="רווח תפעולי" value={operatingProfit} icon={Activity} colorClass="bg-indigo-600" />
        <KPICard title="רווח נטו" value={netProfit} icon={Scale} colorClass="bg-slate-700" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <KPICard title='סה"כ שכר טרחה' value={totalsByGroup.fee} icon={TrendingUp} colorClass="bg-emerald-600/80" />
        <KPICard title='סה"כ הכנסות אחרות' value={totalsByGroup.otherIncome} icon={TrendingUp} colorClass="bg-teal-600" />
        <KPICard title='סה"כ הוצאות' value={totalsByGroup.operational} icon={TrendingDown} colorClass="bg-amber-600" />
        <KPICard title='סה"כ מיסים' value={totalsByGroup.taxes} icon={Info} colorClass="bg-yellow-600" />
        <KPICard title='סה"כ הלוואות' value={totalsByGroup.loans} icon={TrendingDown} colorClass="bg-rose-600" />
        <KPICard title='סה"כ משיכות' value={totalsByGroup.withdrawals} icon={TrendingDown} colorClass="bg-pink-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              מגמת יתרה יומית
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => parseDateKey(String(val)).getDate().toString()}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(value) => `₪${(value / 1000).toFixed(0)}k`}
                />
                <RechartsTooltip
                  formatter={(value: number) => `₪${value.toLocaleString()}`}
                  labelFormatter={label =>
                    parseDateKey(String(label)).toLocaleDateString('he-IL')
                  }
                  contentStyle={{
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#balanceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">התפלגות הוצאות</h3>
          <div className="h-[300px] w-full">
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
                  <Legend layout="vertical" verticalAlign="bottom" align="center" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
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
import React, { useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { Transaction, Category } from '../types';
import { CATEGORIES } from '../constants';
import { TrendingUp, TrendingDown, Wallet, Scale, Activity, Info } from 'lucide-react';

interface DashboardProps {
  transactions: Transaction[];
  currentBalance: number;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, currentBalance }) => {

  // --- Calculations ---
  const summary = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expenses, net: income - expenses };
  }, [transactions]);

  const chartData = useMemo(() => {
    // Sort transactions by date
    const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Accumulate balance over time (simplified for visual trend)
    let runningBalance = currentBalance - summary.net; // Start from beginning of period approx
    
    // Group by day for smoother chart
    const groupedByDay: Record<string, { date: string; balance: number; income: number; expense: number }> = {};
    
    sorted.forEach(t => {
      if (!groupedByDay[t.date]) {
        groupedByDay[t.date] = { date: t.date, balance: runningBalance, income: 0, expense: 0 };
      }
      if (t.type === 'income') {
        groupedByDay[t.date].income += t.amount;
        runningBalance += t.amount;
      } else {
        groupedByDay[t.date].expense += t.amount;
        runningBalance -= t.amount;
      }
      groupedByDay[t.date].balance = runningBalance;
    });

    return Object.values(groupedByDay);
  }, [transactions, currentBalance, summary]);

  const expensesByCategory = useMemo(() => {
    const data: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      data[t.category] = (data[t.category] || 0) + t.amount;
    });
    
    return Object.keys(data).map(key => {
      const cat = CATEGORIES.find(c => c.name === key);
      return {
        name: key,
        value: data[key],
        color: cat ? cat.color : '#cbd5e1'
      };
    }).sort((a, b) => b.value - a.value);
  }, [transactions]);

  // --- Components ---

  const KPICard = ({ title, value, icon: Icon, trend, colorClass }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
        {trend && (
          <span className={`text-sm font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
            {trend > 0 ? '+' : ''}{trend}%
            {trend > 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
          </span>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-bold text-slate-800">₪{value.toLocaleString()}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard 
          title="יתרה נוכחית" 
          value={currentBalance} 
          icon={Wallet} 
          colorClass="bg-blue-600" // Simplified color handling
        />
        <KPICard 
          title="הכנסות החודש" 
          value={summary.income} 
          icon={TrendingUp} 
          trend={12} 
          colorClass="bg-emerald-600"
        />
        <KPICard 
          title="הוצאות החודש" 
          value={summary.expenses} 
          icon={TrendingDown} 
          trend={-5} 
          colorClass="bg-red-600"
        />
        <KPICard 
          title="תזרים נטו" 
          value={summary.net} 
          icon={Scale} 
          colorClass="bg-purple-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trend Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              מגמת יתרה יומית
            </h3>
            <button className="text-sm text-blue-600 hover:underline">דוח מלא</button>
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
                  tickFormatter={(val) => new Date(val).getDate().toString()}
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
                  labelFormatter={(label) => new Date(label).toLocaleDateString('he-IL')}
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
          <div className="h-[300px] w-full">
             {expensesByCategory.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
                  <Legend layout="vertical" verticalAlign="bottom" align="center" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-slate-400">
                 <Info className="w-8 h-8 mb-2" />
                 <p>אין נתונים להצגה</p>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;