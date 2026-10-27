// src/context/RequestsContext.js
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from './AuthContext';
import * as requestsService from '../services/requestsService';

export const RequestsContext = createContext();

// Holds the leave requests the logged-in user may see, as returned by the server.
// The server decides who sees what and checks every rule; this just keeps a copy for display.
export function RequestsProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await requestsService.fetchRequests());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever a different user logs in; clear everything on logout
  useEffect(() => {
    // Requests used to be kept in the browser; remove any left over from before
    localStorage.removeItem('requests');
    if (user && !user.mustChangePassword) {
      refresh();
    } else {
      setRequests([]);
      setError('');
    }
  }, [user?.id, user?.mustChangePassword, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const replace = (updated) => setRequests(prev => prev.map(r => (r.id === updated.id ? updated : r)));

  // Both throw an Error with the server's message if the request is refused
  const addRequest = async (request) => {
    const created = await requestsService.createRequest(request);
    setRequests(prev => [created, ...prev]);
    return created;
  };

  const decideRequest = async (id, decision, comment) => {
    try {
      const updated = await requestsService.decideRequest(id, decision, comment);
      replace(updated);
      return updated;
    } catch (err) {
      refresh(); // someone else may have acted on it first; show the current state
      throw err;
    }
  };

  return (
    <RequestsContext.Provider value={{ requests, loading, error, refresh, addRequest, decideRequest }}>
      {children}
    </RequestsContext.Provider>
  );
}
