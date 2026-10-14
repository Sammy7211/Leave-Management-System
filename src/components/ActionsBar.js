// src/components/ActionsBar.js
import React from 'react';
import '../styles/Dashboard.css';

function ActionsBar({ children }) {
  return <div className="actions-bar">{children}</div>;
}

export default ActionsBar;
