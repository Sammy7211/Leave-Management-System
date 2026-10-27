// src/services/usersService.js
// Staff accounts (admin only); these calls throw an Error with a readable message on failure.
import api, { errorMessage } from './api';

const call = async (promise) => {
  try {
    const { data } = await promise;
    return data;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
};

export async function fetchUsers() {
  return (await call(api.get('/users'))).users;
}

// user: { staffNo, name, email, role, managerId, temporaryPassword }
export async function createUser(user) {
  return (await call(api.post('/users', user))).user;
}

// changes: any of { staffNo, name, email, role, managerId, active }
export async function updateUser(id, changes) {
  return (await call(api.patch(`/users/${id}`, changes))).user;
}

export async function resetPassword(id, temporaryPassword) {
  return (await call(api.post(`/users/${id}/reset-password`, { temporaryPassword }))).user;
}
