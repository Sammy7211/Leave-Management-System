// src/components/LeaveBalances.js
import React, { useContext } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { AuthContext } from '../context/AuthContext';
import { getBalances } from '../services/leaveService';
import DataTable from './DataTable';

// The logged-in user's leave balances for the current year
function LeaveBalances() {
  const { requests } = useContext(RequestsContext);
  const { user } = useContext(AuthContext);
  const year = new Date().getFullYear();

  return (
    <DataTable
      title={`My Leave Balances (${year})`}
      headers={['Leave Type', 'Entitlement', 'Taken', 'Pending', 'Remaining']}
      rows={getBalances(requests, user?.id, year).map(b => [
        b.type,
        `${b.entitlement} ${b.unit === 'calendar' ? 'calendar days' : 'working days'}`,
        b.used,
        b.pending,
        Math.max(b.remaining, 0),
      ])}
    />
  );
}

export default LeaveBalances;
