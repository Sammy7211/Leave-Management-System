// src/pages/Dashboard.js
import React from 'react';
import Sidebar from '../components/Sidebar';

import '../styles/Dashboard.css';

function Dashboard() {
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main-content">
        
        <section className="content">
          <h1> Leave Management System</h1>
          <p>Select a role from the sidebar to manage leave requests, approvals, and reports.</p>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;   // ✅ must be here
