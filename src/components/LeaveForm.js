// src/components/LeaveForm.js
import React, { useState, useContext } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { AuthContext } from '../context/AuthContext';
import { usePolicy } from '../context/PolicyContext';
import { activeLeaveTypes, countLeaveDays, findLeaveType, getBalances, todayISO, validateLeaveRequest } from '../shared/leaveRules.js';
import { checkFileBeforeUpload, uploadAttachment } from '../services/attachmentsService';
import '../styles/Modal.css';

// The server works out the days, the starting status and who reviews it from the
// logged-in user, and re-checks every rule; the checks here just give instant feedback.
function LeaveForm({ onSubmit, onClose }) {
  const { requests, addRequest } = useContext(RequestsContext);
  const { user } = useContext(AuthContext);
  const { policy } = usePolicy();
  const [formData, setFormData] = useState({
    type: '',
    from: '',
    to: '',
    reason: '',
    attachment: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  // The last file uploaded and its server copy, so a retry after a refusal doesn't upload it again
  const [uploaded, setUploaded] = useState({ file: null, attachment: null });

  const days = countLeaveDays(formData.type, formData.from, formData.to, policy);
  const fileError = checkFileBeforeUpload(formData.attachment);
  const errors = [
    ...(fileError ? [fileError] : []),
    ...validateLeaveRequest(formData, { requests, employeeId: user?.id, policy }),
  ];
  const year = formData.from ? Number(formData.from.slice(0, 4)) : new Date().getFullYear();
  const balance = formData.type
    ? getBalances(requests, user?.id, year, policy).find(b => b.type === formData.type)
    : null;
  const leaveType = findLeaveType(policy, formData.type);
  const unit = leaveType?.unit;
  const attachmentLimit = leaveType?.attachmentRequiredOver;

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (errors.length || submitting) return;

    setSubmitting(true);
    try {
      const { type, from, to, reason, attachment } = formData;
      // The document is uploaded first, then the request refers to it
      let stored = null;
      if (attachment) {
        stored = uploaded.file === attachment ? uploaded.attachment : await uploadAttachment(attachment);
        setUploaded({ file: attachment, attachment: stored });
      }
      const created = await addRequest({ type, from, to, reason, attachmentId: stored?.id ?? null });
      if (onSubmit) onSubmit(created);
    } catch (err) {
      setServerError(err.message);
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onClose) onClose(); // ✅ closes modal only
  };

  if (!policy) return <p className="form-hint">Loading leave types…</p>;

  return (
    <form onSubmit={handleSubmit} className="leave-form">
      <label>Leave Type
        <select value={formData.type} onChange={(e) => handleChange('type', e.target.value)} required>
          <option value="">Select Leave Type</option>
          {activeLeaveTypes(policy).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
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

      <label>Attachment {attachmentLimit !== null && attachmentLimit !== undefined ? `(required if over ${attachmentLimit} days)` : '(optional)'}
        <span className="form-hint">PDF, JPEG, PNG or Word, up to 5 MB</span>
        <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={(e) => handleChange('attachment', e.target.files[0] || null)} />
      </label>

      {(errors.length > 0 || serverError) && (
        <ul className="form-errors" role="alert">
          {(serverError ? [serverError] : errors).map(err => <li key={err}>{err}</li>)}
        </ul>
      )}

      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={errors.length > 0 || submitting}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
        <button type="button" className="btn danger" onClick={handleCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default LeaveForm;
