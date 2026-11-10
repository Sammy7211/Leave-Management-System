-- Withdrawn: the applicant withdrew a pending request.
-- Cancelled: the applicant cancelled approved leave before it started.
-- Either way the days go back to their balance.
ALTER TABLE leave_requests DROP CONSTRAINT leave_requests_status_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check CHECK (status IN (
  'Pending Manager Approval', 'Pending HR Approval',
  'Approved by Manager', 'Approved (Final)',
  'Rejected by Manager', 'Rejected (Final)',
  'Withdrawn', 'Cancelled'
));
