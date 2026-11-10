// src/services/attachmentsService.js
// Supporting documents (e.g. sick notes). A file is uploaded first, and the returned id
// is sent with the leave request.
import api, { errorMessage } from './api';
import { downloadFile } from './download';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];

// Quick checks before uploading; the server checks the file's contents as well.
// Returns an error message, or '' if the file looks fine.
export function checkFileBeforeUpload(file) {
  if (!file) return '';
  const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.includes(extension)) return 'Only PDF, JPEG, PNG and Word documents can be attached.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Files can be at most 5 MB.';
  if (file.size === 0) return 'The file is empty.';
  return '';
}

// Returns { id, name, size, type }
export async function uploadAttachment(file) {
  try {
    const { data } = await api.post('/attachments', file, {
      params: { name: file.name },
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    return data.attachment;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}

export function downloadAttachment(requestId, fileName) {
  return downloadFile(`/requests/${requestId}/attachment`, fileName);
}
