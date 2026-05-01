import type { Transaction, TransactionGroup } from '../types';

export type CategorySuggestion = {
  category: string;
  confidence: number;
  reason?: string;
};

const KEYWORD_CATEGORY_MAP: Record<string, string> = {
  טרם: 'שכר טרחה',
  לוידס: 'שכר טרחה',
  ריגוס: 'הוצאות משרד',
  regus: 'הוצאות משרד',
  שכירות: 'שכר דירה',
  דמי: 'שכר דירה',
  נסיעה: 'נסיעות',
  טיסה: 'נסיעות',
};

const DEFAULT_CATEGORY_BY_GROUP: Partial<Record<TransactionGroup, string>> = {
  fee: 'שכר טרחה',
  other_income: 'הכנסות אחרות',
  operational: 'הוצאות משרד',
  tax: 'מיסים',
  loan: 'הלוואות',
  personal: 'משיכות פרטיות',
  bank_adjustment: 'התאמת בנק',
};

const computeSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  const shorter = a.length > b.length ? b : a;
  const longer = a.length > b.length ? a : b;
  let same = 0;
  for (let i = 0; i < shorter.length; i += 1) {
    if (longer.includes(shorter[i])) {
      same += 1;
    }
  }
  return same / longer.length;
};

export const suggestCategoryForTransaction = (
  draft: Partial<Transaction>,
  history: Transaction[] = []
): CategorySuggestion | null => {
  const normalizedDescription = (draft.description || '').trim().toLowerCase();
  if (!normalizedDescription && !history.length) {
    return null;
  }

  for (const keyword of Object.keys(KEYWORD_CATEGORY_MAP)) {
    if (normalizedDescription.includes(keyword)) {
      return {
        category: KEYWORD_CATEGORY_MAP[keyword],
        confidence: 0.95,
        reason: `זוהה ביטוי "${keyword}"`,
      };
    }
  }

  if (history.length && normalizedDescription) {
    const similar = history
      .filter(item => item.category && item.category.trim())
      .map(item => ({
        similarity: computeSimilarity(normalizedDescription, item.description?.toLowerCase() || ''),
        category: item.category,
      }))
      .filter(item => item.similarity >= 0.45)
      .sort((a, b) => b.similarity - a.similarity);
    if (similar.length) {
      return {
        category: similar[0].category!,
        confidence: Math.min(0.9, similar[0].similarity),
        reason: 'נבחר לפי תנועות דומות בעבר',
      };
    }
  }

  if (draft.group && DEFAULT_CATEGORY_BY_GROUP[draft.group]) {
    return {
      category: DEFAULT_CATEGORY_BY_GROUP[draft.group]!,
      confidence: 0.5,
      reason: 'ברירת מחדל לפי קבוצה',
    };
  }

  return null;
};
