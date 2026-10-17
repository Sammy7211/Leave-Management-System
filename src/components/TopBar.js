// src/components/Topbar.js
import React, { useContext } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import '../styles/Dashboard.css';

function Topbar({ title, subtitle }) {
  const { error, loading, refresh } = useContext(RequestsContext);

  return (
    <div className="topbar">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
      {error && (
        <div className="load-error" role="alert">
          <span>Could not load leave requests: {error}</span>
          <button className="btn secondary" onClick={refresh} disabled={loading}>Try again</button>
        </div>
      )}
    </div>
  );
}

export default Topbar;
