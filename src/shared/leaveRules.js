// src/shared/leaveRules.js
// Leave rules shared by the React app and the Node server: types, entitlements,
// working-day counting, balances and validation. Keep this file free of imports
// so it runs unchanged in both places.

// Leave types and extra public holidays are kept in the database and edited by admins.
// Functions here take them as a `policy`:
//   {
//     leaveTypes: [{ name, entitlement, unit, attachmentRequiredOver, active }],
//     holidays: [{ date: 'YYYY-MM-DD', name }],  // gazetted holidays, e.g. Idd-ul-Fitr
//   }
// unit: 'working' skips weekends and public holidays, 'calendar' counts every day.
// attachmentRequiredOver: days above which a supporting document is needed (null = never).

// Kenyan public holidays on fixed dates; Easter is calculated each year
const FIXED_HOLIDAYS = [
  ['01-01', "New Year's Day"],
  ['05-01', 'Labour Day'],
  ['06-01', 'Madaraka Day'],
  ['10-10', 'Mazingira Day'],
  ['10-20', 'Mashujaa Day'],
  ['12-12', 'Jamhuri Day'],
  ['12-25', 'Christmas Day'],
  ['12-26', 'Boxing Day'],
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are handled as UTC midnight so daylight-saving shifts can't skew counts
const parseDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toISO = (date) => date.toISOString().slice(0, 10);
const addDays = (date, n) => new Date(date.getTime() + n * DAY_MS);

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Easter Sunday (Anonymous Gregorian algorithm)
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const fixedHolidayCache = {};

// The holidays that are the same rule every year, with names, as [{ date, name }]
export function fixedHolidays(year) {
  if (fixedHolidayCache[year]) return fixedHolidayCache[year];

  const easter = easterSunday(year);
  const list = [
    ...FIXED_HOLIDAYS.map(([mmdd, name]) => ({ date: `${year}-${mmdd}`, name })),
    { date: toISO(addDays(easter, -2)), name: 'Good Friday' },
    { date: toISO(addDays(easter, 1)), name: 'Easter Monday' },
  ];
  const taken = new Set(list.map(h => h.date));

  // A holiday falling on a Sunday is observed on the next free weekday,
  // e.g. Christmas on a Sunday moves to Tuesday because Monday is Boxing Day
  FIXED_HOLIDAYS.forEach(([mmdd, name]) => {
    const date = parseDate(`${year}-${mmdd}`);
    if (date.getUTCDay() !== 0) return;
    let observed = addDays(date, 1);
    while (taken.has(toISO(observed)) || observed.getUTCDay() === 6) {
      observed = addDays(observed, 1);
    }
    taken.add(toISO(observed));
    list.push({ date: toISO(observed), name: `${name} (observed)` });
  });

  list.sort((a, b) => a.date.localeCompare(b.date));
  fixedHolidayCache[year] = list;
  return list;
}

// All public holiday dates in a year: the fixed ones plus the policy's gazetted ones
export function getPublicHolidays(year, policy) {
  return new Set([
    ...fixedHolidays(year).map(h => h.date),
    ...(policy?.holidays || []).map(h => h.date).filter(d => d.startsWith(`${year}-`)),
  ]);
}

export function isWorkingDay(iso, policy) {
  const day = parseDate(iso).getUTCDay();
  if (day === 0 || day === 6) return false;
  return !getPublicHolidays(Number(iso.slice(0, 4)), policy).has(iso);
}

export const findLeaveType = (policy, name) => policy?.leaveTypes?.find(t => t.name === name);

// The leave types staff can currently apply for
export const activeLeaveTypes = (policy) => (policy?.leaveTypes || []).filter(t => t.active);

// Number of leave days between two ISO dates (inclusive) for a leave type
export function countLeaveDays(type, from, to, policy) {
  if (!from || !to || to < from) return 0;
  const unit = findLeaveType(policy, type)?.unit || 'working';
  const holidays = {}; // year -> Set, so each year is worked out once per call
  let count = 0;
  for (let d = parseDate(from); d <= parseDate(to); d = addDays(d, 1)) {
    const iso = toISO(d);
    if (unit === 'calendar') {
      count++;
      continue;
    }
    const weekday = d.getUTCDay();
    const year = d.getUTCFullYear();
    holidays[year] ||= getPublicHolidays(year, policy);
    if (weekday !== 0 && weekday !== 6 && !holidays[year].has(iso)) count++;
  }
  return count;
}

// Status helpers shared across dashboards
export const isPending = (status = '') => status.startsWith('Pending');
export const isApproved = (status = '') => status.includes('Approved');
export const isRejected = (status = '') => status.includes('Rejected');
// Withdrawn while pending, or cancelled after approval: the days are given back
export const isCancelled = (status = '') => status === 'Withdrawn' || status === 'Cancelled';
// Pending or approved: the request still takes up the dates and the days
export const isActive = (status = '') => isPending(status) || isApproved(status);

// What cancelling a request would do, or why it can't be cancelled.
// Pending requests are withdrawn; approved leave can be cancelled until the day it starts.
// Returns { status, reasonRequired } or { error }.
export function cancellationFor(request, today = todayISO()) {
  if (isPending(request.status)) return { status: 'Withdrawn', reasonRequired: false };
  if (isApproved(request.status)) {
    if (request.from <= today) {
      return { error: 'This leave has already started, so it can no longer be cancelled here. Please contact HR.' };
    }
    return { status: 'Cancelled', reasonRequired: true };
  }
  return { error: 'This request has already been closed.' };
}

// Leave taken and booked per type for one employee in one year.
// A request counts towards the year it starts in.
// Covers the active leave types only.
export function getBalances(requests, employeeId, year, policy) {
  const mine = requests.filter(r => r.employeeId === employeeId && r.from?.startsWith(`${year}-`));

  return activeLeaveTypes(policy).map(({ name: type, entitlement, unit }) => {
    const ofType = mine.filter(r => r.type === type);
    const sum = (list) => list.reduce((total, r) => total + (Number(r.days) || 0), 0);
    const used = sum(ofType.filter(r => isApproved(r.status)));
    const pending = sum(ofType.filter(r => isPending(r.status)));
    return { type, unit, entitlement, used, pending, remaining: entitlement - used - pending };
  });
}

// Returns a list of problems with a leave request; empty means it's valid
export function validateLeaveRequest(form, { requests, employeeId, policy, today = todayISO() }) {
  const { type, from, to, attachment } = form;
  if (!type || !from || !to) return [];

  const leaveType = findLeaveType(policy, type);
  if (!leaveType || !leaveType.active) return ['Choose a valid leave type.'];

  const errors = [];
  const days = countLeaveDays(type, from, to, policy);

  if (to < from) {
    return ['The end date must be on or after the start date.'];
  }
  if (from < today) {
    errors.push('Leave cannot start in the past.');
  }
  if (days === 0) {
    errors.push('The selected dates have no working days (weekends and public holidays are not counted).');
  }

  const overlapping = requests.find(r =>
    r.employeeId === employeeId && isActive(r.status) && r.from <= to && r.to >= from
  );
  if (overlapping) {
    errors.push(`These dates overlap your ${overlapping.type} request (${overlapping.from} to ${overlapping.to}).`);
  }

  const balance = getBalances(requests, employeeId, Number(from.slice(0, 4)), policy).find(b => b.type === type);
  if (balance && days > balance.remaining) {
    errors.push(`You only have ${Math.max(balance.remaining, 0)} days of ${type} left for ${from.slice(0, 4)}.`);
  }

  const limit = leaveType.attachmentRequiredOver;
  if (limit !== null && limit !== undefined && days > limit && !attachment) {
    errors.push(`A supporting document (e.g. a doctor's note) is required for ${type.toLowerCase()} over ${limit} days.`);
  }

  return errors;
}
