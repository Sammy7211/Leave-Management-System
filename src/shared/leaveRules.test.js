import { countLeaveDays, getBalances, getPublicHolidays, validateLeaveRequest } from './leaveRules.js';

describe('public holidays', () => {
  test('includes Good Friday and Easter Monday', () => {
    const holidays = getPublicHolidays(2026); // Easter Sunday is 5 April 2026
    expect(holidays.has('2026-04-03')).toBe(true);
    expect(holidays.has('2026-04-06')).toBe(true);
  });

  test('moves a Sunday holiday to Monday', () => {
    expect(getPublicHolidays(2023).has('2023-01-02')).toBe(true); // New Year's Day was a Sunday
  });

  test('moves Christmas on a Sunday to Tuesday, after Boxing Day', () => {
    const holidays = getPublicHolidays(2022);
    expect(holidays.has('2022-12-26')).toBe(true);
    expect(holidays.has('2022-12-27')).toBe(true);
  });
});

describe('countLeaveDays', () => {
  test('skips weekends for working-day leave', () => {
    expect(countLeaveDays('Annual Leave', '2026-10-16', '2026-10-19')).toBe(2); // Fri to Mon
  });

  test('skips public holidays', () => {
    expect(countLeaveDays('Annual Leave', '2026-10-19', '2026-10-21')).toBe(2); // 20 Oct is Mashujaa Day
  });

  test('counts every day for calendar-day leave', () => {
    expect(countLeaveDays('Maternity Leave', '2026-10-16', '2026-10-19')).toBe(4);
  });

  test('returns 0 when the end is before the start', () => {
    expect(countLeaveDays('Annual Leave', '2026-10-19', '2026-10-16')).toBe(0);
  });
});

describe('getBalances', () => {
  test('separates taken, pending and remaining days', () => {
    const requests = [
      { employeeId: 'E1', type: 'Annual Leave', from: '2026-03-02', days: 5, status: 'Approved (Final)' },
      { employeeId: 'E1', type: 'Annual Leave', from: '2026-06-01', days: 3, status: 'Pending HR Approval' },
      { employeeId: 'E1', type: 'Annual Leave', from: '2026-07-01', days: 4, status: 'Rejected by Manager' },
      { employeeId: 'E2', type: 'Annual Leave', from: '2026-03-02', days: 9, status: 'Approved (Final)' },
      { employeeId: 'E1', type: 'Annual Leave', from: '2025-03-02', days: 9, status: 'Approved (Final)' },
    ];
    const annual = getBalances(requests, 'E1', 2026).find(b => b.type === 'Annual Leave');
    expect(annual).toMatchObject({ entitlement: 21, used: 5, pending: 3, remaining: 13 });
  });
});

describe('validateLeaveRequest', () => {
  const today = '2026-10-14';
  const validate = (form, requests = []) => validateLeaveRequest(form, { requests, employeeId: 'E1', today });

  test('accepts a valid request', () => {
    expect(validate({ type: 'Annual Leave', from: '2026-11-02', to: '2026-11-06' })).toEqual([]);
  });

  test('rejects dates in the past', () => {
    expect(validate({ type: 'Annual Leave', from: '2026-10-01', to: '2026-10-02' }))
      .toContain('Leave cannot start in the past.');
  });

  test('rejects an end date before the start date', () => {
    expect(validate({ type: 'Annual Leave', from: '2026-11-06', to: '2026-11-02' }))
      .toEqual(['The end date must be on or after the start date.']);
  });

  test('rejects a weekend-only request', () => {
    expect(validate({ type: 'Annual Leave', from: '2026-11-07', to: '2026-11-08' })[0])
      .toMatch(/no working days/);
  });

  test('rejects overlapping requests, ignoring rejected ones', () => {
    const existing = { employeeId: 'E1', type: 'Annual Leave', from: '2026-11-02', to: '2026-11-06', days: 5 };
    const form = { type: 'Annual Leave', from: '2026-11-05', to: '2026-11-10' };

    expect(validate(form, [{ ...existing, status: 'Pending Manager Approval' }])[0]).toMatch(/overlap/);
    expect(validate(form, [{ ...existing, status: 'Rejected by Manager' }])).toEqual([]);
  });

  test('rejects requests beyond the remaining balance', () => {
    const taken = [{ employeeId: 'E1', type: 'Annual Leave', from: '2026-03-02', to: '2026-03-27', days: 20, status: 'Approved (Final)' }];
    expect(validate({ type: 'Annual Leave', from: '2026-11-09', to: '2026-11-10' }, taken))
      .toContain('You only have 1 days of Annual Leave left for 2026.');
  });

  test('requires a document for sick leave over 2 days', () => {
    const form = { type: 'Sick Leave', from: '2026-11-09', to: '2026-11-11' };
    expect(validate(form)[0]).toMatch(/supporting document/);
    expect(validate({ ...form, attachment: { name: 'note.pdf' } })).toEqual([]);
  });
});
