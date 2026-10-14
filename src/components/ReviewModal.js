// src/components/ReviewModal.js
import React, { useContext, useState } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { getBalances } from '../services/leaveService';
import Modal from './Modal';
import RequestDetails from './RequestDetails';
import '../styles/Modal.css';

// Approve/reject dialog shared by the Manager, HR and Admin dashboards.
// A comment is optional when approving but required when rejecting.
function ReviewModal({ request, approveLabel = 'Approve', onApprove, onReject, onClose }) {
  const { requests } = useContext(RequestsContext);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const year = Number(request.from?.slice(0, 4)) || new Date().getFullYear();
  const balance = getBalances(requests, request.employeeId, year).find(b => b.type === request.type);

  const handleReject = () => {
    if (!comment.trim()) {
      setError('Please give a reason for rejecting this request.');
      return;
    }
    onReject(comment.trim());
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
        <button className="btn primary" onClick={() => onApprove(comment.trim())}>{approveLabel}</button>
        <button className="btn danger" onClick={handleReject}>Reject</button>
      </div>
    </Modal>
  );
}

export default ReviewModal;
