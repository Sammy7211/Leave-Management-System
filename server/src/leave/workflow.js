// server/src/leave/workflow.js
// The approval chain, decided on the server so the browser can't skip a step:
//
//   Employee: Pending Manager Approval -> (line manager recommends) -> Pending HR Approval -> (HR) -> Approved/Rejected (Final)
//   HR staff: Pending Manager Approval -> (line manager) -> Approved/Rejected by Manager
//   Manager:  Pending HR Approval -> (HR) -> Approved/Rejected (Final)
//
// Admins can make the final decision on any pending request. Nobody can decide their own request.

export const ROLE_LABELS = { employee: 'Employee', manager: 'Manager', hr: 'HR', admin: 'Admin' };

export function initialStatus(applicantRole) {
  return applicantRole === 'manager' ? 'Pending HR Approval' : 'Pending Manager Approval';
}

// Who may see a request: the applicant, their line manager, HR and admins
export function canView(actor, request) {
  return actor.id === request.employeeId
    || actor.id === request.applicantManagerId
    || actor.role === 'hr'
    || actor.role === 'admin';
}

// Works out what a decision does to a request.
// Returns { status } for the new status, or { error, httpStatus } if the actor can't make it.
export function decide({ actor, request, decision }) {
  if (!request.status.startsWith('Pending')) {
    return { error: 'This request has already been decided.', httpStatus: 409 };
  }
  if (actor.id === request.employeeId) {
    return { error: 'You cannot review your own leave request.', httpStatus: 403 };
  }
  const approve = decision === 'approve';

  if (actor.role === 'admin') {
    return { status: approve ? 'Approved (Final)' : 'Rejected (Final)' };
  }

  if (request.status === 'Pending Manager Approval'
    && actor.role === 'manager' && actor.id === request.applicantManagerId) {
    if (!approve) return { status: 'Rejected by Manager' };
    // HR can't approve their own leave, so for HR staff the manager's approval is final
    return { status: request.applicantRole === 'hr' ? 'Approved by Manager' : 'Pending HR Approval' };
  }

  if (request.status === 'Pending HR Approval' && actor.role === 'hr') {
    return { status: approve ? 'Approved (Final)' : 'Rejected (Final)' };
  }

  const waitingFor = request.status === 'Pending HR Approval' ? 'HR' : "the applicant's line manager";
  return { error: `This request is waiting for ${waitingFor}.`, httpStatus: 403 };
}
