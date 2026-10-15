// src/components/Sidebar.js
import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Sidebar.css';
import logo from '../assets/kilimologo.png';

// Each role only gets a link to its own dashboard
const DASHBOARD_LINKS = {
  employee: { to: '/employee', label: 'My Dashboard', role: 'Employee' },
  manager: { to: '/manager', label: 'Manager Dashboard', role: 'Manager' },
  hr: { to: '/hr', label: 'HR Dashboard', role: 'HR' },
  admin: { to: '/admin', label: 'Admin Dashboard', role: 'Admin' },
};

function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const link = DASHBOARD_LINKS[user?.role];

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      await logout();
      sessionStorage.clear();
      navigate("/login");
    }
  };

  return (
    <aside className="sidebar">
      <div className="logo-container">
        <img src={logo} alt="Company Logo" className="logo-img" />
        <h2 className="logo-text">LeaveSys™</h2>
      </div>
      {user && (
        <div className="sidebar-user">
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role">{link?.role}</div>
        </div>
      )}
      <nav>
        <ul>
          {link && <li><NavLink to={link.to}>{link.label}</NavLink></li>}
          <li>
            <button type="button" className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

export default Sidebar;
