export interface BudgetCategory {
  id: string;
  name: string;
  limit: number;
  color: string;
  keywords: string[];
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // Always positive; direction determined by type
  type: 'expense' | 'income'; // expense = money out, income = credit/deposit/refund
  categoryId: string | null;
  bank: string;
}

export type Page = 'dashboard' | 'budget' | 'upload' | 'transactions';

export interface AppData {
  categories: BudgetCategory[];
  transactions: Transaction[];
  monthlyIncome: number;
  categoryMemory: Record<string, string>; // normalized description → categoryId
}
