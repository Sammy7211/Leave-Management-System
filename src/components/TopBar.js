// src/components/Topbar.js
import React, { useContext } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { usePolicy } from '../context/PolicyContext';
import '../styles/Dashboard.css';

function Topbar({ title, subtitle }) {
  const { error: requestsError, loading, refresh: refreshRequests } = useContext(RequestsContext);
  const { error: policyError, refresh: refreshPolicy } = usePolicy();
  const error = requestsError || policyError;
  const refresh = () => {
    if (requestsError) refreshRequests();
    if (policyError) refreshPolicy();
  };

  return (
    <div className="topbar">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
      {error && (
        <div className="load-error" role="alert">
          <span>Could not load {requestsError ? 'leave requests' : 'leave types'}: {error}</span>
          <button className="btn secondary" onClick={refresh} disabled={loading}>Try again</button>
        </div>
      )}
    </div>
  );
}

export default Topbar;
