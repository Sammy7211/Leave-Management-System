// src/services/authService.js
// Login state lives on the server in an httpOnly cookie that page JavaScript can't read or edit.
import api, { errorMessage } from './api';

export async function login(email, password) {
  try {
    const { data } = await api.post('/auth/login', { email, password });
    return data.user;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}

// The logged-in user, or null if there's no valid session
export async function getCurrentUser() {
  try {
    const { data } = await api.get('/auth/me');
    return data.user;
  } catch (err) {
    if (err.response?.status === 401) return null;
    throw new Error(errorMessage(err));
  }
}

export async function logout() {
  await api.post('/auth/logout');
}

// Changes the logged-in user's password; returns the updated user
export async function changePassword(currentPassword, newPassword) {
  try {
    const { data } = await api.post('/auth/password', { currentPassword, newPassword });
    return data.user;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}
