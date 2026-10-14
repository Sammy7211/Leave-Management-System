import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { RequestsProvider } from './context/RequestsContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <RequestsProvider>
        <App />
      </RequestsProvider>
    </AuthProvider>
  </React.StrictMode>
);
