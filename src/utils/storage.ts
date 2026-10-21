import { AppData, BudgetCategory, Transaction } from '../types';

const STORAGE_KEY = 'budget_tracker_v1';

export const DEFAULT_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#22C55E', '#F97316', '#EC4899', '#06B6D4', '#EF4444',
  '#14B8A6', '#A855F7',
];

const DEFAULT_CATEGORIES: BudgetCategory[] = [
  {
    id: '1', name: 'Rent', limit: 2600, color: '#6366F1',
    keywords: ['rent', 'lease', 'mortgage', 'property management'],
  },
  {
    id: '2', name: 'Utilities & Internet', limit: 200, color: '#F59E0B',
    keywords: ['electric', 'gas', 'water', 'internet', 'comcast', 'xfinity', 'pg&e', 'utility', 'utilities', 'pge', 'con ed', 'coned'],
  },
  {
    id: '3', name: 'Phone', limit: 15, color: '#10B981',
    keywords: ['verizon', 'at&t', 't-mobile', 'tmobile', 'sprint', 'wireless', 'cellular'],
  },
  {
    id: '4', name: 'Transportation', limit: 150, color: '#3B82F6',
    keywords: ['uber', 'lyft', 'transit', 'mta', 'bart', 'metro', 'shell', 'chevron', 'exxon', 'bp', 'sunoco', 'fuel', 'gas station', 'parking', 'toll', 'clipper', 'caltrain', 'amtrak'],
  },
  {
    id: '5', name: 'Subscriptions', limit: 40, color: '#8B5CF6',
    keywords: ['netflix', 'spotify', 'hulu', 'disney+', 'disney plus', 'apple', 'amazon prime', 'youtube premium', 'subscription', 'membership', 'patreon', 'notion', 'adobe'],
  },
  {
    id: '6', name: 'Groceries', limit: 400, color: '#22C55E',
    keywords: ['whole foods', 'trader joe', 'kroger', 'safeway', 'aldi', 'publix', 'costco', 'grocery', 'market', 'fresh market', 'food lion', 'stop & shop', 'wegmans', 'sprouts', 'hmart', 'h mart'],
  },
  {
    id: '7', name: 'Eating Out', limit: 400, color: '#F97316',
    keywords: ['restaurant', 'mcdonald', 'starbucks', 'chipotle', 'doordash', 'uber eats', 'grubhub', 'pizza', 'cafe', 'diner', 'taco bell', 'burger', 'sushi', 'thai', 'chinese', 'italian', 'yelp', 'dunkin', 'panera', 'subway', 'chick-fil-a', 'popeyes', 'wendy'],
  },
  {
    id: '8', name: 'Shopping & Hobbies', limit: 300, color: '#EC4899',
    keywords: ['amazon', 'target', 'walmart', 'nordstrom', 'clothing', 'apparel', 'hobby', 'etsy', 'ebay', 'best buy', 'apple store', 'zara', 'h&m', 'gap', 'old navy', 'macy'],
  },
  {
    id: '9', name: 'Travel', limit: 300, color: '#06B6D4',
    keywords: ['airbnb', 'hotel', 'motel', 'expedia', 'booking', 'delta', 'united', 'american airlines', 'southwest', 'airline', 'flight', 'marriott', 'hilton', 'vrbo', 'kayak'],
  },
  {
    id: '10', name: 'Emergency Savings', limit: 600, color: '#EF4444',
    keywords: ['savings transfer', 'emergency fund', 'high yield savings'],
  },
  {
    id: '11', name: 'Roth IRA', limit: 200, color: '#14B8A6',
    keywords: ['fidelity', 'vanguard', 'schwab', 'roth ira', 'investment', 'brokerage', 'betterment', 'wealthfront'],
  },
];

export const loadData = (): AppData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { categories: DEFAULT_CATEGORIES, transactions: [], monthlyIncome: 5235, categoryMemory: {} };
    }
    const parsed = JSON.parse(raw) as AppData;
    // Migrate: default type to 'expense' for transactions saved before this field existed
    parsed.transactions = parsed.transactions.map(t => ({
      ...t,
      type: (t.type ?? 'expense') as Transaction['type'],
    }));
    // Migrate: add categoryMemory if not present
    parsed.categoryMemory = parsed.categoryMemory ?? {};
    return parsed;
  } catch {
    return { categories: DEFAULT_CATEGORIES, transactions: [], monthlyIncome: 5235, categoryMemory: {} };
  }
};

export const saveData = (data: AppData): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};
