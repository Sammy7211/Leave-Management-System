// src/services/api.js
import axios from 'axios';

// In development, package.json's "proxy" forwards /api to the Node server
const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // send the session cookie
});

// Turn server and network failures into a readable message
export function errorMessage(err) {
  if (err.response?.data?.error) return err.response.data.error;
  if (err.request && !err.response) return 'Cannot reach the server. Is it running?';
  return err.message || 'Something went wrong.';
}

export default api;
