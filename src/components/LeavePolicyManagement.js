// src/components/LeavePolicyManagement.js
// Admin screen for leave types (entitlements, rules) and gazetted public holidays.
import React, { useContext, useState } from 'react';
import { usePolicy } from '../context/PolicyContext';
import { RequestsContext } from '../context/RequestsContext';
import * as policyService from '../services/policyService';
import { fixedHolidays, todayISO } from '../shared/leaveRules.js';
import DataTable from './DataTable';
import Modal from './Modal';
import '../styles/Modal.css';

const UNIT_LABELS = { working: 'Working days', calendar: 'Calendar days' };

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function LeaveTypeForm({ leaveType, onSave, onClose }) {
  const isNew = !leaveType;
  const [form, setForm] = useState({
    name: leaveType?.name || '',
    entitlement: leaveType?.entitlement ?? '',
    unit: leaveType?.unit || 'working',
    attachmentRequiredOver: leaveType?.attachmentRequiredOver ?? '',
    active: leaveType?.active ?? true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (field, value) => {
    setForm({ ...form, [field]: value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        entitlement: Number(form.entitlement),
        attachmentRequiredOver: form.attachmentRequiredOver === '' ? null : Number(form.attachmentRequiredOver),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3>{isNew ? 'Add Leave Type' : `Edit ${leaveType.name}`}</h3>
      <form className="leave-form" onSubmit={handleSubmit}>
        <label>Name
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </label>
        <label>Days per year
          <input type="number" min="0" max="366" value={form.entitlement} onChange={(e) => set('entitlement', e.target.value)} required />
        </label>
        <label>Counts
          <select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            <option value="working">Working days (skips weekends and public holidays)</option>
            <option value="calendar">Calendar days (every day)</option>
          </select>
        </label>
        <label>Supporting document required over (days; leave blank if never)
          <input type="number" min="0" value={form.attachmentRequiredOver} onChange={(e) => set('attachmentRequiredOver', e.target.value)} />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          Staff can apply for this leave type
        </label>
        {!isNew && form.unit !== leaveType.unit && (
          <p className="form-hint">Booked leave of this type that hasn't finished will be recounted.</p>
        )}
        {error && <ul className="form-errors" role="alert"><li>{error}</li></ul>}
        <div className="modal-actions">
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn danger" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// onNotify({ text, type }) shows a toast
function LeavePolicyManagement({ onNotify }) {
  const { policy, setPolicy } = usePolicy();
  const { refresh: refreshRequests } = useContext(RequestsContext);
  const [editing, setEditing] = useState(null); // a leave type, 'new', or null
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const [holidayError, setHolidayError] = useState('');
  const [savingHoliday, setSavingHoliday] = useState(false);

  if (!policy) return null;

  const year = new Date().getFullYear();
  const upcomingFixed = [...fixedHolidays(year), ...fixedHolidays(year + 1)].filter(h => h.date >= todayISO()).slice(0, 8);

  // Apply a policy change from the server; if booked leave was recounted, reload requests too
  const applied = (result, message) => {
    const { recalculated, ...updated } = result;
    setPolicy(updated);
    if (recalculated) refreshRequests();
    onNotify({
      text: recalculated ? `${message} ${recalculated} booked request(s) were recounted.` : message,
      type: 'success',
    });
  };

  const saveLeaveType = async (values) => {
    if (editing === 'new') {
      applied(await policyService.createLeaveType(values), `${values.name} was added.`);
    } else {
      applied(await policyService.updateLeaveType(editing.id, values), `${values.name} was saved.`);
    }
    setEditing(null);
  };

  const addHoliday = async (e) => {
    e.preventDefault();
    setSavingHoliday(true);
    try {
      applied(await policyService.addHoliday(holiday.date, holiday.name.trim()), `${holiday.name.trim()} was added as a public holiday.`);
      setHoliday({ date: '', name: '' });
    } catch (err) {
      setHolidayError(err.message);
    } finally {
      setSavingHoliday(false);
    }
  };

  const removeHoliday = async (h) => {
    if (!window.confirm(`Remove ${h.name} (${formatDate(h.date)})? Booked leave over that date will be recounted.`)) return;
    try {
      applied(await policyService.deleteHoliday(h.id), `${h.name} was removed.`);
    } catch (err) {
      onNotify({ text: `Could not remove the holiday: ${err.message}`, type: 'danger' });
    }
  };

  return (
    <>
      <DataTable
        title="Leave Types"
        headers={['Leave Type', 'Days per Year', 'Counts', 'Document Required', 'Status', '']}
        rows={policy.leaveTypes.map(t => [
          t.name,
          t.entitlement,
          UNIT_LABELS[t.unit],
          t.attachmentRequiredOver === null ? 'Never' : `Over ${t.attachmentRequiredOver} days`,
          t.active ? 'Active' : 'Not available',
          <button className="btn secondary" onClick={() => setEditing(t)}>Edit</button>,
        ])}
      />
      <div className="actions-bar">
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add Leave Type</button>
      </div>

      <DataTable
        title="Gazetted Public Holidays"
        headers={['Date', 'Holiday', '']}
        rows={policy.holidays.map(h => [
          formatDate(h.date),
          h.name,
          <button className="btn danger" onClick={() => removeHoliday(h)}>Remove</button>,
        ])}
      />
      <form className="card holiday-form" onSubmit={addHoliday}>
        <h4>Add a gazetted holiday</h4>
        <p className="form-hint">
          For holidays announced each year, such as Idd-ul-Fitr. Booked leave over the date is recounted automatically.
        </p>
        <div className="holiday-form-fields">
          <label>Date
            <input type="date" value={holiday.date} required
              onChange={(e) => { setHoliday({ ...holiday, date: e.target.value }); setHolidayError(''); }} />
          </label>
          <label>Name
            <input value={holiday.name} required placeholder="e.g. Idd-ul-Fitr"
              onChange={(e) => { setHoliday({ ...holiday, name: e.target.value }); setHolidayError(''); }} />
          </label>
          <button type="submit" className="btn primary" disabled={savingHoliday}>Add Holiday</button>
        </div>
        {holidayError && <ul className="form-errors" role="alert"><li>{holidayError}</li></ul>}
        <p className="form-hint">
          Already included automatically: {upcomingFixed.map(h => `${h.name} (${formatDate(h.date)})`).join(', ')}, and so on.
        </p>
      </form>

      {editing && (
        <LeaveTypeForm leaveType={editing === 'new' ? null : editing} onSave={saveLeaveType} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

export default LeavePolicyManagement;
