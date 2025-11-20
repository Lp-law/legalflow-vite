import React, { useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend
} from 'recharts';
import type { Transaction } from '../types';
import { CATEGORIES } from '../constants';
import { TrendingUp, TrendingDown, Wallet, Scale, Activity, Info, Download } from 'lucide-react';
import { exportToCSV } from '../services/exportService';
import { addTotals, normalize } from '../utils/cashflow';
import type { CashflowRow } from '../utils/cashflow';
import { formatDateKey } from '../utils/date';

interface DashboardProps {
  transactions: Transaction[];
  initialBalance: number;
  currentBalance: number;
}

const LOAN_FREEZE_CUTOFF = new Date('2025-12-01T00:00:00');

const Dashboard: React.FC<DashboardProps> = ({ transactions, initialBalance, currentBalance }) => {
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
        const tDate = new Date(t.date);
        return tDate >= startOfMonth && tDate <= endOfMonth;
      }),
    [completedTransactions, startOfMonth, endOfMonth]
  );

  const monthStartBalance = useMemo(() => {
    const previousTransactions = completedTransactions.filter(t => {
      const tDate = new Date(t.date);
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

  const flowCurrentBalance = useMemo(() => {
    if (cashflowRows.length === 0) {
      return monthStartBalance;
    }
    return cashflowRows[cashflowRows.length - 1].monthlyTotal ?? monthStartBalance;
  }, [cashflowRows, monthStartBalance]);

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

  // --- Calculations ---
  const summary = useMemo(() => {
    const net = flowCurrentBalance - monthStartBalance;
    return { income: incomeTotal, expenses: expenseTotal, net };
  }, [flowCurrentBalance, monthStartBalance, incomeTotal, expenseTotal]);

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
      if (t.group === 'loan' && new Date(t.date) >= LOAN_FREEZE_CUTOFF) {
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

  const handleExportDashboard = () => {
    const headers = ['חלק', 'תיאור', 'ערך', 'פרטים נוספים'];
    const rows: (string | number)[][] = [
      ['KPI', 'יתרה נוכחית (תזרים)', flowCurrentBalance, `יתרת פתיחה: ₪${monthStartBalance.toLocaleString()}`],
      ['KPI', 'סה"כ הכנסות', summary.income, ''],
      ['KPI', 'סה"כ הוצאות', summary.expenses, ''],
      ['KPI', 'התאמות בנק נטו', bankAdjustmentNet, '']
    ];

    chartData.forEach(point => {
      rows.push([
        'מגמת יתרה',
        new Date(point.date).toLocaleDateString('he-IL'),
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
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard 
          title="יתרה נוכחית" 
          value={flowCurrentBalance || currentBalance} 
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