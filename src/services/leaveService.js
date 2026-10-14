// src/services/leaveService.js
// Leave rules: types, entitlements, working-day counting, balances and validation.

// Entitlements per calendar year. These are starting values based on the
// Employment Act minimums; confirm them against KALRO's HR policy.
// unit: 'working' skips weekends and public holidays, 'calendar' counts every day.
export const LEAVE_TYPES = {
  'Annual Leave': { entitlement: 21, unit: 'working' },
  'Sick Leave': { entitlement: 14, unit: 'working', attachmentRequiredOver: 2 },
  'Maternity Leave': { entitlement: 90, unit: 'calendar' },
  'Paternity Leave': { entitlement: 14, unit: 'calendar' },
  'Compassionate Leave': { entitlement: 5, unit: 'working' },
  'Study Leave': { entitlement: 10, unit: 'working' },
};

// Kenyan public holidays on fixed dates (MM-DD)
const FIXED_HOLIDAYS = [
  '01-01', // New Year's Day
  '05-01', // Labour Day
  '06-01', // Madaraka Day
  '10-10', // Mazingira Day
  '10-20', // Mashujaa Day
  '12-12', // Jamhuri Day
  '12-25', // Christmas Day
  '12-26', // Boxing Day
];

// Holidays gazetted each year that can't be calculated, e.g. Idd-ul-Fitr
// or one-off national days. Add them as 'YYYY-MM-DD'.
export const GAZETTED_HOLIDAYS = [];

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

const holidayCache = {};

export function getPublicHolidays(year) {
  if (holidayCache[year]) return holidayCache[year];

  const fixed = FIXED_HOLIDAYS.map(mmdd => parseDate(`${year}-${mmdd}`));
  const easter = easterSunday(year);
  const holidays = new Set([
    ...fixed.map(toISO),
    toISO(addDays(easter, -2)), // Good Friday
    toISO(addDays(easter, 1)), // Easter Monday
  ]);

  // A holiday falling on a Sunday is observed on the next free weekday,
  // e.g. Christmas on a Sunday moves to Tuesday because Monday is Boxing Day
  fixed.filter(date => date.getUTCDay() === 0).forEach(date => {
    let observed = addDays(date, 1);
    while (holidays.has(toISO(observed)) || observed.getUTCDay() === 6) {
      observed = addDays(observed, 1);
    }
    holidays.add(toISO(observed));
  });

  GAZETTED_HOLIDAYS.filter(d => d.startsWith(`${year}-`)).forEach(d => holidays.add(d));

  holidayCache[year] = holidays;
  return holidays;
}

export function isWorkingDay(iso) {
  const day = parseDate(iso).getUTCDay();
  if (day === 0 || day === 6) return false;
  return !getPublicHolidays(Number(iso.slice(0, 4))).has(iso);
}

// Number of leave days between two ISO dates (inclusive) for a leave type
export function countLeaveDays(type, from, to) {
  if (!from || !to || to < from) return 0;
  const unit = LEAVE_TYPES[type]?.unit || 'working';
  let count = 0;
  for (let d = parseDate(from); d <= parseDate(to); d = addDays(d, 1)) {
    if (unit === 'calendar' || isWorkingDay(toISO(d))) count++;
  }
  return count;
}

// Status helpers shared across dashboards
export const isPending = (status = '') => status.startsWith('Pending');
export const isApproved = (status = '') => status.includes('Approved');
export const isRejected = (status = '') => status.includes('Rejected');

// Leave taken and booked per type for one employee in one year.
// A request counts towards the year it starts in.
export function getBalances(requests, employeeId, year = new Date().getFullYear()) {
  const mine = requests.filter(r => r.employeeId === employeeId && r.from?.startsWith(`${year}-`));

  return Object.entries(LEAVE_TYPES).map(([type, { entitlement, unit }]) => {
    const ofType = mine.filter(r => r.type === type);
    const sum = (list) => list.reduce((total, r) => total + (Number(r.days) || 0), 0);
    const used = sum(ofType.filter(r => isApproved(r.status)));
    const pending = sum(ofType.filter(r => isPending(r.status)));
    return { type, unit, entitlement, used, pending, remaining: entitlement - used - pending };
  });
}

// Returns a list of problems with a leave request; empty means it's valid
export function validateLeaveRequest(form, { requests, employeeId, today = todayISO() }) {
  const { type, from, to, attachment } = form;
  if (!type || !from || !to) return [];

  const errors = [];
  const days = countLeaveDays(type, from, to);

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
    r.employeeId === employeeId && !isRejected(r.status) && r.from <= to && r.to >= from
  );
  if (overlapping) {
    errors.push(`These dates overlap your ${overlapping.type} request (${overlapping.from} to ${overlapping.to}).`);
  }

  const balance = getBalances(requests, employeeId, Number(from.slice(0, 4))).find(b => b.type === type);
  if (balance && days > balance.remaining) {
    errors.push(`You only have ${Math.max(balance.remaining, 0)} days of ${type} left for ${from.slice(0, 4)}.`);
  }

  const limit = LEAVE_TYPES[type]?.attachmentRequiredOver;
  if (limit !== undefined && days > limit && !attachment) {
    errors.push(`A supporting document (e.g. a doctor's note) is required for ${type.toLowerCase()} over ${limit} days.`);
  }

  return errors;
}
