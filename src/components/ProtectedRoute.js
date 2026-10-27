// src/components/ProtectedRoute.js
import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useContext(AuthContext);

  // Wait for the server to say who's logged in before deciding
  if (loading) {
    return <p className="page-loading">Loading…</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // A temporary password set by an admin must be replaced before anything else
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
