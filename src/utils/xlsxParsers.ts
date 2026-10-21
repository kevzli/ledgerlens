import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../types';

// Parse an Amex XLSX export.
// Amex exports columns: Date, Description, Amount, Extended Details,
// Appears On Your Statement As, Address, City/State, Zip Code, Country, Reference, Category
// Amount is negative for charges (expenses), positive for credits/payments.
export const parseAmexXLSX = async (file: File): Promise<{ transactions: Transaction[]; bank: string; categoryHints: Record<string, string> }> => {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

  if (rows.length < 2) throw new Error('No data found in Excel file.');

  // Find header row (first row containing "Date" and "Amount")
  let headerIdx = 0;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = (rows[i] as string[]).map(c => String(c ?? '').toLowerCase().trim());
    if (row.some(c => c === 'date') && row.some(c => c.includes('amount'))) {
      headerIdx = i;
      headers = row;
      break;
    }
  }

  if (!headers.length) throw new Error('Could not find header row with Date and Amount columns.');

  const col = (name: string) => headers.findIndex(h => h.includes(name));
  const dateCol = col('date');
  const amtCol = col('amount');
  const descCol = col('description');
  const catCol = col('category');

  if (dateCol === -1 || amtCol === -1) throw new Error('Could not find required Date or Amount columns.');

  const transactions: Transaction[] = [];
  const categoryHints: Record<string, string> = {};

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as string[];
    if (!row || row.every(c => !c)) continue;

    const dateRaw = row[dateCol];
    const amtRaw = row[amtCol];
    const descRaw = descCol !== -1 ? row[descCol] : '';

    if (!dateRaw || !amtRaw) continue;

    // Parse date: could be "MM/DD/YYYY", "YYYY-MM-DD", or a JS Date serial
    let dateStr = String(dateRaw).trim();
    const m1 = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const m2 = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m1) dateStr = `${m1[3]}-${m1[1].padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
    else if (!m2) continue; // unrecognized date format

    // Amex XLSX amounts: positive = charge (expense), negative = payment/credit (skip)
    const amount = parseFloat(String(amtRaw).replace(/[$,\s]/g, ''));
    if (isNaN(amount) || amount <= 0) continue; // skip payments and credits

    const description = String(descRaw ?? '').trim();
    if (!description) continue;

    const tx: Transaction = {
      id: uuidv4(),
      date: dateStr,
      description,
      amount,
      type: 'expense',
      bank: 'American Express',
      categoryId: null,
    };
    transactions.push(tx);

    const amexCategory = catCol !== -1 ? String(row[catCol] ?? '').trim() : '';
    if (amexCategory) categoryHints[tx.id] = amexCategory;
  }

  if (transactions.length === 0) throw new Error('No transactions found in Excel file.');

  return { transactions, bank: 'American Express', categoryHints };
};
