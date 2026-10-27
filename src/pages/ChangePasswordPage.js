// src/pages/ChangePasswordPage.js
import React, { useContext, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { homePath } from '../dashboards';
import '../styles/Login.css';

// Lets any logged-in user change their password. Users with a temporary password
// set by an admin are sent here and can't use the rest of the app until they do.
function ChangePasswordPage() {
  const { user, loading, changePassword } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) return <p className="page-loading">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const updated = await changePassword(form.currentPassword, form.newPassword);
      navigate(homePath(updated), { replace: true });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">Change Password</h2>
        {user.mustChangePassword && (
          <p className="login-note">
            Welcome, {user.name}. You are using a temporary password. Please choose your own to continue.
          </p>
        )}
        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            {user.mustChangePassword ? 'Temporary password' : 'Current password'}
            <input type="password" name="currentPassword" autoComplete="current-password"
              value={form.currentPassword} onChange={handleChange} required />
          </label>
          <label className="login-label">
            New password (at least 8 characters)
            <input type="password" name="newPassword" autoComplete="new-password"
              value={form.newPassword} onChange={handleChange} required />
          </label>
          <label className="login-label">
            Confirm new password
            <input type="password" name="confirmPassword" autoComplete="new-password"
              value={form.confirmPassword} onChange={handleChange} required />
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Change Password'}
          </button>
          {!user.mustChangePassword && <Link to={homePath(user)}>Back to dashboard</Link>}
        </form>
      </div>
    </div>
  );
}

export default ChangePasswordPage;
