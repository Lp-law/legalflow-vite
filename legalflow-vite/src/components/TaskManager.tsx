import React, { useMemo, useState } from 'react';
import { Plus, X, Edit2, Trash2, CheckCircle, Circle } from 'lucide-react';
import type { TaskItem } from '../types';
import { parseDateKey } from '../utils/date';

interface TaskManagerProps {
  tasks: TaskItem[];
  onChange: (tasks: TaskItem[]) => void;
}

interface TaskFormState {
  client: string;
  caseName: string;
  amount: string;
  deadline: string;
  status: 'open' | 'completed';
}

const initialFormState: TaskFormState = {
  client: '',
  caseName: '',
  amount: '',
  deadline: '',
  status: 'open',
};

const TaskManager: React.FC<TaskManagerProps> = ({ tasks, onChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [form, setForm] = useState<TaskFormState>(initialFormState);
  const [formError, setFormError] = useState('');

  const today = useMemo(() => new Date(), []);

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const dateA = parseDateKey(a.deadline);
        const dateB = parseDateKey(b.deadline);
        return dateA.getTime() - dateB.getTime();
      }),
    [tasks]
  );

  const resetForm = () => {
    setForm(initialFormState);
    setFormError('');
    setEditingTask(null);
  };

  const openModalForNew = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openModalForEdit = (task: TaskItem) => {
    setEditingTask(task);
    setForm({
      client: task.client,
      caseName: task.caseName,
      amount: task.amount ? task.amount.toString() : '',
      deadline: task.deadline,
      status: task.status,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!form.client.trim()) {
      setFormError('חובה להזין שם לקוח');
      return;
    }
    if (!form.caseName.trim()) {
      setFormError('חובה להזין שם תיק');
      return;
    }
    if (!form.deadline) {
      setFormError('חובה לבחור תאריך יעד');
      return;
    }
    const now = new Date().toISOString();
    const amountNumber = Number(form.amount);
    const sanitizedAmount =
      Number.isFinite(amountNumber) && amountNumber > 0 ? Number(amountNumber.toFixed(2)) : undefined;

    if (editingTask) {
      const updated = tasks.map(task =>
        task.id === editingTask.id
          ? {
              ...task,
              client: form.client.trim(),
              caseName: form.caseName.trim(),
              amount: sanitizedAmount,
              deadline: form.deadline,
              status: form.status,
              updatedAt: now,
            }
          : task
      );
      onChange(updated);
    } else {
      const newTask: TaskItem = {
        id: crypto.randomUUID(),
        client: form.client.trim(),
        caseName: form.caseName.trim(),
        amount: sanitizedAmount,
        deadline: form.deadline,
        status: form.status,
        createdAt: now,
        updatedAt: now,
      };
      onChange([...tasks, newTask]);
    }

    setIsModalOpen(false);
    resetForm();
  };

  const handleDelete = (taskId: string) => {
    if (!window.confirm('האם למחוק משימה זו?')) return;
    onChange(tasks.filter(task => task.id !== taskId));
  };

  const toggleStatus = (task: TaskItem) => {
    const now = new Date().toISOString();
    onChange(
      tasks.map(item =>
        item.id === task.id
          ? { ...item, status: item.status === 'completed' ? 'open' : 'completed', updatedAt: now }
          : item
      )
    );
  };

  const isOverdue = (task: TaskItem) => {
    if (task.status === 'completed') return false;
    const deadline = parseDateKey(task.deadline);
    deadline.setHours(23, 59, 59, 999);
    return deadline.getTime() < today.getTime();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">משימות</h1>
          <p className="text-sm text-slate-500">נהל דרישות ומשימות גבייה בצורה מסודרת</p>
        </div>
        <button
          onClick={openModalForNew}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
        >
          <Plus className="w-4 h-4" />
          משימה חדשה
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold">
              <tr>
                <th className="px-4 py-3 text-right">לקוח</th>
                <th className="px-4 py-3 text-right">תיק</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">סכום</th>
                <th className="px-4 py-3 text-right">דדליין</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">סטטוס</th>
                <th className="px-4 py-3 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">
                    אין משימות כרגע. לחץ על "משימה חדשה" כדי להתחיל.
                  </td>
                </tr>
              ) : (
                sortedTasks.map(task => {
                  const overdue = isOverdue(task);
                  const deadlineText = parseDateKey(task.deadline).toLocaleDateString('he-IL');
                  return (
                    <tr
                      key={task.id}
                      className={`transition-colors ${
                        overdue ? 'bg-red-50 text-red-700' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-4 font-semibold">{task.client}</td>
                      <td className="px-4 py-4">{task.caseName}</td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        {task.amount ? `₪${task.amount.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-4 font-medium">
                        {deadlineText}
                        {overdue && <span className="block text-xs text-red-500">באיחור</span>}
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <button
                          onClick={() => toggleStatus(task)}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                            task.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {task.status === 'completed' ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              בוצע
                            </>
                          ) : (
                            <>
                              <Circle className="w-3 h-3" />
                              פתוח
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={() => openModalForEdit(task)}
                            className="text-slate-500 hover:text-slate-800 transition"
                            aria-label="עריכה"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            className="text-rose-500 hover:text-rose-700 transition"
                            aria-label="מחיקה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 p-6 space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editingTask ? 'עריכת משימה' : 'משימה חדשה'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">לקוח</label>
                <input
                  type="text"
                  value={form.client}
                  onChange={e => setForm(current => ({ ...current, client: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">תיק</label>
                <input
                  type="text"
                  value={form.caseName}
                  onChange={e => setForm(current => ({ ...current, caseName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium text-slate-700">סכום (אופציונלי)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.amount}
                    onChange={e => setForm(current => ({ ...current, amount: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="₪"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-slate-700">דדליין</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={e => setForm(current => ({ ...current, deadline: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">סטטוס</label>
                <select
                  value={form.status}
                  onChange={e => setForm(current => ({ ...current, status: e.target.value as 'open' | 'completed' }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="open">פתוח</option>
                  <option value="completed">בוצע</option>
                </select>
              </div>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                שמירה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskManager;

