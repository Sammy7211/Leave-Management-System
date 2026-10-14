// src/components/Topbar.js
import React from 'react';
import '../styles/Dashboard.css';

function Topbar({ title, subtitle }) {

  return (
    <div className="topbar">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
      
    </div>
  );
}

export default Topbar;
