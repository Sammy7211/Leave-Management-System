// src/components/LeaveForm.js
import React, { useState, useContext } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { AuthContext } from '../context/AuthContext';
import { LEAVE_TYPES, countLeaveDays, getBalances, todayISO, validateLeaveRequest } from '../services/leaveService';
import '../styles/Modal.css';

function LeaveForm({ role = 'Employee', onSubmit, onClose }) { // ✅ add onClose prop
  const { requests, addRequest } = useContext(RequestsContext);
  const { user } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    type: '',
    from: '',
    to: '',
    reason: '',
    attachment: null,
  });

  const days = countLeaveDays(formData.type, formData.from, formData.to);
  const errors = validateLeaveRequest(formData, { requests, employeeId: user?.id });
  const year = formData.from ? Number(formData.from.slice(0, 4)) : new Date().getFullYear();
  const balance = formData.type
    ? getBalances(requests, user?.id, year).find(b => b.type === formData.type)
    : null;
  const unit = LEAVE_TYPES[formData.type]?.unit;
  const attachmentLimit = LEAVE_TYPES[formData.type]?.attachmentRequiredOver;

  const handleChange = (field, value) => setFormData({ ...formData, [field]: value });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (errors.length) return;

    // File objects can't be saved to localStorage, so keep just its details
    const { attachment } = formData;
    const attachmentInfo = attachment ? { name: attachment.name, size: attachment.size, type: attachment.type } : null;
    addRequest({
      ...formData,
      days,
      attachment: attachmentInfo,
      status: role === 'Manager' ? 'Pending HR Approval' : 'Pending Manager Approval',
      employeeId: user?.id || null,
      employee: user?.name || 'Unknown',
      role,
    });
    if (onSubmit) onSubmit(formData); // ✅ only fires on submit
  };

  const handleCancel = () => {
    if (onClose) onClose(); // ✅ closes modal only
  };

  return (
    <form onSubmit={handleSubmit} className="leave-form">
      <label>Leave Type
        <select value={formData.type} onChange={(e) => handleChange('type', e.target.value)} required>
          <option value="">Select Leave Type</option>
          {Object.keys(LEAVE_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      {balance && (
        <p className="form-hint">
          {Math.max(balance.remaining, 0)} of {balance.entitlement} days available for {year}
        </p>
      )}

      <label>From
        <input type="date" min={todayISO()} value={formData.from} onChange={(e) => handleChange('from', e.target.value)} required />
      </label>
      <label>To
        <input type="date" min={formData.from || todayISO()} value={formData.to} onChange={(e) => handleChange('to', e.target.value)} required />
      </label>
      <label>{unit === 'calendar' ? 'Days (calendar days)' : 'Days (working days, excluding weekends and public holidays)'}
        <input type="number" value={formData.from && formData.to ? days : ''} readOnly />
      </label>

      <label>Reason
        <textarea value={formData.reason} onChange={(e) => handleChange('reason', e.target.value)} required />
      </label>

      <label>Attachment {attachmentLimit !== undefined ? `(required if over ${attachmentLimit} days)` : '(optional)'}
        <input type="file" accept=".pdf,.doc,.docx,.jpg,.png"
          onChange={(e) => handleChange('attachment', e.target.files[0] || null)} />
      </label>

      {errors.length > 0 && (
        <ul className="form-errors" role="alert">
          {errors.map(err => <li key={err}>{err}</li>)}
        </ul>
      )}

      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={errors.length > 0}>Submit Request</button>
        <button type="button" className="btn danger" onClick={handleCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default LeaveForm;
