// src/services/requestsService.js
// Leave requests live on the server; these calls throw an Error with a readable message on failure.
import api, { errorMessage } from './api';

const call = async (promise) => {
  try {
    const { data } = await promise;
    return data;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
};

export async function fetchRequests() {
  return (await call(api.get('/requests'))).requests;
}

// request: { type, from, to, reason, attachment: { name } | null }
export async function createRequest(request) {
  return (await call(api.post('/requests', request))).request;
}

// decision: 'approve' or 'reject' (a comment is required to reject)
export async function decideRequest(id, decision, comment = '') {
  return (await call(api.post(`/requests/${id}/decision`, { decision, comment }))).request;
}
