// src/components/RequestDetails.js
import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { RequestsContext } from '../context/RequestsContext';
import { downloadAttachment } from '../services/attachmentsService';
import { cancellationFor } from '../shared/leaveRules.js';
import '../styles/Modal.css';

const formatDateTime = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

const formatSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function Attachment({ requestId, attachment }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Requests from before uploads existed have only a file name
  if (!attachment.id) return <p>Attachment: {attachment.name} (file not stored)</p>;

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      await downloadAttachment(requestId, attachment.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="attachment-row">
        Attachment: {attachment.name} ({formatSize(attachment.size)})
        <button type="button" className="btn secondary" onClick={download} disabled={busy}>
          {busy ? 'Downloading…' : 'Download'}
        </button>
      </p>
      {error && <ul className="form-errors" role="alert"><li>{error}</li></ul>}
    </>
  );
}

// Withdraw a pending request, or cancel approved leave before it starts (with a reason)
function CancelSection({ request }) {
  const { cancelRequest } = useContext(RequestsContext);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cancellation = cancellationFor(request);
  if (cancellation.error) return null;
  const withdraw = cancellation.status === 'Withdrawn';
  const label = withdraw ? 'Withdraw Request' : 'Cancel Leave';

  const submit = async () => {
    if (cancellation.reasonRequired && !comment.trim()) {
      setError('Please say why this approved leave is being cancelled.');
      return;
    }
    setSaving(true);
    try {
      await cancelRequest(request.id, comment.trim());
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return <button type="button" className="btn danger cancel-open" onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <div className="cancel-section">
      <p className="form-hint">
        {withdraw
          ? 'This request will be withdrawn and the days returned to your balance.'
          : 'This approved leave will be cancelled and the days returned to your balance. Your manager and HR will see your reason.'}
      </p>
      <label className="review-comment">{withdraw ? 'Comment (optional)' : 'Reason for cancelling'}
        <textarea value={comment} onChange={(e) => { setComment(e.target.value); setError(''); }} />
      </label>
      {error && <ul className="form-errors" role="alert"><li>{error}</li></ul>}
      <div className="modal-actions">
        <button type="button" className="btn danger" onClick={submit} disabled={saving}>{saving ? 'Saving…' : `Confirm: ${label}`}</button>
        <button type="button" className="btn secondary" onClick={() => setOpen(false)} disabled={saving}>Keep It</button>
      </div>
    </div>
  );
}

// Request summary plus its full status history. Shows the latest copy of the request,
// so it updates after a cancellation; the applicant (or an admin) can cancel from here.
function RequestDetails({ request: shown, allowCancel = true }) {
  const { user } = useContext(AuthContext);
  const { requests } = useContext(RequestsContext);
  const request = requests.find(r => r.id === shown.id) || shown;
  const mayCancel = allowCancel && user && (user.id === request.employeeId || user.role === 'admin');

  return (
    <div className="request-details">
      <p><strong>{request.employee}</strong> ({request.role || 'Employee'}) — {request.type}</p>
      <p>{request.from} to {request.to} · {request.days} days</p>
      <p>Reason: {request.reason}</p>
      {request.attachment && <Attachment requestId={request.id} attachment={request.attachment} />}
      <p>Current status: <strong>{request.status}</strong></p>

      <h4>History</h4>
      {request.history?.length ? (
        <ol className="history-list">
          {request.history.map((entry, idx) => (
            <li key={idx}>
              <strong>{entry.status}</strong> — {entry.by}, {formatDateTime(entry.at)}
              {entry.comment && <div className="history-comment">“{entry.comment}”</div>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="form-hint">No history recorded for this request.</p>
      )}
      {mayCancel && <CancelSection request={request} />}
    </div>
  );
}

export default RequestDetails;
