// server/src/reports/csv.js
// Builds CSV files that open cleanly in Excel.

// Excel treats a cell starting with one of these as a formula, so a leave reason like
// "=HYPERLINK(...)" could run when HR opens the report. Such values get a leading
// apostrophe, which Excel shows as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  // Every field is quoted, so commas, quotes and line breaks stay inside their cell
  return `"${text.replace(/"/g, '""')}"`;
}

// rows: arrays of values; the first row is the header.
// Starts with a byte order mark so Excel reads names like "Wanjirũ" as UTF-8.
export function toCsv(rows) {
  return '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function sendCsv(res, filename, rows) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

// 'YYYY-MM-DD HH:mm' in the server's time zone (Africa/Nairobi by default)
export function formatDateTime(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
