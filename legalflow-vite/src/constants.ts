import type { Category, Transaction } from './types';

export const CATEGORIES: Category[] = [
  // 1. Fee Column (Only one implicit category really, but we define it for consistency)
  { id: 'inc_fee', name: 'שכר טרחה', type: 'income', group: 'fee', color: '#10b981' },

  // 2. Other Income Column
  { id: 'inc_other_1', name: 'החזר הוצאות', type: 'income', group: 'other_income', color: '#34d399' },
  { id: 'inc_other_2', name: 'זיכוי', type: 'income', group: 'other_income', color: '#6ee7b7' },
  { id: 'inc_other_3', name: 'החזר מס', type: 'income', group: 'other_income', color: '#a7f3d0' },
  
  // Operational Expenses
  { id: 'e1', name: 'משכורות', type: 'expense', group: 'operational', color: '#dc2626' },
  { id: 'e2', name: 'פנסיות עובדים', type: 'expense', group: 'operational', color: '#b91c1c' },
  { id: 'e3', name: 'קה"ש ליאור', type: 'expense', group: 'operational', color: '#f87171' },
  { id: 'e4', name: 'ריג\'וס', type: 'expense', group: 'operational', color: '#fbbf24' }, // Regus
  { id: 'e5', name: 'גט טקסי', type: 'expense', group: 'operational', color: '#fb923c' },
  { id: 'e6', name: 'ביטוח עסק', type: 'expense', group: 'operational', color: '#fca5a5' },
  { id: 'e7', name: 'כרטיס אשראי', type: 'expense', group: 'operational', color: '#94a3b8' },
  { id: 'e8', name: 'חשבת שכר', type: 'expense', group: 'operational', color: '#ec4899' },
  { id: 'e9', name: 'רישיונות עו"ד', type: 'expense', group: 'operational', color: '#6366f1' },
  { id: 'e10', name: 'ביטוח א. מקצועית', type: 'expense', group: 'operational', color: '#818cf8' },
  { id: 'e11', name: 'פנסיה ליאור', type: 'expense', group: 'operational', color: '#ef4444' },
  { id: 'e12', name: 'אשראי עסקי', type: 'expense', group: 'operational', color: '#cbd5e1' },
  { id: 'e13', name: 'ספיקן', type: 'expense', group: 'operational', color: '#2dd4bf' },
  { id: 'e14', name: 'שכ"ט רו"ח', type: 'expense', group: 'operational', color: '#0d9488' },

  // Taxes
  { id: 't1', name: 'מע"מ', type: 'expense', group: 'tax', color: '#7f1d1d' },
  { id: 't2', name: 'מס הכנסה עובדים', type: 'expense', group: 'tax', color: '#991b1b' },
  { id: 't3', name: 'מס הכנסה אישי', type: 'expense', group: 'tax', color: '#b91c1c' },
  { id: 't4', name: 'ביטוח לאומי עובדים', type: 'expense', group: 'tax', color: '#ef4444' },
  { id: 't5', name: 'ביטוח לאומי אישי', type: 'expense', group: 'tax', color: '#f87171' },
  
  // Loans
  { id: 'l1', name: 'החזר הלוואה מימון ישיר', type: 'expense', group: 'loan', color: '#ea580c' },
  { id: 'l2', name: 'החזר הלוואה פועלים', type: 'expense', group: 'loan', color: '#c2410c' },
  { id: 'l3', name: 'החזר משכנתא', type: 'expense', group: 'loan', color: '#9a3412' },

  // Personal
  { id: 'w1', name: 'משיכה פרטית', type: 'expense', group: 'personal', color: '#a855f7' },
  { id: 'w2', name: 'הוצאות רכב פרטי', type: 'expense', group: 'personal', color: '#9333ea' },
  { id: 'w3', name: 'הוצאות בית', type: 'expense', group: 'personal', color: '#7e22ce' },

  // Bank adjustments
  { id: 'b1', name: 'התאמת בנק', type: 'expense', group: 'bank_adjustment', color: '#0ea5e9' },
];

export const INITIAL_CLIENTS = [
  'שור',
  'לוידס',
  'פלג אורייון',
  'טר ארמה',
  'מ.א.ר',
  'מד"א',
  'היימן',
  'טרם ריטיינר',
  'טרם שעתי',
];

export const PAYMENT_METHODS = [
  { value: 'transfer', label: 'העברה בנקאית' },
  { value: 'check', label: 'המחאה (צ׳ק)' },
  { value: 'credit_card', label: 'כרטיס אשראי' },
  { value: 'cash', label: 'מזומן' },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [];
export const INITIAL_BALANCE = 0;