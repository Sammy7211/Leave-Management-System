// src/pages/HRDashboard.js
import React, { useContext, useState } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { AuthContext } from '../context/AuthContext';
import { isApproved, isRejected } from '../shared/leaveRules.js';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/TopBar';
import StatsCard from '../components/StatsCard';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import LeaveForm from '../components/LeaveForm';   // ✅ import LeaveForm
import LeaveBalances from '../components/LeaveBalances';
import RequestDetails from '../components/RequestDetails';
import ReviewModal from '../components/ReviewModal';
import '../styles/Dashboard.css';

function HRDashboard() {
  const { requests, decideRequest } = useContext(RequestsContext);
  const { user } = useContext(AuthContext);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [viewingRequest, setViewingRequest] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [showForm, setShowForm] = useState(false); // ✅ define showForm state

  // ✅ Handle HR decision ('approve' or 'reject'); errors are shown in the review dialog
  const handleDecision = async (decision, comment) => {
    const updated = await decideRequest(selectedRequest.id, decision, comment);
    setToastMessage({
      text: `Request ${updated.status}`,
      type: isApproved(updated.status) ? 'success' : 'danger'
    });
    setSelectedRequest(null);
  };

  // ✅ Filter requests
  const pendingHRRequests = requests.filter(r => r.status === 'Pending HR Approval');
  const managerRequests = requests.filter(r => r.role === 'Manager' && r.status === 'Pending HR Approval');
  const employeeRequests = requests.filter(r => (!r.role || r.role === 'Employee') && r.status === 'Pending HR Approval');
  const approvedRequests = requests.filter(r => isApproved(r.status));
  const rejectedRequests = requests.filter(r => isRejected(r.status));
  const myRequests = requests.filter(r => r.employeeId === user?.id);

  const detailsButton = (r) => (
    <button className="btn secondary" onClick={() => setViewingRequest(r)}>Details</button>
  );

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-content">
        <Topbar title="HR Dashboard" subtitle="Review and approve leave requests" />

        {/* ✅ Stats */}
        <div className="stats-container">
          <StatsCard title="Pending HR Requests" value={pendingHRRequests.length} />
          <StatsCard title="Approved Requests" value={approvedRequests.length} />
          <StatsCard title="Rejected Requests" value={rejectedRequests.length} />
        </div>

        {/* ✅ HR can also request leave */}
        <div className="actions-bar">
          <button className="btn primary" onClick={() => setShowForm(true)}>+ Request Leave</button>
        </div>

        {/* ✅ Manager Requests */}
        <DataTable
          title="Manager Requests Pending HR Approval"
          headers={['Manager', 'Type', 'Days', 'Reason', 'Status', 'Actions']}
          rows={managerRequests.map(r => [
            r.employee,
            r.type,
            r.days,
            r.reason,
            r.status,
            <button className="btn primary" onClick={() => setSelectedRequest(r)}>Review</button>
          ])}
        />

        {/* ✅ Employee Requests */}
        <DataTable
          title="Employee Requests Pending HR Approval"
          headers={['Employee', 'Type', 'Days', 'Reason', 'Status', 'Actions']}
          rows={employeeRequests.map(r => [
            r.employee,
            r.type,
            r.days,
            r.reason,
            r.status,
            <button className="btn primary" onClick={() => setSelectedRequest(r)}>Review</button>
          ])}
        />

        {/* ✅ HR's own requests (reviewed by the Manager) */}
        <DataTable
          title="My Leave Requests"
          headers={['Type', 'From', 'To', 'Days', 'Reason', 'Status', '']}
          rows={myRequests.map(r => [r.type, r.from, r.to, r.days, r.reason, r.status, detailsButton(r)])}
        />

        <LeaveBalances />

        {showForm && (
          <Modal onClose={() => setShowForm(false)}>
            <LeaveForm
              onSubmit={(data) => {
                setShowForm(false);
                if (data) {
                  setToastMessage({ text: 'Leave request submitted successfully', type: 'success' });
                }
              }}
              onClose={() => setShowForm(false)}
            />
          </Modal>
        )}

        {/* ✅ Approved Requests */}
        <DataTable
          title="Approved Requests"
          headers={['Employee', 'Role', 'Type', 'Days', 'Reason', 'Status', '']}
          rows={approvedRequests.map(r => [r.employee, r.role || 'Employee', r.type, r.days, r.reason, r.status, detailsButton(r)])}
        />

        {/* ✅ Rejected Requests */}
        <DataTable
          title="Rejected Requests"
          headers={['Employee', 'Role', 'Type', 'Days', 'Reason', 'Status', '']}
          rows={rejectedRequests.map(r => [r.employee, r.role || 'Employee', r.type, r.days, r.reason, r.status, detailsButton(r)])}
        />

        {/* ✅ Review Modal */}
        {selectedRequest && (
          <ReviewModal
            request={selectedRequest}
            onApprove={(comment) => handleDecision('approve', comment)}
            onReject={(comment) => handleDecision('reject', comment)}
            onClose={() => setSelectedRequest(null)}
          />
        )}

        {viewingRequest && (
          <Modal onClose={() => setViewingRequest(null)}>
            <h3>Request Details</h3>
            <RequestDetails request={viewingRequest} />
          </Modal>
        )}

        {/* ✅ Toast Notification */}
        {toastMessage && (
          <Toast
            message={toastMessage.text}
            type={toastMessage.type}
            onClose={() => setToastMessage(null)}
          />
        )}
      </main>
    </div>
  );
}

export default HRDashboard;
