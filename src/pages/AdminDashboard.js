// src/pages/AdminDashboard.js
import React, { useContext, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/TopBar';
import StatsCard from '../components/StatsCard';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import ReviewModal from '../components/ReviewModal';
import { RequestsContext } from '../context/RequestsContext';
import { AuthContext } from '../context/AuthContext';
import { LEAVE_TYPES, getBalances, isApproved, isRejected } from '../services/leaveService';
import '../styles/Dashboard.css';

function AdminDashboard() {
  const { requests, updateRequestStatus } = useContext(RequestsContext);
  const { user } = useContext(AuthContext);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [employees, setEmployees] = useState([
    { id: 'EMP001', name: 'Alice', role: 'Manager' },
    { id: 'EMP002', name: 'Bob', role: 'HR' },
  ]);
  const [toastMessage, setToastMessage] = useState(null);

  // ✅ Add new employee
  const addEmployee = (employee) => {
    setEmployees(prev => [...prev, { ...employee, id: `EMP${Date.now()}` }]);
    setShowEmployeeForm(false);
    setToastMessage({ text: 'Employee added successfully', type: 'success' });
  };

  // ✅ Handle request actions
  const handleApprove = (comment) => {
    updateRequestStatus(selectedRequest.id, 'Approved (Final)', { by: `${user?.name} (Admin)`, comment });
    setToastMessage({ text: 'Request approved successfully', type: 'success' });
    setSelectedRequest(null);
  };

  const handleReject = (comment) => {
    updateRequestStatus(selectedRequest.id, 'Rejected (Final)', { by: `${user?.name} (Admin)`, comment });
    setToastMessage({ text: 'Request rejected successfully', type: 'danger' });
    setSelectedRequest(null);
  };

  // ✅ CSV Export
  const handleExportCSV = () => {
    const headers = [
      "Employee ID",
      "Employee Name",
      "Role",
      "Leave Type",
      "From",
      "To",
      "Days",
      "Reason",
      "Status",
      ...Object.keys(LEAVE_TYPES).map(type => `${type} Remaining`)
    ];
    const rows = requests.map(r => {
    const emp = employees.find(e => e.id === r.employeeId) || {
      id: r.employeeId || "N/A",
      name: r.employee || "Unknown",
      role: r.role || "Employee"
    };
    const year = Number(r.from?.slice(0, 4)) || new Date().getFullYear();
    const balances = getBalances(requests, r.employeeId, year);


      return [
        emp.id,
        emp.name,
        emp.role || '',
        r.type || '',
        r.from || '',
        r.to || '',
        r.days ?? 0,
        r.reason || '',
        r.status || '',
        ...balances.map(b => Math.max(b.remaining, 0))
      ];
    });

    // Quote every field so commas, quotes and line breaks in reasons don't break columns
    const escapeCSV = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const csvContent = [headers, ...rows].map(row => row.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `leave_report_all_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <StatsCard title="Total Employees" value={employees.length} />
          <StatsCard title="Leave Requests" value={requests.length} />
          <StatsCard title="Approved" value={acceptedRequests.length} />
          <StatsCard title="Rejected" value={rejectedRequests.length} />
        </div>

        {/* ✅ CSV Export Button */}
        <div className="actions-bar">
          <button className="btn secondary" onClick={handleExportCSV}>Download Report (CSV)</button>
        </div>

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
            <button className="btn primary" onClick={() => setSelectedRequest(r)}>Review</button>
          ])}
        />

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

        {/* ✅ Employee Management */}
        <DataTable
          title="Employees"
          headers={['ID', 'Name', 'Role']}
          rows={employees.map(e => [e.id, e.name, e.role])}
        />

        <button className="btn primary" onClick={() => setShowEmployeeForm(true)}>+ Add Employee</button>

        {showEmployeeForm && (
          <Modal onClose={() => setShowEmployeeForm(false)}>
            <h3>Add Employee</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.target;
              addEmployee({
                name: form.name.value,
                role: form.role.value,
              });
            }}>
              <label>Name <input name="name" required /></label>
              <label>Role
                <select name="role" required>
                  <option value="Employee">Employee</option>
                  <option value="Manager">Manager</option>
                  <option value="HR">HR</option>
                </select>
              </label>
              <button type="submit" className="btn primary">Save</button>
            </form>
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

export default AdminDashboard;
