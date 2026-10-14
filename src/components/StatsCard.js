// src/components/StatsCard.js
import React from 'react';
import '../styles/Dashboard.css';

function StatsCard({ title, value, change }) {
  return (
    <div className="card stat-card">
      <h3>{title}</h3>
      <p className="stat-value">{value}</p>
      {change && <p className="change">{change}</p>}
    </div>
  );
}

export default StatsCard;
