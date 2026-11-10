import { cancellationFor, countLeaveDays, fixedHolidays, getBalances, getPublicHolidays, validateLeaveRequest } from './leaveRules.js';

const POLICY = {
  leaveTypes: [
    { name: 'Annual Leave', entitlement: 21, unit: 'working', attachmentRequiredOver: null, active: true },
    { name: 'Sick Leave', entitlement: 14, unit: 'working', attachmentRequiredOver: 2, active: true },
    { name: 'Maternity Leave', entitlement: 90, unit: 'calendar', attachmentRequiredOver: null, active: true },
    { name: 'Old Leave', entitlement: 5, unit: 'working', attachmentRequiredOver: null, active: false },
  ],
  holidays: [],
};

describe('public holidays', () => {
  test('includes Good Friday and Easter Monday', () => {
    const holidays = getPublicHolidays(2026, POLICY); // Easter Sunday is 5 April 2026
    expect(holidays.has('2026-04-03')).toBe(true);
    expect(holidays.has('2026-04-06')).toBe(true);
  });

  test('moves a Sunday holiday to Monday', () => {
    expect(getPublicHolidays(2023, POLICY).has('2023-01-02')).toBe(true); // New Year's Day was a Sunday
  });

  test('moves Christmas on a Sunday to Tuesday, after Boxing Day', () => {
    const holidays = getPublicHolidays(2022, POLICY);
    expect(holidays.has('2022-12-26')).toBe(true);
    expect(holidays.has('2022-12-27')).toBe(true);
  });

  test('names the fixed holidays, including observed days', () => {
    expect(fixedHolidays(2022)).toContainEqual({ date: '2022-12-27', name: 'Christmas Day (observed)' });
    expect(fixedHolidays(2026)).toContainEqual({ date: '2026-04-03', name: 'Good Friday' });
  });

  test('adds gazetted holidays from the policy for their year only', () => {
    const policy = { ...POLICY, holidays: [{ date: '2026-03-20', name: 'Idd-ul-Fitr' }] };
    expect(getPublicHolidays(2026, policy).has('2026-03-20')).toBe(true);
    expect(getPublicHolidays(2027, policy).has('2026-03-20')).toBe(false);
  });
});

describe('countLeaveDays', () => {
  test('skips weekends for working-day leave', () => {
    expect(countLeaveDays('Annual Leave', '2026-10-16', '2026-10-19', POLICY)).toBe(2); // Fri to Mon
  });

  test('skips public holidays', () => {
    expect(countLeaveDays('Annual Leave', '2026-10-19', '2026-10-21', POLICY)).toBe(2); // 20 Oct is Mashujaa Day
  });

  test('skips gazetted holidays', () => {
    const policy = { ...POLICY, holidays: [{ date: '2026-03-20', name: 'Idd-ul-Fitr' }] };
    expect(countLeaveDays('Annual Leave', '2026-03-16', '2026-03-20', POLICY)).toBe(5);
    expect(countLeaveDays('Annual Leave', '2026-03-16', '2026-03-20', policy)).toBe(4);
  });

  test('counts every day for calendar-day leave', () => {
    expect(countLeaveDays('Maternity Leave', '2026-10-16', '2026-10-19', POLICY)).toBe(4);
  });

  test('handles leave running across New Year', () => {
    expect(countLeaveDays('Annual Leave', '2026-12-30', '2027-01-04', POLICY)).toBe(3); // 30, 31 Dec and 4 Jan
  });

  test('returns 0 when the end is before the start', () => {
    expect(countLeaveDays('Annual Leave', '2026-10-19', '2026-10-16', POLICY)).toBe(0);
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
    const annual = getBalances(requests, 'E1', 2026, POLICY).find(b => b.type === 'Annual Leave');
    expect(annual).toMatchObject({ entitlement: 21, used: 5, pending: 3, remaining: 13 });
  });

  test('leaves out inactive leave types', () => {
    expect(getBalances([], 'E1', 2026, POLICY).map(b => b.type)).not.toContain('Old Leave');
  });
});

describe('validateLeaveRequest', () => {
  const today = '2026-10-14';
  const validate = (form, requests = []) => validateLeaveRequest(form, { requests, employeeId: 'E1', today, policy: POLICY });

  test('accepts a valid request', () => {
    expect(validate({ type: 'Annual Leave', from: '2026-11-02', to: '2026-11-06' })).toEqual([]);
  });

  test('rejects unknown and inactive leave types', () => {
    expect(validate({ type: 'Holiday Leave', from: '2026-11-02', to: '2026-11-06' })).toEqual(['Choose a valid leave type.']);
    expect(validate({ type: 'Old Leave', from: '2026-11-02', to: '2026-11-06' })).toEqual(['Choose a valid leave type.']);
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

describe('cancellationFor', () => {
  const today = '2026-10-14';

  test('pending requests are withdrawn, no reason needed', () => {
    expect(cancellationFor({ status: 'Pending HR Approval', from: '2026-10-01' }, today))
      .toEqual({ status: 'Withdrawn', reasonRequired: false });
  });

  test('approved leave can be cancelled before it starts, with a reason', () => {
    expect(cancellationFor({ status: 'Approved (Final)', from: '2026-10-15' }, today))
      .toEqual({ status: 'Cancelled', reasonRequired: true });
    expect(cancellationFor({ status: 'Approved by Manager', from: '2026-11-01' }, today).status).toBe('Cancelled');
  });

  test('approved leave that has started cannot be cancelled here', () => {
    expect(cancellationFor({ status: 'Approved (Final)', from: '2026-10-14' }, today).error).toMatch(/already started/);
  });

  test('closed requests cannot be cancelled', () => {
    for (const status of ['Rejected by Manager', 'Rejected (Final)', 'Withdrawn', 'Cancelled']) {
      expect(cancellationFor({ status, from: '2026-11-01' }, today).error).toMatch(/already been closed/);
    }
  });
});

describe('withdrawn and cancelled requests', () => {
  const requests = [
    { employeeId: 'E1', type: 'Annual Leave', from: '2026-11-02', to: '2026-11-06', days: 5, status: 'Withdrawn' },
    { employeeId: 'E1', type: 'Annual Leave', from: '2026-11-09', to: '2026-11-13', days: 5, status: 'Cancelled' },
  ];

  test('give their days back', () => {
    expect(getBalances(requests, 'E1', 2026, POLICY).find(b => b.type === 'Annual Leave'))
      .toMatchObject({ used: 0, pending: 0, remaining: 21 });
  });

  test('free up their dates', () => {
    const form = { type: 'Annual Leave', from: '2026-11-02', to: '2026-11-13' };
    expect(validateLeaveRequest(form, { requests, employeeId: 'E1', today: '2026-10-14', policy: POLICY })).toEqual([]);
  });
});
