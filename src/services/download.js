// src/services/download.js
// Fetches a file from the API (sending the session cookie) and saves it in the browser.
import api, { errorMessage } from './api';

// Throws an Error with the server's message on failure
export async function downloadFile(path, fileName, params) {
  let response;
  try {
    response = await api.get(path, { params, responseType: 'blob' });
  } catch (err) {
    // Error bodies arrive as a Blob too, so read the JSON message out of it
    if (err.response?.data instanceof Blob) {
      let message = 'Could not download the file.';
      try {
        message = JSON.parse(await err.response.data.text()).error || message;
      } catch {
        // not JSON; keep the general message
      }
      throw new Error(message);
    }
    throw new Error(errorMessage(err));
  }

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
