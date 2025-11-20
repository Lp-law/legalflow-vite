import React, { useState, useMemo } from 'react';
import type { Transaction } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PieChart, BarChart3 } from 'lucide-react';

interface FinancialAnalysisProps {
  transactions: Transaction[];
  mode: 'income' | 'expense'; // Income analyzes Clients (description), Expense analyzes Categories
}

type TimeFrame = 'month' | 'quarter' | 'year';

const FinancialAnalysis: React.FC<FinancialAnalysisProps> = ({ transactions, mode }) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('month');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth); // 0-11
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(currentMonth / 3) + 1); // 1-4

  // -- Helpers --
  const quarters = [
    { id: 1, label: 'רבעון 1 (ינו-מרץ)' },
    { id: 2, label: 'רבעון 2 (אפר-יוני)' },
    { id: 3, label: 'רבעון 3 (יולי-ספט)' },
    { id: 4, label: 'רבעון 4 (אוק-דצמ)' },
  ];

  const months = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];

  // -- Filter Data --
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 1. Filter by Type (Income vs Expense)
      if (t.type !== mode) return false;

      const tDate = new Date(t.date);
      const tYear = tDate.getFullYear();
      const tMonth = tDate.getMonth();

      // 2. Filter by Year
      if (tYear !== selectedYear) return false;

      // 3. Filter by TimeFrame
      if (timeFrame === 'month') {
        return tMonth === selectedMonth;
      } else if (timeFrame === 'quarter') {
        const tQuarter = Math.floor(tMonth / 3) + 1;
        return tQuarter === selectedQuarter;
      }
      
      // If 'year', we already filtered by year above
      return true;
    });
  }, [transactions, mode, timeFrame, selectedYear, selectedMonth, selectedQuarter]);

  // -- Aggregate Data --
  const aggregatedData = useMemo(() => {
    const grouped: Record<string, number> = {};
    let totalSum = 0;

    filteredTransactions.forEach(t => {
      // For Income -> Group by Client (Description field holds client name in this app flow)
      // For Expense -> Group by Category
      const key = mode === 'income' ? (t.description || 'ללא שם') : t.category;
      
      grouped[key] = (grouped[key] || 0) + t.amount;
      totalSum += t.amount;
    });

    // Convert to array for charts/tables
    const result = Object.entries(grouped)
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalSum > 0 ? (value / totalSum) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value); // Sort descending

    return { data: result, total: totalSum };
  }, [filteredTransactions, mode]);

  // -- Colors --
  const COLORS = mode === 'income' 
    ? ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#059669', '#047857'] // Greens
    : ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#b91c1c', '#991b1b']; // Reds

  return (
    <div className="space-y-6">
      {/* Controls Header */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-2">
           <div className={`p-2 rounded-lg ${mode === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
             {mode === 'income' ? <PieChart className="w-6 h-6" /> : <BarChart3 className="w-6 h-6" />}
           </div>
           <h2 className="text-xl font-bold text-slate-800">
             {mode === 'income' ? 'פילוח הכנסות לפי לקוח' : 'פילוח הוצאות לפי קטגוריה'}
           </h2>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
            {/* TimeFrame Selector */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                    onClick={() => setTimeFrame('month')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${timeFrame === 'month' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    חודשי
                </button>
                <button 
                    onClick={() => setTimeFrame('quarter')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${timeFrame === 'quarter' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    רבעוני
                </button>
                <button 
                    onClick={() => setTimeFrame('year')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${timeFrame === 'year' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    שנתי
                </button>
            </div>

            {/* Year Selector */}
            <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
            >
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                ))}
            </select>

            {/* Conditional Selectors */}
            {timeFrame === 'month' && (
                <select 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                >
                    {months.map((m, idx) => (
                        <option key={idx} value={idx}>{m}</option>
                    ))}
                </select>
            )}

            {timeFrame === 'quarter' && (
                <select 
                    value={selectedQuarter} 
                    onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                    className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                >
                    {quarters.map(q => (
                        <option key={q.id} value={q.id}>{q.label}</option>
                    ))}
                </select>
            )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Total Card */}
         <div className={`p-6 rounded-xl shadow-sm border border-slate-100 text-white ${mode === 'income' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            <p className="text-emerald-100 text-sm font-medium mb-1 opacity-80">סה"כ {mode === 'income' ? 'הכנסות' : 'הוצאות'} לתקופה</p>
            <p className="text-3xl font-bold">₪{aggregatedData.total.toLocaleString()}</p>
         </div>
         
         {/* Top Item Card */}
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <p className="text-slate-500 text-sm font-medium mb-1">
                 {mode === 'income' ? 'הלקוח המוביל' : 'הקטגוריה הגדולה ביותר'}
             </p>
             {aggregatedData.data.length > 0 ? (
                 <div>
                     <p className="text-2xl font-bold text-slate-800">{aggregatedData.data[0].name}</p>
                     <p className="text-sm text-slate-400">₪{aggregatedData.data[0].value.toLocaleString()}</p>
                 </div>
             ) : (
                 <p className="text-slate-400 italic">אין נתונים</p>
             )}
         </div>

         {/* Count Card */}
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <p className="text-slate-500 text-sm font-medium mb-1">מספר {mode === 'income' ? 'לקוחות פעילים' : 'קטגוריות פעילות'}</p>
             <p className="text-3xl font-bold text-slate-800">{aggregatedData.data.length}</p>
         </div>
      </div>

      {/* Chart & Table Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-[400px]">
              <h3 className="text-lg font-bold text-slate-800 mb-6">תצוגה גרפית</h3>
              {aggregatedData.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={aggregatedData.data.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={100} 
                            tick={{fontSize: 11, fill: '#64748b'}} 
                            interval={0}
                          />
                          <Tooltip 
                             cursor={{fill: '#f1f5f9'}}
                             formatter={(value: number) => `₪${value.toLocaleString()}`}
                             contentStyle={{ borderRadius: '8px', direction: 'rtl' }}
                          />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                             {aggregatedData.data.slice(0, 10).map((_, index) => (
                                 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
              ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">
                      אין נתונים להצגה בתקופה שנבחרה
                  </div>
              )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800">פירוט מלא</h3>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                      <thead className="bg-slate-50 text-slate-500 font-medium">
                          <tr>
                              <th className="px-6 py-3">{mode === 'income' ? 'שם לקוח' : 'קטגוריה'}</th>
                              <th className="px-6 py-3">סכום</th>
                              <th className="px-6 py-3">% מסה"כ</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {aggregatedData.data.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                  <td className="px-6 py-3 font-medium text-slate-700">{item.name}</td>
                                  <td className="px-6 py-3 font-bold text-slate-800">₪{item.value.toLocaleString()}</td>
                                  <td className="px-6 py-3 text-slate-500">
                                      <div className="flex items-center gap-2">
                                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                              <div 
                                                className={`h-full rounded-full ${mode === 'income' ? 'bg-emerald-500' : 'bg-red-500'}`} 
                                                style={{ width: `${item.percentage}%` }}
                                              ></div>
                                          </div>
                                          {item.percentage.toFixed(1)}%
                                      </div>
                                  </td>
                              </tr>
                          ))}
                          {aggregatedData.data.length === 0 && (
                              <tr>
                                  <td colSpan={3} className="px-6 py-10 text-center text-slate-400">
                                      לא נמצאו נתונים
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>

      </div>
    </div>
  );
};

export default FinancialAnalysis;