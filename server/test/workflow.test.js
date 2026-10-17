// server/test/workflow.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, initialStatus } from '../src/leave/workflow.js';

const ALICE = { id: 1, role: 'manager' }; // line manager of Jane and Bob
const BOB = { id: 2, role: 'hr' };
const JANE = { id: 3, role: 'employee' };
const OTHER_MANAGER = { id: 4, role: 'manager' };
const ADMIN = { id: 5, role: 'admin' };

const janesRequest = (status) => ({ employeeId: JANE.id, applicantManagerId: ALICE.id, applicantRole: 'employee', status });
const bobsRequest = (status) => ({ employeeId: BOB.id, applicantManagerId: ALICE.id, applicantRole: 'hr', status });
const alicesRequest = (status) => ({ employeeId: ALICE.id, applicantManagerId: null, applicantRole: 'manager', status });

test('managers start with HR; everyone else starts with their manager', () => {
  assert.equal(initialStatus('manager'), 'Pending HR Approval');
  assert.equal(initialStatus('employee'), 'Pending Manager Approval');
  assert.equal(initialStatus('hr'), 'Pending Manager Approval');
});

test('employee request: line manager recommends, then HR decides', () => {
  assert.deepEqual(decide({ actor: ALICE, request: janesRequest('Pending Manager Approval'), decision: 'approve' }), { status: 'Pending HR Approval' });
  assert.deepEqual(decide({ actor: ALICE, request: janesRequest('Pending Manager Approval'), decision: 'reject' }), { status: 'Rejected by Manager' });
  assert.deepEqual(decide({ actor: BOB, request: janesRequest('Pending HR Approval'), decision: 'approve' }), { status: 'Approved (Final)' });
  assert.deepEqual(decide({ actor: BOB, request: janesRequest('Pending HR Approval'), decision: 'reject' }), { status: 'Rejected (Final)' });
});

test("HR staff request: the line manager's decision is final", () => {
  assert.deepEqual(decide({ actor: ALICE, request: bobsRequest('Pending Manager Approval'), decision: 'approve' }), { status: 'Approved by Manager' });
});

test('manager request goes straight to HR', () => {
  assert.deepEqual(decide({ actor: BOB, request: alicesRequest('Pending HR Approval'), decision: 'approve' }), { status: 'Approved (Final)' });
});

test("a manager cannot decide for someone outside their team", () => {
  const outcome = decide({ actor: OTHER_MANAGER, request: janesRequest('Pending Manager Approval'), decision: 'approve' });
  assert.equal(outcome.httpStatus, 403);
});

test('HR cannot skip the manager step', () => {
  const outcome = decide({ actor: BOB, request: janesRequest('Pending Manager Approval'), decision: 'approve' });
  assert.equal(outcome.httpStatus, 403);
  assert.match(outcome.error, /line manager/);
});

test('employees cannot decide requests', () => {
  assert.equal(decide({ actor: JANE, request: bobsRequest('Pending Manager Approval'), decision: 'approve' }).httpStatus, 403);
});

test('nobody can decide their own request', () => {
  const outcome = decide({ actor: BOB, request: bobsRequest('Pending HR Approval'), decision: 'approve' });
  assert.equal(outcome.httpStatus, 403);
  assert.match(outcome.error, /your own/);
});

test('admins make the final decision on any pending request', () => {
  assert.deepEqual(decide({ actor: ADMIN, request: janesRequest('Pending Manager Approval'), decision: 'approve' }), { status: 'Approved (Final)' });
  assert.deepEqual(decide({ actor: ADMIN, request: alicesRequest('Pending HR Approval'), decision: 'reject' }), { status: 'Rejected (Final)' });
});

test('decided requests cannot be changed, even by an admin', () => {
  for (const status of ['Approved (Final)', 'Rejected by Manager', 'Approved by Manager']) {
    assert.equal(decide({ actor: ADMIN, request: janesRequest(status), decision: 'reject' }).httpStatus, 409);
  }
});
