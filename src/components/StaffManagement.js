// src/components/StaffManagement.js
// Admin screen for staff accounts: add, edit, assign line managers, deactivate, reset passwords.
import React, { useCallback, useEffect, useState } from 'react';
import * as usersService from '../services/usersService';
import { DASHBOARDS } from '../dashboards';
import DataTable from './DataTable';
import Modal from './Modal';
import '../styles/Modal.css';

const ROLES = ['employee', 'manager', 'hr', 'admin'];
const ROLES_WITH_MANAGER = ['employee', 'hr']; // managers' own leave goes to HR
const roleLabel = (role) => DASHBOARDS[role]?.role || role;

// A random password for the admin to pass on; the user must change it at first login
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes like O/0, l/1
  const values = new Uint32Array(12);
  window.crypto.getRandomValues(values);
  return Array.from(values, v => chars[v % chars.length]).join('');
}

function TemporaryPasswordField({ value, onChange }) {
  return (
    <label>Temporary password (they must change it when they first log in)
      <div className="input-with-button">
        <input value={value} onChange={(e) => onChange(e.target.value)} minLength={8} required autoComplete="off" />
        <button type="button" className="btn secondary" onClick={() => onChange(generatePassword())}>Generate</button>
      </div>
    </label>
  );
}

function UserForm({ user, users, onSave, onClose }) {
  const isNew = !user;
  const [form, setForm] = useState({
    staffNo: user?.staffNo || '',
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || 'employee',
    managerId: user?.managerId ?? '',
    temporaryPassword: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const managers = users.filter(u => u.role === 'manager' && u.active && u.id !== user?.id);
  const needsManager = ROLES_WITH_MANAGER.includes(form.role);
  const set = (field, value) => {
    setForm({ ...form, [field]: value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { temporaryPassword, ...details } = form;
    const payload = { ...details, managerId: needsManager && form.managerId !== '' ? Number(form.managerId) : null };
    try {
      await onSave(isNew ? { ...payload, temporaryPassword } : payload);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3>{isNew ? 'Add Staff Member' : `Edit ${user.name}`}</h3>
      <form className="leave-form" onSubmit={handleSubmit}>
        <label>Staff number
          <input value={form.staffNo} onChange={(e) => set('staffNo', e.target.value)} required />
        </label>
        <label>Full name
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </label>
        <label>Email
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </label>
        <label>Role
          <select value={form.role} onChange={(e) => set('role', e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </label>
        {needsManager && (
          <label>Line manager (reviews their leave first)
            <select value={form.managerId} onChange={(e) => set('managerId', e.target.value)}>
              <option value="">No line manager (only an admin can approve their leave)</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.staffNo})</option>)}
            </select>
          </label>
        )}
        {isNew && <TemporaryPasswordField value={form.temporaryPassword} onChange={(v) => set('temporaryPassword', v)} />}

        {error && <ul className="form-errors" role="alert"><li>{error}</li></ul>}
        <div className="modal-actions">
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn danger" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordForm({ user, onSave, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(password);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3>Reset password for {user.name}</h3>
      <p className="form-hint">They will be logged out everywhere and must choose a new password when they next log in.</p>
      <form className="leave-form" onSubmit={handleSubmit}>
        <TemporaryPasswordField value={password} onChange={(v) => { setPassword(v); setError(''); }} />
        {error && <ul className="form-errors" role="alert"><li>{error}</li></ul>}
        <div className="modal-actions">
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Reset Password'}</button>
          <button type="button" className="btn danger" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// onNotify({ text, type }) shows a toast; onUsersChange(users) reports the current list
function StaffManagement({ currentUserId, onNotify, onUsersChange }) {
  const [users, setUsers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // a user, 'new', or null
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    try {
      setUsers(await usersService.fetchUsers());
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (onUsersChange) onUsersChange(users); }, [users, onUsersChange]);

  // Saving one user can change others (e.g. manager names), so reload the list
  const handleSave = async (payload) => {
    if (editing === 'new') {
      const created = await usersService.createUser(payload);
      onNotify({ text: `Account created for ${created.name}. Give them their temporary password.`, type: 'success' });
    } else {
      const updated = await usersService.updateUser(editing.id, payload);
      onNotify({ text: `${updated.name}'s details were saved.`, type: 'success' });
    }
    setEditing(null);
    await load();
  };

  const toggleActive = async (user) => {
    const action = user.active ? 'Deactivate' : 'Reactivate';
    if (user.active && !window.confirm(`Deactivate ${user.name}? They will be logged out and unable to log in.`)) return;
    try {
      await usersService.updateUser(user.id, { active: !user.active });
      onNotify({ text: `${user.name} was ${user.active ? 'deactivated' : 'reactivated'}.`, type: 'success' });
      await load();
    } catch (err) {
      onNotify({ text: `${action} failed: ${err.message}`, type: 'danger' });
    }
  };

  const handleReset = async (password) => {
    await usersService.resetPassword(resetting.id, password);
    onNotify({ text: `${resetting.name}'s password was reset. Give them the temporary password.`, type: 'success' });
    setResetting(null);
    await load();
  };

  return (
    <>
      <DataTable
        title="Staff"
        headers={['Staff No', 'Name', 'Email', 'Role', 'Line Manager', 'Status', 'Actions']}
        rows={users.map(u => [
          u.staffNo,
          u.name,
          u.email,
          roleLabel(u.role),
          u.managerName || '—',
          !u.active ? 'Deactivated' : u.mustChangePassword ? 'Awaiting first login' : 'Active',
          <div className="row-actions">
            <button className="btn secondary" onClick={() => setEditing(u)}>Edit</button>
            {u.id !== currentUserId && (
              <>
                <button className="btn secondary" onClick={() => setResetting(u)}>Reset Password</button>
                <button className={`btn ${u.active ? 'danger' : 'primary'}`} onClick={() => toggleActive(u)}>
                  {u.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </>
            )}
          </div>
        ])}
      />
      {loadError && (
        <div className="load-error" role="alert">
          <span>Could not load staff: {loadError}</span>
          <button className="btn secondary" onClick={load}>Try again</button>
        </div>
      )}

      <div className="actions-bar">
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add Staff Member</button>
      </div>

      {editing && (
        <UserForm user={editing === 'new' ? null : editing} users={users} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
      {resetting && <ResetPasswordForm user={resetting} onSave={handleReset} onClose={() => setResetting(null)} />}
    </>
  );
}

export default StaffManagement;
