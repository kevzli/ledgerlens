import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Tag } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { BudgetCategory } from '../types';
import { DEFAULT_COLORS } from '../utils/storage';

interface Props {
  categories: BudgetCategory[];
  onUpdate: (categories: BudgetCategory[]) => void;
}

const EMPTY_FORM = { name: '', limit: '', color: DEFAULT_COLORS[0], keywords: '' };

export default function BudgetSetup({ categories, onUpdate }: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const totalBudget = categories.reduce((s, c) => s + c.limit, 0);

  const handleEdit = (cat: BudgetCategory) => {
    setEditId(cat.id);
    setForm({ name: cat.name, limit: String(cat.limit), color: cat.color, keywords: cat.keywords.join(', ') });
    setShowAdd(false);
    setError('');
  };

  const handleSave = (id: string) => {
    const name = form.name.trim();
    const limit = parseFloat(form.limit);
    if (!name) { setError('Name is required.'); return; }
    if (isNaN(limit) || limit < 0) { setError('Enter a valid limit.'); return; }
    const keywords = form.keywords.split(',').map(k => k.trim()).filter(Boolean);
    onUpdate(categories.map(c => c.id === id ? { ...c, name, limit, color: form.color, keywords } : c));
    setEditId(null);
    setError('');
  };

  const handleAdd = () => {
    const name = form.name.trim();
    const limit = parseFloat(form.limit);
    if (!name) { setError('Name is required.'); return; }
    if (isNaN(limit) || limit < 0) { setError('Enter a valid limit.'); return; }
    const keywords = form.keywords.split(',').map(k => k.trim()).filter(Boolean);
    const usedColors = new Set(categories.map(c => c.color));
    const color = form.color || DEFAULT_COLORS.find(c => !usedColors.has(c)) || DEFAULT_COLORS[0];
    onUpdate([...categories, { id: uuidv4(), name, limit, color, keywords }]);
    setForm(EMPTY_FORM);
    setShowAdd(false);
    setError('');
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this category? Transactions linked to it will become uncategorized.')) {
      onUpdate(categories.filter(c => c.id !== id));
    }
  };

  const openAdd = () => {
    setShowAdd(true);
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Budget Setup</h2>
          <p className="text-gray-500 text-sm mt-0.5">Total budget: <span className="font-semibold text-gray-700">${totalBudget.toLocaleString()}/month</span></p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors"
        >
          <Plus size={16} /> Add Category
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-indigo-200 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">New Category</h3>
          <CategoryForm form={form} onChange={setForm} error={error} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleAdd} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Check size={14} /> Save
            </button>
            <button onClick={() => { setShowAdd(false); setError(''); }} className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category list */}
      <div className="space-y-3">
        {categories.map(cat => (
          <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {editId === cat.id ? (
              <div className="p-5">
                <CategoryForm form={form} onChange={setForm} error={error} />
                <div className="flex gap-2 mt-4">
                  <button onClick={() => handleSave(cat.id)} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                    <Check size={14} /> Save
                  </button>
                  <button onClick={() => { setEditId(null); setError(''); }} className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg">
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">{cat.name}</span>
                    <span className="text-sm font-medium text-indigo-600">${cat.limit.toLocaleString()}/mo</span>
                  </div>
                  {cat.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {cat.keywords.slice(0, 6).map(kw => (
                        <span key={kw} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          <Tag size={9} />{kw}
                        </span>
                      ))}
                      {cat.keywords.length > 6 && (
                        <span className="text-xs text-gray-400">+{cat.keywords.length - 6} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleEdit(cat)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(cat.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p>No budget categories yet.</p>
          <button onClick={openAdd} className="mt-2 text-indigo-600 hover:underline text-sm">Add your first category</button>
        </div>
      )}
    </div>
  );
}

interface FormProps {
  form: { name: string; limit: string; color: string; keywords: string };
  onChange: (f: { name: string; limit: string; color: string; keywords: string }) => void;
  error: string;
}

function CategoryForm({ form, onChange, error }: FormProps) {
  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category Name</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.name}
            onChange={e => onChange({ ...form, name: e.target.value })}
            placeholder="e.g. Groceries"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Limit ($)</label>
          <input
            type="number"
            min="0"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.limit}
            onChange={e => onChange({ ...form, limit: e.target.value })}
            placeholder="e.g. 400"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Color</label>
        <div className="flex gap-2 flex-wrap">
          {DEFAULT_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...form, color: c })}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Auto-categorization Keywords <span className="text-gray-400 font-normal">(comma-separated)</span>
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          rows={2}
          value={form.keywords}
          onChange={e => onChange({ ...form, keywords: e.target.value })}
          placeholder="e.g. whole foods, trader joe, kroger, safeway"
        />
        <p className="text-xs text-gray-400 mt-1">Transactions matching these keywords will be auto-categorized.</p>
      </div>
    </div>
  );
}
