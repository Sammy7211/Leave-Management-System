// src/pages/ManagerDashboard.js
import React, { useContext, useState } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { AuthContext } from '../context/AuthContext';
import { isApproved, isRejected } from '../services/leaveService';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/TopBar';
import StatsCard from '../components/StatsCard';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import LeaveForm from '../components/LeaveForm';
import LeaveBalances from '../components/LeaveBalances';
import RequestDetails from '../components/RequestDetails';
import ReviewModal from '../components/ReviewModal';
import Toast from '../components/Toast';
import '../styles/Dashboard.css';

function ManagerDashboard() {
  const { requests, updateRequestStatus } = useContext(RequestsContext);
  const { user } = useContext(AuthContext);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [viewingRequest, setViewingRequest] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // ✅ Separate filters (HR staff report to the manager too)
  const employeeRequests = requests.filter(r => (!r.role || r.role === 'Employee' || r.role === 'HR'));
  const managerRequests = requests.filter(r => r.role === 'Manager' && r.employeeId === user?.id);

  // ✅ Handle decisions with HR workflow in mind
  const handleApprove = (comment) => {
    if (selectedRequest.role === 'HR') {
      // HR can't approve their own leave, so the manager's decision is final
      updateRequestStatus(selectedRequest.id, 'Approved by Manager', { by: user?.name, comment });
      setToastMessage({
        title: 'Request Approved',
        message: 'HR leave request has been approved.',
        type: 'success'
      });
    } else {
      updateRequestStatus(selectedRequest.id, 'Pending HR Approval', { by: user?.name, comment }); // ✅ forward to HR
      setToastMessage({
        title: 'Request Recommended',
        message: 'Request sent to HR for final approval.',
        type: 'success'
      });
    }
    setSelectedRequest(null);
  };

  const handleReject = (comment) => {
    updateRequestStatus(selectedRequest.id, 'Rejected by Manager', { by: user?.name, comment });
    setToastMessage({
      title: 'Request Rejected',
      message: 'Request has been rejected by Manager.',
      type: 'danger'
    });
    setSelectedRequest(null);
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-content">
        <Topbar title="Manager Dashboard" subtitle="Review employee requests and manage your own leave" />

        {/* ✅ Stats */}
        <div className="stats-container">
          <StatsCard title="Employee Requests" value={employeeRequests.length} />
          <StatsCard title="Manager Requests" value={managerRequests.length} />
          <StatsCard title="Approved" value={requests.filter(r => isApproved(r.status)).length} />
          <StatsCard title="Rejected" value={requests.filter(r => isRejected(r.status)).length} />
        </div>

        {/* ✅ Employee Requests Table */}
        <DataTable
          title="Employee Leave Requests"
          headers={['Employee', 'Role', 'Type', 'Days', 'Reason', 'Status', 'Actions']}
          rows={employeeRequests.map(r => [
            r.employee,
            r.role || 'Employee',
            r.type,
            r.days,
            r.reason,
            r.status,
            r.status === 'Pending Manager Approval'
              ? <button className="btn primary" onClick={() => setSelectedRequest(r)}>Review</button>
              : <button className="btn secondary" onClick={() => setViewingRequest(r)}>Details</button>
          ])}
        />

        {/* ✅ Manager’s Own Requests Table */}
        <DataTable
          title="My Leave Requests"
          headers={['Type', 'From', 'To', 'Days', 'Reason', 'Status', '']}
          rows={managerRequests.map(r => [
            r.type,
            r.from,
            r.to,
            r.days,
            r.reason,
            r.status,
            <button className="btn secondary" onClick={() => setViewingRequest(r)}>Details</button>
          ])}
        />

        <LeaveBalances />

        {/* ✅ Review Modal for Employee Requests */}
        {selectedRequest && (
          <ReviewModal
            request={selectedRequest}
            approveLabel={selectedRequest.role === 'HR' ? 'Approve' : 'Recommend'}
            onApprove={handleApprove}
            onReject={handleReject}
            onClose={() => setSelectedRequest(null)}
          />
        )}

        {viewingRequest && (
          <Modal onClose={() => setViewingRequest(null)}>
            <h3>Request Details</h3>
            <RequestDetails request={viewingRequest} />
          </Modal>
        )}

        {/* ✅ Manager Leave Form */}
        {showForm && (
          <Modal onClose={() => setShowForm(false)}>
            <LeaveForm
              role="Manager"
              onSubmit={(data) => {
                setShowForm(false);
                if (data) {
                  setToastMessage({
                    title: 'Leave Request Submitted',
                    message: 'Your manager request has been sent to HR.',
                    type: 'success'
                  });
                }
              }}
              onClose={() => setShowForm(false)}
            />
          </Modal>
        )}

        {/* ✅ Action bar */}
        <div className="actions-bar">
          <button className="btn primary" onClick={() => setShowForm(true)}>+ Request Leave</button>
        </div>

        {/* ✅ Toast Notification */}
        {toastMessage && (
          <Toast
            title={toastMessage.title}
            message={toastMessage.message}
            type={toastMessage.type}
            onClose={() => setToastMessage(null)}
          />
        )}
      </main>
    </div>
  );
}

export default ManagerDashboard;
