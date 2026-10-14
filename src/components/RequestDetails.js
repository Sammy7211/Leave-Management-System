// src/components/RequestDetails.js
import React from 'react';
import '../styles/Modal.css';

const formatDateTime = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

// Request summary plus its full status history
function RequestDetails({ request }) {
  return (
    <div className="request-details">
      <p><strong>{request.employee}</strong> ({request.role || 'Employee'}) — {request.type}</p>
      <p>{request.from} to {request.to} · {request.days} days</p>
      <p>Reason: {request.reason}</p>
      {request.attachment?.name && <p>Attachment: {request.attachment.name}</p>}
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
