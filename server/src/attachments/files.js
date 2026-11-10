// server/src/attachments/files.js
// Checks uploaded documents by their contents and makes file names safe to store and send back.

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// Allowed document types, recognised by their first bytes ("magic numbers") so a
// renamed file can't pass as something else
const FILE_TYPES = [
  { mime: 'application/pdf', extensions: ['pdf'], matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', extensions: ['png'], matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    // .docx files are zip archives containing a word/ folder
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    matches: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && b.includes('word/'),
  },
  {
    // Older .doc files use the OLE compound file format
    mime: 'application/msword',
    extensions: ['doc'],
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
];

export const ALLOWED_EXTENSIONS = FILE_TYPES.flatMap(t => t.extensions);

// Removes folders, control characters and characters that cause trouble in
// download headers, and keeps names to a sensible length (extension preserved)
export function cleanFileName(name) {
  let clean = String(name ?? '')
    .split(/[\\/]/).pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length > 100) {
    const dot = clean.lastIndexOf('.');
    const ext = dot > 0 && clean.length - dot <= 6 ? clean.slice(dot) : '';
    clean = clean.slice(0, 100 - ext.length).trim() + ext;
  }
  return clean || 'document';
}

// The file's type, or an error message explaining why it isn't accepted
export function checkFile(buffer, fileName) {
  if (!buffer?.length) return { error: 'The file is empty.' };
  if (buffer.length > MAX_ATTACHMENT_BYTES) return { error: 'Files can be at most 5 MB.' };

  const type = FILE_TYPES.find(t => t.matches(buffer));
  if (!type) return { error: 'Only PDF, JPEG, PNG and Word documents can be attached.' };

  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  if (!type.extensions.includes(extension)) {
    return { error: `This file's contents don't match its name. Please attach the original ${type.extensions[0].toUpperCase()} file.` };
  }
  return { mime: type.mime };
}

// Content-Disposition header that works for any file name, including non-English ones
export function attachmentDisposition(fileName) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
