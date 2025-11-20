import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Plus, Info, Receipt, Car, Home, Download } from 'lucide-react';
import { Transaction, TransactionGroup } from '../types';
import DailyDetailModal from './DailyDetailModal';

interface MonthlyFlowProps {
  transactions: Transaction[];
  initialBalance: number;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void; 
  onAddBatch: (ts: Omit<Transaction, 'id'>[]) => void;
  onDeleteTransaction: (id: string) => void;
  openTransactionForm: (date?: string, type?: 'income' | 'expense', group?: TransactionGroup) => void;
}

const MonthlyFlow: React.FC<MonthlyFlowProps> = ({ 
  transactions, 
  initialBalance, 
  onAddBatch,
  onDeleteTransaction,
  openTransactionForm 
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    date: string;
    group: TransactionGroup;
    transactions: Transaction[];
  } | null>(null);

  // --- Date Logic ---
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  // --- Financial Logic ---
  const monthStartBalance = useMemo(() => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const previousTransactions = transactions.filter(t => {
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
  }, [transactions, currentDate, initialBalance]);

  const dailyData = useMemo(() => {
    let runningBalance = monthStartBalance;
    
    return daysInMonth.map(day => {
      const dateStr = day.toISOString().split('T')[0];
      const dayTransactions = transactions.filter(t => t.date === dateStr);
      
      // Split Income groups
      const feeIncome = dayTransactions.filter(t => t.group === 'fee');
      const otherIncome = dayTransactions.filter(t => t.group === 'other_income');
      
      const operational = dayTransactions.filter(t => t.group === 'operational');
      const tax = dayTransactions.filter(t => t.group === 'tax');
      const loan = dayTransactions.filter(t => t.group === 'loan');
      const personal = dayTransactions.filter(t => t.group === 'personal');
      
      const feeSum = feeIncome.reduce((sum, t) => sum + t.amount, 0);
      const otherIncomeSum = otherIncome.reduce((sum, t) => sum + t.amount, 0);
      
      const operationalSum = operational.reduce((sum, t) => sum + t.amount, 0);
      const taxSum = tax.reduce((sum, t) => sum + t.amount, 0);
      const loanSum = loan.reduce((sum, t) => sum + t.amount, 0);
      const personalSum = personal.reduce((sum, t) => sum + t.amount, 0);
      
      // Daily change
      const dailyChange = (feeSum + otherIncomeSum) - (operationalSum + taxSum + loanSum + personalSum);
      runningBalance += dailyChange;

      return {
        date: day,
        dateStr,
        fee: { sum: feeSum, transactions: feeIncome },
        otherIncome: { sum: otherIncomeSum, transactions: otherIncome },
        operational: { sum: operationalSum, transactions: operational },
        tax: { sum: taxSum, transactions: tax },
        loan: { sum: loanSum, transactions: loan },
        personal: { sum: personalSum, transactions: personal },
        balance: runningBalance
      };
    });
  }, [daysInMonth, transactions, monthStartBalance]);

  const monthSummary = useMemo(() => {
    return dailyData.reduce((acc, day) => ({
        fee: acc.fee + day.fee.sum,
        otherIncome: acc.otherIncome + day.otherIncome.sum,
        tax: acc.tax + day.tax.sum,
        operational: acc.operational + day.operational.sum,
        loan: acc.loan + day.loan.sum,
        personal: acc.personal + day.personal.sum
    }), { fee: 0, otherIncome: 0, tax: 0, operational: 0, loan: 0, personal: 0 });
  }, [dailyData]);

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
    const headers = ['תאריך', 'שכר טרחה', 'הכנסות אחרות', 'הוצאות תפעול', 'מיסים', 'הלוואות', 'משיכות', 'יתרה'];
    const rows = dailyData.map(day => [
      day.date.toLocaleDateString('he-IL'),
      day.fee.sum || '',
      day.otherIncome.sum || '',
      day.operational.sum || '',
      day.tax.sum || '',
      day.loan.sum || '',
      day.personal.sum || '',
      day.balance
    ]);

    const csvContent = '\uFEFF' + [
      headers.join(','), 
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `תזרים_${currentDate.getMonth()+1}_${currentDate.getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val: number) => `₪${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const formatDate = (date: Date) => date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const navigateMonth = (dir: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + dir);
    setCurrentDate(newDate);
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
                <span className="font-bold text-lg">{formatCurrency((monthSummary.fee + monthSummary.otherIncome) - (monthSummary.operational + monthSummary.tax + monthSummary.loan + monthSummary.personal))}</span>
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
                            <th className="px-2 py-3 font-medium bg-slate-800 border-r border-slate-700">יתרה</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                        {dailyData.map((day) => {
                             const isWeekend = day.date.getDay() === 5 || day.date.getDay() === 6; 
                             const isToday = day.dateStr === new Date().toISOString().split('T')[0];
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
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 relative hover:bg-slate-100 bg-emerald-50/30"
                                >
                                    {day.fee.sum > 0 ? (
                                        <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded block">
                                            {formatCurrency(day.fee.sum)}
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-emerald-400" />
                                        </span>
                                    )}
                                </td>

                                {/* OTHER INCOME CELL */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'other_income', day.otherIncome.transactions)}
                                    className="px-1 py-1 cursor-pointer group border-r border-slate-100 hover:bg-slate-100"
                                >
                                    {day.otherIncome.sum > 0 ? (
                                        <span className="font-medium text-emerald-600 block">
                                            {formatCurrency(day.otherIncome.sum)}
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 flex justify-center">
                                            <Plus className="w-4 h-4 text-emerald-300" />
                                        </span>
                                    )}
                                </td>

                                {/* OPERATIONAL */}
                                <td 
                                    onClick={() => handleCellClick(day.dateStr, 'operational', day.operational.transactions)}
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
                                    <span>{formatCurrency(monthSummary.fee)}</span>
                                    <span className="text-[10px] text-emerald-700 border-t border-emerald-300 pt-1 mt-1">
                                        נטו (82%): {formatCurrency(monthSummary.fee * 0.82)}
                                    </span>
                                </div>
                            </td>
                            
                            <td className="px-2 py-3 text-emerald-700 border-r border-slate-300">{formatCurrency(monthSummary.otherIncome)}</td>
                            <td className="px-2 py-3 text-red-600 border-r border-slate-300">{formatCurrency(monthSummary.operational)}</td>
                            <td className="px-2 py-3 text-red-800 border-r border-slate-300">{formatCurrency(monthSummary.tax)}</td>
                            <td className="px-2 py-3 text-orange-600 border-r border-slate-300">{formatCurrency(monthSummary.loan)}</td>
                            <td className="px-2 py-3 text-purple-600 border-r border-slate-300">{formatCurrency(monthSummary.personal)}</td>
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
        onEdit={() => {}}
        onAdd={() => {
             setDetailModalOpen(false);
             const type = (selectedCell.group === 'fee' || selectedCell.group === 'other_income') ? 'income' : 'expense';
             openTransactionForm(selectedCell.date, type, selectedCell.group);
        }}
      />
    )}
    </>
  );
};

export default MonthlyFlow;