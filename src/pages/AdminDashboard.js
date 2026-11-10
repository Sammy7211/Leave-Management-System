// src/pages/AdminDashboard.js
import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/TopBar';
import StatsCard from '../components/StatsCard';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import ReviewModal from '../components/ReviewModal';
import RequestDetails from '../components/RequestDetails';
import StaffManagement from '../components/StaffManagement';
import LeavePolicyManagement from '../components/LeavePolicyManagement';
import ReportsPanel from '../components/ReportsPanel';
import { RequestsContext } from '../context/RequestsContext';
import { isApproved, isPending, isRejected } from '../shared/leaveRules.js';
import '../styles/Dashboard.css';

function AdminDashboard() {
  const { requests, decideRequest } = useContext(RequestsContext);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [viewingRequest, setViewingRequest] = useState(null);
  const { user } = useContext(AuthContext);
  const [staff, setStaff] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  // ✅ Handle request actions
  // Admins make the final decision on pending requests; errors are shown in the review dialog
  const handleApprove = async (comment) => {
    await decideRequest(selectedRequest.id, 'approve', comment);
    setToastMessage({ text: 'Request approved successfully', type: 'success' });
    setSelectedRequest(null);
  };

  const handleReject = async (comment) => {
    await decideRequest(selectedRequest.id, 'reject', comment);
    setToastMessage({ text: 'Request rejected successfully', type: 'danger' });
    setSelectedRequest(null);
  };

  // ✅ Filter requests
  const acceptedRequests = requests.filter(r => isApproved(r.status));
  const rejectedRequests = requests.filter(r => isRejected(r.status));
  const managerRequests = requests.filter(r => r.role === 'Manager');
  const hrRequests = requests.filter(r => r.role === 'HR');

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-content">
        <Topbar title="Admin Dashboard" subtitle="System overview and module management" />

        {/* ✅ Stats */}
        <div className="stats-container">
          <StatsCard title="Active Staff" value={staff.filter(s => s.active).length} />
          <StatsCard title="Leave Requests" value={requests.length} />
          <StatsCard title="Approved" value={acceptedRequests.length} />
          <StatsCard title="Rejected" value={rejectedRequests.length} />
        </div>

        {/* ✅ CSV reports, built by the server */}
        <ReportsPanel />

        {/* ✅ Leave Requests Table */}
        <DataTable
          title="All Leave Requests"
          headers={['Employee', 'Role', 'Type', 'Days', 'Reason', 'Status', 'Actions']}
          rows={requests.map(r => [
            r.employee,
            r.role || 'Employee',
            r.type,
            r.days,
            r.reason,
            r.status,
            isPending(r.status)
              ? <button className="btn primary" onClick={() => setSelectedRequest(r)}>Review</button>
              : <button className="btn secondary" onClick={() => setViewingRequest(r)}>Details</button>
          ])}
        />

        {viewingRequest && (
          <Modal onClose={() => setViewingRequest(null)}>
            <h3>Request Details</h3>
            <RequestDetails request={viewingRequest} />
          </Modal>
        )}

        {selectedRequest && (
          <ReviewModal
            request={selectedRequest}
            onApprove={handleApprove}
            onReject={handleReject}
            onClose={() => setSelectedRequest(null)}
          />
        )}

        {/* ✅ Accepted Requests */}
        <DataTable
          title="Accepted Requests"
          headers={['Employee', 'Role', 'Type', 'Days', 'Reason', 'Status']}
          rows={acceptedRequests.map(r => [r.employee, r.role || 'Employee', r.type, r.days, r.reason, r.status])}
        />

        {/* ✅ Rejected Requests */}
        <DataTable
          title="Rejected Requests"
          headers={['Employee', 'Role', 'Type', 'Days', 'Reason', 'Status']}
          rows={rejectedRequests.map(r => [r.employee, r.role || 'Employee', r.type, r.days, r.reason, r.status])}
        />

        {/* ✅ Role-based Requests */}
        <DataTable
          title="Manager Requests"
          headers={['Employee', 'Type', 'Days', 'Reason', 'Status']}
          rows={managerRequests.map(r => [r.employee, r.type, r.days, r.reason, r.status])}
        />

        <DataTable
          title="HR Requests"
          headers={['Employee', 'Type', 'Days', 'Reason', 'Status']}
          rows={hrRequests.map(r => [r.employee, r.type, r.days, r.reason, r.status])}
        />

        {/* ✅ Staff accounts */}
        <StaffManagement currentUserId={user?.id} onNotify={setToastMessage} onUsersChange={setStaff} />

        {/* ✅ Leave types and public holidays */}
        <LeavePolicyManagement onNotify={setToastMessage} />

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

export default AdminDashboard;
