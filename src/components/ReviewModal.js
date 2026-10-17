// src/components/ReviewModal.js
import React, { useContext, useState } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { getBalances } from '../shared/leaveRules.js';
import Modal from './Modal';
import RequestDetails from './RequestDetails';
import '../styles/Modal.css';

// Approve/reject dialog shared by the Manager, HR and Admin dashboards.
// A comment is optional when approving but required when rejecting.
// onApprove/onReject return promises; if the server refuses, its message is shown here.
function ReviewModal({ request, approveLabel = 'Approve', onApprove, onReject, onClose }) {
  const { requests } = useContext(RequestsContext);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const year = Number(request.from?.slice(0, 4)) || new Date().getFullYear();
  const balance = getBalances(requests, request.employeeId, year).find(b => b.type === request.type);

  const submit = async (action) => {
    setSaving(true);
    try {
      await action(comment.trim());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleReject = () => {
    if (!comment.trim()) {
      setError('Please give a reason for rejecting this request.');
      return;
    }
    submit(onReject);
  };

  return (
    <Modal onClose={onClose}>
      <h3>Review Request</h3>
      <RequestDetails request={request} />
      {balance && (
        <p className="form-hint">
          {request.type} in {year}: {balance.used} taken, {balance.pending} pending,
          {' '}{Math.max(balance.remaining, 0)} of {balance.entitlement} days left.
        </p>
      )}

      <label className="review-comment">Comment {error ? '' : '(required to reject)'}
        <textarea value={comment} onChange={(e) => { setComment(e.target.value); setError(''); }} />
      </label>
      {error && <ul className="form-errors" role="alert"><li>{error}</li></ul>}

      <div className="modal-actions">
        <button className="btn primary" disabled={saving} onClick={() => submit(onApprove)}>{approveLabel}</button>
        <button className="btn danger" disabled={saving} onClick={handleReject}>Reject</button>
      </div>
    </Modal>
  );
}

export default ReviewModal;
