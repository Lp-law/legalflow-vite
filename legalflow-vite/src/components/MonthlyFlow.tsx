import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft, Plus, Download } from 'lucide-react';
import type { Transaction, TransactionGroup } from '../types';
import DailyDetailModal from './DailyDetailModal';
import { exportToCSV } from '../services/exportService';
import { addTotals } from '../utils/cashflow';
import type { CashflowRow } from '../utils/cashflow';
import { formatDateKey, parseDateKey } from '../utils/date';

interface MonthlyFlowProps {
  transactions: Transaction[];
  initialBalance: number;
  onDeleteTransaction: (id: string) => void;
  openTransactionForm: (date?: string, type?: 'income' | 'expense', group?: TransactionGroup) => void;
  onToggleStatus: (id: string, nextStatus: 'pending' | 'completed') => void;
  onUpdateTaxAmount: (id: string, amount: number) => void;
  onUpdateLoanAmount: (id: string, amount: number) => void;
}

type MonthSummary = {
  fee: number;
  feePending: number;
  otherIncome: number;
  otherIncomePending: number;
  tax: number;
  taxPending: number;
  operational: number;
  operationalPending: number;
  loan: number;
  loanPending: number;
  personal: number;
  personalPending: number;
  bankAdjustment: number;
  bankAdjustmentPending: number;
};

const MonthlyFlow: React.FC<MonthlyFlowProps> = ({ 
  transactions, 
  initialBalance, 
  onDeleteTransaction,
  openTransactionForm,
  onToggleStatus,
  onUpdateTaxAmount,
  onUpdateLoanAmount
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    date: string;
    group: TransactionGroup;
    transactions: Transaction[];
  } | null>(null);
  const [cellTooltip, setCellTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    title: string;
    total: number;
    transactions: Transaction[];
  }>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    total: 0,
    transactions: [],
  });

  // --- Date Logic ---
  const monthStartDate = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
    [currentDate]
  );

  const monthEndDate = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0),
    [currentDate]
  );

  const daysInMonth = useMemo(() => {
    const days: Date[] = [];
    const cursor = new Date(monthStartDate);
    while (cursor.getMonth() === monthStartDate.getMonth()) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [monthStartDate]);

  const globalCashflowMap = useMemo(() => {
    const buildRows = (start: Date, end: Date) => {
      const rows: CashflowRow[] = [];
      const cursor = new Date(start);
      while (cursor.getTime() <= end.getTime()) {
        rows.push({
          date: formatDateKey(cursor),
          salary: 0,
          otherIncome: 0,
          loans: 0,
          withdrawals: 0,
          expenses: 0,
          taxes: 0,
          bankAdjustments: 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return rows;
    };

    if (transactions.length === 0) {
      const rows = buildRows(monthStartDate, monthEndDate);
      const enriched = addTotals(rows, initialBalance);
      return new Map(enriched.map(row => [row.date, row]));
    }

    const normalizedTransactions = transactions.map(t => ({
      ...t,
      date: formatDateKey(parseDateKey(t.date)),
    }));

    const sortedDates = normalizedTransactions
      .map(t => parseDateKey(t.date))
      .sort((a, b) => a.getTime() - b.getTime());

    const earliestDate = sortedDates[0] || monthStartDate;
    const latestDate =
      sortedDates[sortedDates.length - 1] || monthEndDate;

    const rangeStart = new Date(
      Math.min(earliestDate.getTime(), monthStartDate.getTime())
    );
    const rangeEnd = new Date(
      Math.max(latestDate.getTime(), monthEndDate.getTime())
    );

    const rows = buildRows(rangeStart, rangeEnd);
    const rowMap = rows.reduce<Record<string, CashflowRow>>((acc, row) => {
      acc[row.date] = row;
      return acc;
    }, {});

    normalizedTransactions.forEach(t => {
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

    const enriched = addTotals(rows, initialBalance);
    return new Map(enriched.map(row => [row.date, row]));
  }, [transactions, monthStartDate, monthEndDate, initialBalance]);

  // --- Financial Logic ---
  const monthStartBalance = useMemo(() => {
    const previousDay = new Date(monthStartDate);
    previousDay.setDate(previousDay.getDate() - 1);
    const previousRow = globalCashflowMap.get(formatDateKey(previousDay));
    if (previousRow?.balance !== undefined) {
      return previousRow.balance;
    }
    return initialBalance;
  }, [globalCashflowMap, monthStartDate, initialBalance]);

  type BalanceSnapshot = { daily: number; cumulative: number };

  const cashflowTotals = useMemo<Map<string, BalanceSnapshot>>(() => {
    return new Map(
      daysInMonth.map(day => {
        const dateKey = formatDateKey(day);
        const globalRow = globalCashflowMap.get(dateKey);
        return [
          dateKey,
          {
            daily: globalRow?.dailyTotal ?? 0,
            cumulative: globalRow?.balance ?? monthStartBalance,
          },
        ];
      })
    );
  }, [daysInMonth, globalCashflowMap, monthStartBalance]);

  const dailyData = useMemo(() => {
    let runningBalance = monthStartBalance;
    
    return daysInMonth.map(day => {
      const dateStr = formatDateKey(day);
      const dayTransactions = transactions.filter(t => t.date === dateStr);

      const buildGroupData = (group: TransactionGroup) => {
        const groupTransactions = dayTransactions.filter(t => t.group === group);
        const committedSum = groupTransactions
          .filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + t.amount, 0);
        const pendingSum = groupTransactions
          .filter(t => t.status === 'pending')
          .reduce((sum, t) => sum + t.amount, 0);

        return {
          sum: committedSum + pendingSum,
          committedSum,
          pendingSum,
          transactions: groupTransactions
        };
      };

      const fee = buildGroupData('fee');
      const otherIncome = buildGroupData('other_income');
      const operational = buildGroupData('operational');
      const tax = buildGroupData('tax');
      const loan = buildGroupData('loan');
      const personal = buildGroupData('personal');
      const bankAdjustment = buildGroupData('bank_adjustment');
      
      // Daily change: (income) - taxes - loans - withdrawals + bank adjustments
      const totalIncome = fee.sum + otherIncome.sum;
      const totalOperational = operational.sum;
      const totalTaxes = tax.sum;
      const totalLoans = loan.sum;
      const totalWithdrawals = personal.sum;
      const bankAdjustmentNet = bankAdjustment.sum;

      const dailyChange =
        totalIncome -
        totalOperational -
        totalTaxes -
        totalLoans -
        totalWithdrawals +
        bankAdjustmentNet;
      const snapshot = cashflowTotals.get(dateStr);
      const netChange = snapshot?.daily ?? dailyChange;
      runningBalance += netChange;
      const displayBalance = snapshot?.cumulative ?? runningBalance;

      return {
        date: day,
        dateStr,
        fee,
        otherIncome,
        operational,
        tax,
        loan,
        personal,
        bankAdjustment,
        balance: displayBalance
      };
    });
  }, [daysInMonth, transactions, monthStartBalance, cashflowTotals]);

  const monthSummary = useMemo<MonthSummary>(() => {
    const empty: MonthSummary = {
      fee: 0,
      feePending: 0,
      otherIncome: 0,
      otherIncomePending: 0,
      tax: 0,
      taxPending: 0,
      operational: 0,
      operationalPending: 0,
      loan: 0,
      loanPending: 0,
      personal: 0,
      personalPending: 0,
      bankAdjustment: 0,
      bankAdjustmentPending: 0,
    };

    return dailyData.reduce((acc, day) => {
      acc.fee += day.fee.committedSum;
      acc.feePending += day.fee.pendingSum;
      acc.otherIncome += day.otherIncome.committedSum;
      acc.otherIncomePending += day.otherIncome.pendingSum;
      acc.tax += day.tax.committedSum;
      acc.taxPending += day.tax.pendingSum;
      acc.operational += day.operational.committedSum;
      acc.operationalPending += day.operational.pendingSum;
      acc.loan += day.loan.committedSum;
      acc.loanPending += day.loan.pendingSum;
      acc.personal += day.personal.committedSum;
      acc.personalPending += day.personal.pendingSum;
      acc.bankAdjustment += day.bankAdjustment.committedSum;
      acc.bankAdjustmentPending += day.bankAdjustment.pendingSum;
      return acc;
    }, empty);
  }, [dailyData]);

  const operationalProfit = useMemo(() => {
    return monthSummary.fee - monthSummary.operational;
  }, [monthSummary]);

  const netProfit = useMemo(() => {
    return (monthSummary.fee + monthSummary.otherIncome) - (monthSummary.operational + monthSummary.tax);
  }, [monthSummary]);

  const netCashflow = useMemo(() => {
    return (monthSummary.fee + monthSummary.otherIncome) - (monthSummary.operational + monthSummary.tax + monthSummary.loan + monthSummary.personal);
  }, [monthSummary]);

  const totalOperationalExpenses = useMemo(
    () => monthSummary.operational + monthSummary.operationalPending,
    [monthSummary]
  );

  const totalTaxes = useMemo(
    () => monthSummary.tax + monthSummary.taxPending,
    [monthSummary]
  );

  const totalLoans = useMemo(
    () => monthSummary.loan + monthSummary.loanPending,
    [monthSummary]
  );

  const totalWithdrawals = useMemo(
    () => monthSummary.personal + monthSummary.personalPending,
    [monthSummary]
  );

  // --- Actions ---
  const handleCellClick = (dateStr: string, group: TransactionGroup, cellTransactions: Transaction[]) => {
    if (cellTransactions.length > 0) {
      setSelectedCell({ date: dateStr, group, transactions: cellTransactions });
      setDetailModalOpen(true);
    } else {
      const type = (group === 'fee' || group === 'other_income') ? 'income' : 'expense';
      openTransactionForm(dateStr, type, group);
    }
  };

  const handleExportToCSV = () => {
    const headers = ['תאריך', 'שכר טרחה', 'הכנסות אחרות', 'הוצאות תפעול', 'מיסים', 'הלוואות', 'משיכות', 'התאמת בנק', 'יתרה'];
    const rows = dailyData.map(day => [
      day.date.toLocaleDateString('he-IL'),
      day.fee.sum || '',
      day.otherIncome.sum || '',
      day.operational.sum || '',
      day.tax.sum || '',
      day.loan.sum || '',
      day.personal.sum || '',
      day.bankAdjustment.sum || '',
      day.balance
    ]);

    exportToCSV(`תזרים_${currentDate.getMonth() + 1}_${currentDate.getFullYear()}.csv`, headers, rows);
  };

  const formatCurrency = (val: number) => `₪${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const formatDate = (date: Date) => date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const navigateMonth = (dir: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + dir);
    setCurrentDate(newDate);
  };

  const showCellTooltip = (
    event: React.MouseEvent<HTMLTableCellElement, MouseEvent>,
    title: string,
    data: { transactions: Transaction[]; sum: number }
  ) => {
    const { clientX, clientY } = event;
    setCellTooltip({
      visible: true,
      x: clientX + 16,
      y: clientY + 16,
      title,
      total: data.sum,
      transactions: data.transactions,
    });
  };

  const moveCellTooltip = (event: React.MouseEvent<HTMLTableCellElement, MouseEvent>) => {
    if (!cellTooltip.visible) return;
    const { clientX, clientY } = event;
    setCellTooltip(prev => ({
      ...prev,
      x: clientX + 16,
      y: clientY + 16,
    }));
  };

  const hideCellTooltip = () => {
    setCellTooltip(prev => ({ ...prev, visible: false }));
  };

  // --- Render ---
  return (
    <>
    <div className="space-y-6 h-full flex flex-col">
      
      {/* Top Control Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
        <div className="flex items-center gap-4">
            <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
            <div className="text-center">
                <h2 className="text-xl font-bold text-slate-800">
                    {currentDate.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
                </h2>
                <p className="text-xs text-slate-500 font-medium">יתרת פתיחה: {formatCurrency(monthStartBalance)}</p>
            </div>
            <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
        </div>

        <div className="flex flex-wrap gap-3 justify-center text-sm items-center">
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 text-center">
                <span className="block text-xs text-emerald-500 mb-1">סה"כ שכר טרחה</span>
                <span className="font-bold text-lg">{formatCurrency(monthSummary.fee)}</span>
            </div>
            <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 text-center">
                <span className="block text-xs text-blue-500 mb-1">תזרים נטו</span>
                <span className="font-bold text-lg">{formatCurrency(netCashflow)}</span>
            </div>
            <div className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 text-center">
                <span className="block text-xs text-indigo-500 mb-1">רווח תפעולי</span>
                <span className="font-bold text-lg">{formatCurrency(operationalProfit)}</span>
            </div>
            <div className="px-4 py-2 bg-purple-50 text-purple-700 rounded-lg border border-purple-100 text-center">
                <span className="block text-xs text-purple-500 mb-1">רווח נטו</span>
                <span className="font-bold text-lg">{formatCurrency(netProfit)}</span>
            </div>
            <div className="px-4 py-2 bg-slate-50 text-slate-700 rounded-lg border border-slate-200 text-center">
                <span className="block text-xs text-slate-500 mb-1">סה"כ הוצאות</span>
                <span className="font-bold text-lg">{formatCurrency(totalOperationalExpenses)}</span>
            </div>
            <div className="px-4 py-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-center">
                <span className="block text-xs text-amber-500 mb-1">סה"כ מיסים</span>
                <span className="font-bold text-lg">{formatCurrency(totalTaxes)}</span>
            </div>
            <div className="px-4 py-2 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 text-center">
                <span className="block text-xs text-rose-500 mb-1">סה"כ הלוואות</span>
                <span className="font-bold text-lg">{formatCurrency(totalLoans)}</span>
            </div>
            <div className="px-4 py-2 bg-pink-50 text-pink-700 rounded-lg border border-pink-200 text-center">
                <span className="block text-xs text-pink-500 mb-1">סה"כ משיכות</span>
                <span className="font-bold text-lg">{formatCurrency(totalWithdrawals)}</span>
            </div>
            <button 
              onClick={handleExportToCSV}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">אקסל</span>
            </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
            <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-center border-collapse relative min-w-[900px]">
                    <thead className="bg-slate-900 text-white text-xs sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="px-2 py-3 font-medium w-[90px]">תאריך</th>
                            {/* Fee Column */}
                            <th className="px-2 py-3 font-bold bg-emerald-900 border-r border-slate-700">שכר טרחה</th>
                            {/* Other Income */}
                            <th className="px-2 py-3 font-medium bg-emerald-800/60 border-r border-slate-700">הכנסות אחרות</th>
                            <th className="px-2 py-3 font-medium border-r border-slate-700">הוצאה</th>
                            <th className="px-2 py-3 font-medium border-r border-slate-700">מיסים</th>
                            <th className="px-2 py-3 font-medium border-r border-slate-700">הלוואות</th>
                            <th className="px-2 py-3 font-medium border-r border-slate-700">משיכות</th>
                            <th className="px-2 py-3 font-medium border-r border-slate-700">התאמת בנק</th>
                            <th className="px-2 py-3 font-medium bg-slate-800 border-r border-slate-700">יתרה</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                        {dailyData.map((day) => {
                             const isWeekend = day.date.getDay() === 5 || day.date.getDay() === 6; 
                             const isToday = day.dateStr === formatDateKey(new Date());
                             const rowClass = isToday 
                                ? 'bg-blue-100 relative z-10 ring-2 ring-blue-600 ring-inset shadow-md' 
                                : `hover:bg-slate-50 transition-colors ${isWeekend ? 'bg-slate-50/50' : ''}`;

                             return (
                            <tr key={day.dateStr} className={rowClass}>
                                <td className={`px-2 py-2 border-l border-slate-100 font-medium sticky right-0 z-0 ${isToday ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-500 bg-inherit'}`}>
                                    {formatDate(day.date)}
                                    {isToday && <span className="block text-[10px] text-blue-600 font-normal">היום</span>}
                                </td>
                                
                                {/* FEE CELL */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'fee', day.fee.transactions)}
                                    onMouseEnter={(e) => showCellTooltip(e, 'שכר טרחה', day.fee)}
                                    onMouseMove={moveCellTooltip}
                                    onMouseLeave={hideCellTooltip}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 relative hover:bg-slate-100 bg-emerald-50/30"
                                >
                                    {day.fee.sum > 0 ? (
                                        <div className="space-y-0.5">
                                          {day.fee.committedSum > 0 && (
                                            <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded block">
                                              {formatCurrency(day.fee.committedSum)}
                                              <span className="text-[10px] ml-1 text-emerald-900">שולם</span>
                                            </span>
                                          )}
                                          {day.fee.pendingSum > 0 && (
                                            <span className="font-bold text-amber-600 bg-amber-100/80 px-1.5 py-0.5 rounded block">
                                              {formatCurrency(day.fee.pendingSum)}
                                              <span className="text-[10px] ml-1 text-amber-900">צפוי</span>
                                            </span>
                                          )}
                                        </div>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-emerald-400" />
                                        </span>
                                    )}
                                </td>

                                {/* OTHER INCOME CELL */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'other_income', day.otherIncome.transactions)}
                                    onMouseEnter={(e) => showCellTooltip(e, 'הכנסות אחרות', day.otherIncome)}
                                    onMouseMove={moveCellTooltip}
                                    onMouseLeave={hideCellTooltip}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 hover:bg-slate-100"
                                >
                                    {day.otherIncome.sum > 0 ? (
                                        <div className="space-y-0.5">
                                          {day.otherIncome.committedSum > 0 && (
                                            <span className="font-medium text-emerald-600 block">
                                                {formatCurrency(day.otherIncome.committedSum)}
                                                <span className="text-[10px] ml-1 text-emerald-800">שולם</span>
                                            </span>
                                          )}
                                          {day.otherIncome.pendingSum > 0 && (
                                            <span className="font-medium text-amber-600 block">
                                                {formatCurrency(day.otherIncome.pendingSum)}
                                                <span className="text-[10px] ml-1 text-amber-800">צפוי</span>
                                            </span>
                                          )}
                                        </div>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-emerald-300" />
                                        </span>
                                    )}
                                </td>

                                {/* OPERATIONAL */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'operational', day.operational.transactions)}
                                    onMouseEnter={(e) => showCellTooltip(e, 'הוצאות תפעול', day.operational)}
                                    onMouseMove={moveCellTooltip}
                                    onMouseLeave={hideCellTooltip}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 hover:bg-slate-100"
                                >
                                    {day.operational.sum > 0 ? (
                                        <span className="font-medium text-red-600 block">
                                            {formatCurrency(day.operational.sum)}
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-red-300" />
                                        </span>
                                    )}
                                </td>

                                {/* TAX */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'tax', day.tax.transactions)}
                                    onMouseEnter={(e) => showCellTooltip(e, 'מיסים', day.tax)}
                                    onMouseMove={moveCellTooltip}
                                    onMouseLeave={hideCellTooltip}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 hover:bg-slate-100"
                                >
                                    {day.tax.sum > 0 ? (
                                        <span className="font-medium text-red-800 block">
                                            {formatCurrency(day.tax.sum)}
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-slate-300" />
                                        </span>
                                    )}
                                </td>

                                {/* LOAN */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'loan', day.loan.transactions)}
                                    onMouseEnter={(e) => showCellTooltip(e, 'הלוואות', day.loan)}
                                    onMouseMove={moveCellTooltip}
                                    onMouseLeave={hideCellTooltip}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 hover:bg-slate-100"
                                >
                                    {day.loan.sum > 0 ? (
                                        <span className="font-medium text-orange-600 block">
                                            {formatCurrency(day.loan.sum)}
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-slate-300" />
                                        </span>
                                    )}
                                </td>

                                {/* PERSONAL */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'personal', day.personal.transactions)}
                                    onMouseEnter={(e) => showCellTooltip(e, 'משיכות', day.personal)}
                                    onMouseMove={moveCellTooltip}
                                    onMouseLeave={hideCellTooltip}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 hover:bg-slate-100"
                                >
                                    {day.personal.sum > 0 ? (
                                        <span className="font-medium text-purple-600 block">
                                            {formatCurrency(day.personal.sum)}
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-slate-300" />
                                        </span>
                                    )}
                                </td>

                                {/* BANK ADJUSTMENT */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'bank_adjustment', day.bankAdjustment.transactions)}
                                    onMouseEnter={(e) => showCellTooltip(e, 'התאמות בנק', day.bankAdjustment)}
                                    onMouseMove={moveCellTooltip}
                                    onMouseLeave={hideCellTooltip}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 hover:bg-slate-100"
                                >
                                    {day.bankAdjustment.sum !== 0 ? (
                                        <span className={`font-medium block ${day.bankAdjustment.sum >= 0 ? 'text-sky-600' : 'text-rose-600'}`}>
                                            {formatCurrency(day.bankAdjustment.sum)}
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-slate-300" />
                                        </span>
                                    )}
                                </td>

                                {/* BALANCE */}
                                <td className={`px-2 py-2 font-bold border-r border-slate-200 text-xs ${day.balance < 0 ? 'text-red-600 bg-red-50' : 'text-slate-800'} ${isToday ? 'bg-blue-100' : 'bg-slate-50'}`}>
                                    {formatCurrency(day.balance)}
                                </td>
                            </tr>
                        )})}
                    </tbody>
                    {/* FOOTER ROW */}
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300 text-xs sticky bottom-0 z-20 font-bold shadow-inner">
                        <tr>
                            <td className="px-2 py-3 text-right">סה"כ:</td>
                            
                            {/* FEE TOTALS */}
                            <td className="px-2 py-3 bg-emerald-100 border-r border-slate-300 text-emerald-900">
                                <div className="flex flex-col gap-1">
                                    <span className="text-base">
                                      {formatCurrency(monthSummary.fee + monthSummary.feePending)}
                                    </span>
                                    <div className="text-[11px] text-emerald-800 flex flex-col gap-0.5">
                                      <span>שולם: {formatCurrency(monthSummary.fee)}</span>
                                      {monthSummary.feePending > 0 && (
                                        <span className="text-amber-700">
                                          צפוי: {formatCurrency(monthSummary.feePending)}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-emerald-700 border-t border-emerald-300 pt-1 mt-1">
                                        נטו (82%): {formatCurrency(monthSummary.fee * 0.82)}
                                    </span>
                                </div>
                            </td>
                            
                            <td className="px-2 py-3 text-emerald-700 border-r border-slate-300">
                              <div className="flex flex-col gap-1">
                                <span>{formatCurrency(monthSummary.otherIncome + monthSummary.otherIncomePending)}</span>
                                <div className="text-[11px] text-emerald-700 flex flex-col gap-0.5">
                                  <span>שולם: {formatCurrency(monthSummary.otherIncome)}</span>
                                  {monthSummary.otherIncomePending > 0 && (
                                    <span className="text-amber-700">
                                      צפוי: {formatCurrency(monthSummary.otherIncomePending)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-red-600 border-r border-slate-300">
                              <div className="flex flex-col gap-1">
                                <span>{formatCurrency(monthSummary.operational + monthSummary.operationalPending)}</span>
                                {monthSummary.operationalPending > 0 && (
                                  <span className="text-[10px] text-amber-700">
                                    צפוי: {formatCurrency(monthSummary.operationalPending)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-red-800 border-r border-slate-300">
                              <div className="flex flex-col gap-1">
                                <span>{formatCurrency(monthSummary.tax + monthSummary.taxPending)}</span>
                                {monthSummary.taxPending > 0 && (
                                  <span className="text-[10px] text-amber-700">
                                    צפוי: {formatCurrency(monthSummary.taxPending)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-orange-600 border-r border-slate-300">
                              <div className="flex flex-col gap-1">
                                <span>{formatCurrency(monthSummary.loan + monthSummary.loanPending)}</span>
                                {monthSummary.loanPending > 0 && (
                                  <span className="text-[10px] text-amber-700">
                                    צפוי: {formatCurrency(monthSummary.loanPending)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-purple-600 border-r border-slate-300">
                              <div className="flex flex-col gap-1">
                                <span>{formatCurrency(monthSummary.personal + monthSummary.personalPending)}</span>
                                {monthSummary.personalPending > 0 && (
                                  <span className="text-[10px] text-amber-700">
                                    צפוי: {formatCurrency(monthSummary.personalPending)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 border-r border-slate-300">
                              <div className="flex flex-col gap-1">
                                <span className={`${(monthSummary.bankAdjustment + monthSummary.bankAdjustmentPending) >= 0 ? 'text-sky-700' : 'text-rose-700'}`}>
                                  {formatCurrency(monthSummary.bankAdjustment + monthSummary.bankAdjustmentPending)}
                                </span>
                                {monthSummary.bankAdjustmentPending !== 0 && (
                                  <span className="text-[10px] text-slate-600">
                                    כולל ממתין: {formatCurrency(monthSummary.bankAdjustmentPending)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-slate-800 border-r border-slate-300 bg-slate-200">
                                {formatCurrency(dailyData[dailyData.length-1]?.balance || 0)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
      </div>
    </div>

    {selectedCell && (
      <DailyDetailModal 
        isOpen={detailModalOpen}
        onClose={() => { setDetailModalOpen(false); setSelectedCell(null); }}
        date={selectedCell.date}
        group={selectedCell.group}
        transactions={selectedCell.transactions}
        onDelete={(id) => {
            onDeleteTransaction(id);
            setDetailModalOpen(false); 
            setSelectedCell(null);
        }}
        onAdd={() => {
             setDetailModalOpen(false);
             const type = (selectedCell.group === 'fee' || selectedCell.group === 'other_income') ? 'income' : 'expense';
             openTransactionForm(selectedCell.date, type, selectedCell.group);
        }}
        onToggleStatus={onToggleStatus}
        onUpdateTaxAmount={onUpdateTaxAmount}
        onUpdateLoanAmount={onUpdateLoanAmount}
      />
    )}
    {cellTooltip.visible &&
      createPortal(
        (() => {
          const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
          const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
          const maxTop = viewportHeight ? viewportHeight - 150 : cellTooltip.y;
          const maxLeft = viewportWidth ? viewportWidth - 260 : cellTooltip.x;
          return (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{
            top: Math.min(cellTooltip.y, maxTop),
            left: Math.min(cellTooltip.x, maxLeft),
          }}
        >
          <div className="bg-white/95 backdrop-blur rounded-xl shadow-2xl border border-slate-200 p-3 w-64 max-h-64 overflow-auto">
            <div className="text-xs font-semibold text-slate-500 mb-2">
              {cellTooltip.title}
            </div>
            {cellTooltip.transactions.length === 0 ? (
              <p className="text-xs text-slate-400">אין תנועות ליום זה.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-600">
                {cellTooltip.transactions.map((transaction) => (
                  <li key={transaction.id} className="flex justify-between gap-2">
                    <span className="truncate">{transaction.description || transaction.category || 'ללא תיאור'}</span>
                    <span className="font-semibold text-slate-800">
                      ₪{transaction.amount.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 text-xs font-bold text-slate-900 border-t border-slate-100 pt-2">
              סה"כ: ₪{cellTooltip.total.toLocaleString()}
            </div>
          </div>
        </div>
          );
        })(),
        document.body
      )}
    </>
  );
};

export default MonthlyFlow;