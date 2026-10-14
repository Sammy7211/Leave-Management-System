import React, { useState, useContext } from 'react';
import { RequestsContext } from '../context/RequestsContext';
import { AuthContext } from '../context/AuthContext';
import { isApproved, isPending, isRejected } from '../services/leaveService';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/TopBar';
import StatsCard from '../components/StatsCard';
import ActionsBar from '../components/ActionsBar';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import LeaveForm from '../components/LeaveForm';
import LeaveBalances from '../components/LeaveBalances';
import RequestDetails from '../components/RequestDetails';
import Toast from '../components/Toast';
import '../styles/Dashboard.css';

function EmployeeDashboard() {
  const { requests } = useContext(RequestsContext);
  const { user } = useContext(AuthContext);
  const [showForm, setShowForm] = useState(false);
  const [viewingRequest, setViewingRequest] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const myRequests = requests.filter(r => r.employeeId === user?.id);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-content">
        <Topbar title="Employee Dashboard" subtitle={`Welcome back, ${user?.name || ''}`} />

        <div className="stats-container">
          <StatsCard title="Total Requests" value={myRequests.length} />
          <StatsCard title="Pending" value={myRequests.filter(r => isPending(r.status)).length} />
          <StatsCard title="Approved" value={myRequests.filter(r => isApproved(r.status)).length} />
          <StatsCard title="Rejected" value={myRequests.filter(r => isRejected(r.status)).length} />
        </div>

        <ActionsBar>
          <button className="btn primary" onClick={() => setShowForm(true)}>+ Apply for Leave</button>
        </ActionsBar>

        <DataTable
  title="Your Leave Requests"
  headers={['Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Attachment', '']}
  rows={myRequests.map(r => [
    r.type,
    r.from,
    r.to,
    r.days,
    r.reason,
    r.status,
    r.attachment?.name || 'None',
    <button className="btn secondary" onClick={() => setViewingRequest(r)}>Details</button>
  ])}
/>

        <LeaveBalances />

        {viewingRequest && (
          <Modal onClose={() => setViewingRequest(null)}>
            <h3>Request Details</h3>
            <RequestDetails request={viewingRequest} />
          </Modal>
        )}


        {showForm && (
  <Modal onClose={() => setShowForm(false)}>
    <LeaveForm
      role="Employee"
      onSubmit={() => {
        setShowForm(false);
        setToastMessage({ text: 'Leave request submitted successfully', type: 'success' });
      
      }}
      onClose={() => setShowForm(false)} // ✅ ensures modal closes on cancel
    />
  </Modal>
)}

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

export default EmployeeDashboard;
