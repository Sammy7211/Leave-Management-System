// src/context/PolicyContext.js
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from './AuthContext';
import * as policyService from '../services/policyService';

export const PolicyContext = createContext();

// The leave policy (leave types and gazetted holidays) from the server, used by the
// shared leave rules for instant feedback. The server applies the same policy itself.
export function PolicyProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [policy, setPolicy] = useState(null); // null until loaded
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setPolicy(await policyService.fetchPolicy());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (user && !user.mustChangePassword) {
      refresh();
    } else {
      setPolicy(null);
      setError('');
    }
  }, [user?.id, user?.mustChangePassword, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PolicyContext.Provider value={{ policy, error, refresh, setPolicy }}>
      {children}
    </PolicyContext.Provider>
  );
}

export const usePolicy = () => useContext(PolicyContext);
