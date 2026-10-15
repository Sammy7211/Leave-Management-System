// src/context/AuthContext.js
import React, { createContext, useEffect, useState } from 'react';
import * as authService from '../services/authService';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until we've asked the server who's logged in
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    authService.getCurrentUser()
      .then(current => { if (!cancelled) setUser(current); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = async (email, password) => {
    const loggedIn = await authService.login(email, password);
    setUser(loggedIn);
    setError('');
    return loggedIn;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null); // log out locally even if the server can't be reached
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
