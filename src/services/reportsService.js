// src/services/reportsService.js
// Downloads CSV reports built by the server (HR and admins only).
import { downloadFile } from './download';

// kind: 'requests' or 'balances'. Saves the file; throws an Error with a readable message on failure.
export function downloadReport(kind, year) {
  return downloadFile(`/reports/${kind}.csv`, `leave-${kind}-${year}.csv`, { year });
}
