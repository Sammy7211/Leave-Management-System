// src/components/ReportsPanel.js
// Year picker and CSV downloads for HR and admins.
import React, { useState } from 'react';
import { downloadReport } from '../services/reportsService';
import '../styles/Dashboard.css';

const REPORTS = [
  { kind: 'requests', label: 'Leave Requests (CSV)', hint: 'One row per request starting that year, with its latest decision.' },
  { kind: 'balances', label: 'Leave Balances (CSV)', hint: 'Taken, pending and remaining days per staff member and leave type.' },
];

function ReportsPanel() {
  const thisYear = new Date().getFullYear();
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
  const [year, setYear] = useState(thisYear);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const download = async (kind) => {
    setBusy(kind);
    setError('');
    try {
      await downloadReport(kind, year);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card reports-panel">
      <h3>Reports</h3>
      <div className="reports-controls">
        <label>Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {REPORTS.map(r => (
          <button key={r.kind} className="btn secondary" title={r.hint} disabled={!!busy} onClick={() => download(r.kind)}>
            {busy === r.kind ? 'Preparing…' : `Download ${r.label}`}
          </button>
        ))}
      </div>
      {error && <ul className="form-errors" role="alert"><li>{error}</li></ul>}
    </div>
  );
}

export default ReportsPanel;
