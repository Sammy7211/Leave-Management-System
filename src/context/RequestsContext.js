// src/context/RequestsContext.js
import React, { createContext, useState, useEffect } from 'react';

export const RequestsContext = createContext();

export function RequestsProvider({ children }) {
  const [requests, setRequests] = useState(() => {
    const saved = localStorage.getItem('requests');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('requests', JSON.stringify(requests));
  }, [requests]);

  const addRequest = (request) => {
    setRequests(prev => [
      ...prev,
      {
        ...request,
        id: Date.now(),
        employeeId: request.employeeId || null,
        role: request.role || 'Employee', // ✅ enforce role awareness
        history: [{ status: request.status, by: request.employee, at: new Date().toISOString(), comment: 'Submitted' }],
      }
    ]);
  };

  // Every status change is recorded with who made it, when, and why
  const updateRequestStatus = (id, status, { by = 'Unknown', comment = '' } = {}) => {
    setRequests(prev =>
      prev.map(r => r.id === id
        ? { ...r, status, history: [...(r.history || []), { status, by, at: new Date().toISOString(), comment }] }
        : r)
    );
  };

  return (
    <RequestsContext.Provider value={{ requests, addRequest, updateRequestStatus }}>
      {children}
    </RequestsContext.Provider>
  );
}
