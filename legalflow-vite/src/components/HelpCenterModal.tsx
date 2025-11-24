import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type HelpSection = {
  id: string;
  title: string;
  items?: string[];
  subSections?: {
    title: string;
    items: string[];
  }[];
};

const SECTIONS: HelpSection[] = [
  {
    id: 'monthly-flow',
    title: 'תזרים חודשי',
    items: [
      'מה רואים במסך התזרים החודשי – כל יום בשורה, קבוצות (שכר טרחה, הכנסות אחרות, הלוואות, מיסים, הוצאות תפעול, אישי, התאמות בנק).',
      'איך מוסיפים תנועה חדשה – לחיצה על יום/קטגוריה או על כפתור "תנועה חדשה".',
      'איך עורכים תנועה קיימת – לחיצה על היום ואז בחירת התנועה מתוך החלון שנפתח.',
      'מחיקת תנועה – מתוך חלון פירוט יומי, כפתור מחיקה.',
      'סטטוס תנועה – "ממתין" לעומת "בוצע" וכיצד זה משפיע על יתרות.',
      'הלוואות – מה ההבדל בין הלוואה לבין הוצאה רגילה, ומה עושה "סיום הלוואה" אם קיים.',
      'התאמות בנק – תנועות חיוב/זיכוי ידניות שלא שייכות לקטגוריה אחרת.',
      'סימונים וצבעים – איך להבין צבעים, הדגשת היום הנוכחי, שורות סוף חודש וכדומה.',
    ],
  },
  {
    id: 'dashboard',
    title: 'לוח בקרה',
    items: [
      'יתרה נוכחית – איך מחושב הסכום (יתרת פתיחה + הכנסות שבוצעו – הוצאות שבוצעו).',
      'יתרה צפויה לסוף חודש – מחושבת על בסיס התנועות העתידיות בחודש.',
      'רווח תפעולי – הכנסות פחות הוצאות תפעוליות.',
      'רווח נטו – הכנסות פחות כל ההוצאות (כולל מיסים).',
      'גרפים ותרשימים – איך לקרוא את הגרף היומי ואת עוגת ההוצאות.',
      'Smart Insights – התראות חכמות על חודשים חלשים, לקוחות איטיים ועוד.',
    ],
  },
  {
    id: 'collections',
    title: 'תשלומים צפויים ומעקבי גבייה',
    subSections: [
      {
        title: 'מעקב גבייה – לוידס',
        items: [
          'שדות חובה: מספר חשבון עסקה, שם התובע, שם המבוטח, סינדיקט, מועד דרישה, סכום.',
          'ניתן לבחור סינדיקט קיים או להוסיף סינדיקט חדש.',
          'הגדרת שורה כשולמה / פתוחה באמצעות כפתור המצב.',
          'סימון באדום של דרישות ישנות (45/90+ ימים) לצורך מעקב מהיר.',
        ],
      },
      {
        title: 'מעקב גבייה – לקוחות שונים',
        items: [
          'שדות: מספר חשבון עסקה, שם הלקוח, שם התיק, מועד דרישה, סכום.',
          'ניתן לקשר את שם הלקוח לרשימת הלקוחות מהתזרים (שכר טרחה).',
          'חובות מעל 45/90 יום יודגשו בצבעי אזהרה.',
        ],
      },
      {
        title: 'מעקב גבייה – אקסס / השתתפויות עצמאיות',
        items: [
          'שדות מרכזיים: מספר חשבון עסקה, שם המבוטח, שם התיק.',
          'מעקב אחר סה״כ השתתפות עצמית לעומת "חוב נוכחי".',
          'הדגשת חובות בסיכון לפי זמן הגבייה והגדרות הסף.',
        ],
      },
    ],
  },
  {
    id: 'executive-summary',
    title: 'תקציר מנהלים',
    items: [
      'יצירת תקציר חודשי / רבעוני / שנתי בלחיצת כפתור.',
      'התקציר כולל סיכום הכנסות, הוצאות, רווח תפעולי ורווח נטו.',
      'אפשרות לפילוחים לפי סוגי הכנסה/הוצאה, לקוחות ועוד (אם זמינים).',
      'תקציר יומי – הפקת טקסט מוכן לשיתוף כולל כפתור העתקה ל-WhatsApp.',
    ],
  },
  {
    id: 'backup',
    title: 'גיבוי ושחזור',
    items: [
      'ייצוא גיבוי – הורדת קובץ JSON הכולל תנועות, גבייה, יתרות ולקוחות.',
      'ייבוא גיבוי – בחירת קובץ גיבוי קודם לשחזור כל הנתונים.',
      'תזכורת גיבוי – חלון קופץ שמוודא שלא מתנתקים לפני שמירת גיבוי עדכני.',
      'מומלץ לשמור גיבויים בענן או בכונן חיצוני לשמירה על בטיחות המידע.',
    ],
  },
  {
    id: 'alerts',
    title: 'התראות ו-Insights',
    items: [
      'התראות על חובות מתעכבים – סימון 45 יום ו-90 יום ומעלה.',
      'התראות על קפיצה בהוצאות ביחס לחודש הקודם (25% ומעלה).',
      'התראות על לקוחות שמשלמים באיחור לאורך זמן.',
      'פתיחת חלון ההתראות מציגה קבוצות שונות וניווט מהיר לרשומה הרלוונטית.',
    ],
  },
  {
    id: 'tasks',
    title: 'משימות וניהול תיקים',
    items: [
      'יצירת משימה חדשה עבור לקוח או תיק (לדוגמה: שליחת דרישה).',
      'שיוך משימה ללקוח / תיק קיים לצורך מעקב משימות.',
      'סטטוס משימה – פתוחה / בטיפול / הושלמה כדי להשלים מעקב.',
      'מחיקת משימה שאינה רלוונטית יותר.',
    ],
  },
];

const HelpCenterModal: React.FC<HelpCenterModalProps> = ({ isOpen, onClose }) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  if (!isOpen) {
    return null;
  }

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]"
        dir="rtl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">מרכז העזרה – LegalFlow</h2>
            <p className="text-sm text-slate-500 mt-1">
              כאן תוכל לקבל הסבר מפורט על כל המסכים והפיצ'רים במערכת.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 transition-colors"
            aria-label="סגירת מרכז העזרה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {SECTIONS.map(section => {
            const isExpanded = Boolean(openSections[section.id]);
            return (
              <div key={section.id} className="border border-slate-200 rounded-2xl">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-right text-slate-800 font-semibold"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {isExpanded && (
                  <div className="px-5 pb-4 space-y-3 text-sm text-slate-700">
                    {section.items && (
                      <ul className="list-disc pr-5 space-y-1">
                        {section.items.map((item, index) => (
                          <li key={`${section.id}-item-${index}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                    {section.subSections?.map(sub => (
                      <div key={`${section.id}-${sub.title}`} className="space-y-1">
                        <h4 className="font-semibold text-slate-800">{sub.title}</h4>
                        <ul className="list-disc pr-6 space-y-1">
                          {sub.items.map((item, index) => (
                            <li key={`${section.id}-${sub.title}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpCenterModal;

