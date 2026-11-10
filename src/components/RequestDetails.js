// src/components/RequestDetails.js
import React, { useState } from 'react';
import { downloadAttachment } from '../services/attachmentsService';
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

// Request summary plus its full status history
function RequestDetails({ request }) {
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
    </div>
  );
}

export default RequestDetails;
