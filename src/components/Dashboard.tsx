import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, DollarSign, AlertTriangle, CheckCircle, Info, Edit2, Check, X } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BudgetCategory, Transaction } from '../types';

interface Props {
  categories: BudgetCategory[];
  transactions: Transaction[];
  monthlyIncome: number;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onIncomeChange: (income: number) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDec = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

function stepMonth(ym: string, dir: 1 | -1): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function getBarColor(pct: number): string {
  if (pct > 100) return 'bg-red-500';
  if (pct > 80) return 'bg-orange-400';
  if (pct > 60) return 'bg-yellow-400';
  return 'bg-emerald-500';
}

function getBarTrack(pct: number): string {
  if (pct > 100) return 'bg-red-100';
  if (pct > 80) return 'bg-orange-100';
  if (pct > 60) return 'bg-yellow-100';
  return 'bg-emerald-100';
}

interface Rec { type: 'danger' | 'warn' | 'good' | 'info'; text: string }

export default function Dashboard({ categories, transactions, monthlyIncome, selectedMonth, onMonthChange, onIncomeChange }: Props) {
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState(String(monthlyIncome));
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const monthTransactions = useMemo(() =>
    transactions.filter(t => t.date.startsWith(selectedMonth)),
    [transactions, selectedMonth]
  );

  const monthExpenses = useMemo(() =>
    monthTransactions.filter(t => t.type === 'expense'),
    [monthTransactions]
  );

  const spendingByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthExpenses) {
      if (t.categoryId) {
        map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
      }
    }
    return map;
  }, [monthExpenses]);

  const uncategorizedTotal = useMemo(() =>
    monthExpenses.filter(t => !t.categoryId).reduce((sum, t) => sum + t.amount, 0),
    [monthExpenses]
  );

  const totalSpent = useMemo(() =>
    monthExpenses.reduce((sum, t) => sum + t.amount, 0),
    [monthExpenses]
  );

  const creditIncome = useMemo(() =>
    monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
    [monthTransactions]
  );

  const effectiveIncome = monthlyIncome + creditIncome;

  const totalBudget = useMemo(() =>
    categories.reduce((sum, c) => sum + c.limit, 0),
    [categories]
  );

  const pieData = useMemo(() => {
    const items = categories
      .map(cat => ({ name: cat.name, value: spendingByCategory.get(cat.id) ?? 0, color: cat.color }))
      .filter(d => d.value > 0);
    if (uncategorizedTotal > 0) {
      items.push({ name: 'Uncategorized', value: uncategorizedTotal, color: '#9CA3AF' });
    }
    return items;
  }, [categories, spendingByCategory, uncategorizedTotal]);

  const recommendations = useMemo((): Rec[] => {
    const recs: Rec[] = [];
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const dayOfMonth = today.getFullYear() === year && today.getMonth() + 1 === month
      ? today.getDate() : daysInMonth;
    const monthFraction = Math.min(dayOfMonth / daysInMonth, 1);

    for (const cat of categories) {
      const spent = spendingByCategory.get(cat.id) ?? 0;
      const pct = (spent / cat.limit) * 100;
      if (pct > 100) {
        recs.push({ type: 'danger', text: `You've exceeded your ${cat.name} budget by ${fmtDec(spent - cat.limit)}.` });
      } else if (pct > 85) {
        recs.push({ type: 'warn', text: `${cat.name} is at ${Math.round(pct)}% (${fmtDec(cat.limit - spent)} remaining). Watch your spending here.` });
      }
    }

    if (uncategorizedTotal > 0) {
      recs.push({ type: 'info', text: `${fmtDec(uncategorizedTotal)} in transactions are uncategorized. Head to Transactions to label them.` });
    }

    const expectedSpend = totalBudget * monthFraction;
    if (totalSpent > expectedSpend * 1.15) {
      recs.push({ type: 'warn', text: `You're spending faster than expected for this point in the month. ${fmtDec(totalBudget - totalSpent)} remaining in total budget.` });
    } else if (monthFraction > 0.5 && totalSpent < expectedSpend * 0.6) {
      recs.push({ type: 'good', text: `Great pacing! You've only used ${Math.round((totalSpent / totalBudget) * 100)}% of your budget halfway through the month.` });
    }

    const remaining = effectiveIncome - totalSpent;
    if (remaining > 0) {
      recs.push({ type: 'good', text: `You have ${fmtDec(remaining)} remaining from your monthly income.` });
    }

    if (recs.length === 0) {
      recs.push({ type: 'info', text: 'Upload your bank statements to see personalized recommendations.' });
    }

    return recs;
  }, [categories, spendingByCategory, uncategorizedTotal, totalBudget, totalSpent, monthlyIncome, selectedMonth]);

  const handleIncomeSave = () => {
    const v = parseFloat(incomeInput.replace(/[$,]/g, ''));
    if (!isNaN(v) && v >= 0) onIncomeChange(v);
    setEditingIncome(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 text-sm mt-0.5">Track your monthly budget</p>
        </div>
        {/* Month selector */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
          <button onClick={() => onMonthChange(stepMonth(selectedMonth, -1))} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">{monthLabel(selectedMonth)}</span>
          <button onClick={() => onMonthChange(stepMonth(selectedMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Income card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Monthly Income</span>
            <button onClick={() => { setIncomeInput(String(monthlyIncome)); setEditingIncome(true); }} className="text-gray-400 hover:text-indigo-600" title="Edit salary/take-home">
              <Edit2 size={13} />
            </button>
          </div>
          {editingIncome ? (
            <div className="flex items-center gap-1 mt-1">
              <input
                className="w-full text-sm border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={incomeInput}
                onChange={e => setIncomeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleIncomeSave(); if (e.key === 'Escape') setEditingIncome(false); }}
                autoFocus
              />
              <button onClick={handleIncomeSave} className="text-emerald-600 hover:text-emerald-700"><Check size={16} /></button>
              <button onClick={() => setEditingIncome(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
          ) : (
            <>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(effectiveIncome)}</p>
              {creditIncome > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">{fmt(monthlyIncome)} salary · <span className="text-emerald-600">+{fmtDec(creditIncome)} credits</span></p>
              )}
            </>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Budget</span>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalBudget)}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Spent</span>
            <TrendingDown size={12} className="text-red-400" />
          </div>
          <p className="text-xl font-bold text-red-600 mt-0">{fmt(totalSpent)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{Math.round((totalSpent / (totalBudget || 1)) * 100)}% of budget</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Remaining</span>
            <TrendingUp size={12} className="text-emerald-400" />
          </div>
          <p className={`text-xl font-bold mt-0 ${effectiveIncome - totalSpent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmt(Math.abs(effectiveIncome - totalSpent))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{effectiveIncome - totalSpent >= 0 ? 'left this month' : 'over income'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pie chart */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-indigo-500" />
            Spending Breakdown
          </h3>
          {pieData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Upload size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No transactions for {monthLabel(selectedMonth)}</p>
              <p className="text-xs mt-1">Upload your bank statements to get started</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtDec(v)} />
                <Legend
                  formatter={(value, entry) => {
                    const pct = Math.round(((entry.payload as { value: number }).value / totalSpent) * 100);
                    return `${value} (${pct}%)`;
                  }}
                  wrapperStyle={{ fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recommendations */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Recommendations
          </h3>
          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <div key={i} className={`flex gap-3 p-3 rounded-lg ${
                rec.type === 'danger' ? 'bg-red-50 text-red-700' :
                rec.type === 'warn' ? 'bg-amber-50 text-amber-700' :
                rec.type === 'good' ? 'bg-emerald-50 text-emerald-700' :
                'bg-blue-50 text-blue-700'
              }`}>
                <span className="mt-0.5 flex-shrink-0">
                  {rec.type === 'danger' && <AlertTriangle size={15} />}
                  {rec.type === 'warn' && <AlertTriangle size={15} />}
                  {rec.type === 'good' && <CheckCircle size={15} />}
                  {rec.type === 'info' && <Info size={15} />}
                </span>
                <p className="text-xs leading-relaxed">{rec.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category progress bars */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Category Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {categories.map(cat => {
            const spent = spendingByCategory.get(cat.id) ?? 0;
            const pct = Math.min((spent / cat.limit) * 100, 100);
            const rawPct = (spent / cat.limit) * 100;
            const isOpen = expandedCat === cat.id;
            const catTxCount = monthExpenses.filter(t => t.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setExpandedCat(isOpen ? null : cat.id)}
                className={`text-left rounded-lg p-2 -m-2 transition-colors hover:bg-gray-50 ${isOpen ? 'bg-gray-50 ring-1 ring-gray-200' : ''}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                    <span className="text-xs text-gray-400">({catTxCount})</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">{fmtDec(spent)} / {fmt(cat.limit)}</span>
                    {rawPct > 100 && (
                      <span className="ml-2 text-xs font-bold text-red-600">+{fmtDec(spent - cat.limit)}</span>
                    )}
                  </div>
                </div>
                <div className={`w-full h-2.5 rounded-full ${getBarTrack(rawPct)}`}>
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${getBarColor(rawPct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-xs text-gray-400">{Math.round(rawPct)}% used</span>
                  <span className="text-xs text-gray-400">
                    {spent > cat.limit ? 'Over by ' + fmtDec(spent - cat.limit) : fmtDec(cat.limit - spent) + ' left'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Expanded transaction table — shown below the full grid */}
        {expandedCat && (() => {
          const cat = categories.find(c => c.id === expandedCat)!;
          const catTxs = monthExpenses
            .filter(t => t.categoryId === expandedCat)
            .sort((a, b) => b.date.localeCompare(a.date));
          const spent = spendingByCategory.get(expandedCat) ?? 0;
          return (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm font-semibold text-gray-700">{cat.name} — {monthLabel(selectedMonth)}</span>
                </div>
                <button onClick={() => setExpandedCat(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={15} />
                </button>
              </div>
              {catTxs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No transactions in this category for {monthLabel(selectedMonth)}.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">Date</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">Description</th>
                        <th className="text-right px-4 py-2 text-gray-500 font-medium">Amount</th>
                        <th className="text-right px-4 py-2 text-gray-500 font-medium">Bank</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {catTxs.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{t.date}</td>
                          <td className="px-4 py-2 text-gray-700 break-words">{t.description}</td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtDec(t.amount)}</td>
                          <td className="px-4 py-2 text-right text-gray-400 whitespace-nowrap">{t.bank}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={2} className="px-4 py-2 font-semibold text-gray-600">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-gray-800">{fmtDec(spent)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {uncategorizedTotal > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">Uncategorized transactions</span>
            <span className="font-semibold text-gray-700">{fmtDec(uncategorizedTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export Upload icon locally to avoid import issues
function Upload({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
