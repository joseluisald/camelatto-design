import { stringify } from 'csv-stringify/sync';
export function safeCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
export function leadCsv(rows: Record<string, unknown>[]) {
  const keys = ['name', 'email', 'phone', 'company', 'service', 'status', 'source', 'message', 'createdAt'];
  return '\uFEFF' + stringify([keys, ...rows.map(row => keys.map(k => safeCell(row[k])))], { delimiter: ';' });
}
