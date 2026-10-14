// src/components/DataTable.js
import React from 'react';
import '../styles/Table.css';

function DataTable({ title, headers, rows }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <table className="styled-table">
        <thead>
          <tr>
            {headers.map((h, idx) => <th key={idx}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, cIdx) => <td key={cIdx}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
