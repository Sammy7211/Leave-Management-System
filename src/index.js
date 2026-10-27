import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { RequestsProvider } from './context/RequestsContext';
import { PolicyProvider } from './context/PolicyContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <PolicyProvider>
        <RequestsProvider>
          <App />
        </RequestsProvider>
      </PolicyProvider>
    </AuthProvider>
  </React.StrictMode>
);
