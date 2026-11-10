// src/services/reportsService.js
// Downloads CSV reports built by the server (HR and admins only).
import api, { errorMessage } from './api';

// kind: 'requests' or 'balances'. Saves the file in the browser; throws an Error with
// a readable message on failure.
export async function downloadReport(kind, year) {
  let response;
  try {
    response = await api.get(`/reports/${kind}.csv`, { params: { year }, responseType: 'blob' });
  } catch (err) {
    // Error bodies arrive as a Blob too, so read the JSON message out of it
    if (err.response?.data instanceof Blob) {
      try {
        const body = JSON.parse(await err.response.data.text());
        throw new Error(body.error || 'Could not download the report.');
      } catch (parseErr) {
        throw parseErr instanceof SyntaxError ? new Error('Could not download the report.') : parseErr;
      }
    }
    throw new Error(errorMessage(err));
  }

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `leave-${kind}-${year}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
