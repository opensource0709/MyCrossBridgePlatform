// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Discovery from './pages/Discovery';
import Matches from './pages/Matches';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Diagnostic from './pages/Diagnostic';

import './App.css';

// 需要登入才能訪問的路由
function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">載入中...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
}

// 已登入則跳轉的路由
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">載入中...</div>;
  }

  return isAuthenticated ? <Navigate to="/discovery" /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* 公開頁面 */}
      <Route path="/" element={
        <PublicRoute><Landing /></PublicRoute>
      } />
      <Route path="/login" element={
        <PublicRoute><Login /></PublicRoute>
      } />
      <Route path="/register" element={
        <PublicRoute><Register /></PublicRoute>
      } />

      {/* 需登入頁面 */}
      <Route path="/discovery" element={
        <PrivateRoute><Discovery /></PrivateRoute>
      } />
      <Route path="/matches" element={
        <PrivateRoute><Matches /></PrivateRoute>
      } />
      <Route path="/chat/:matchId" element={
        <PrivateRoute><Chat /></PrivateRoute>
      } />
      <Route path="/profile" element={
        <PrivateRoute><Profile /></PrivateRoute>
      } />

      {/* 診斷頁面（公開，不需登入） */}
      <Route path="/diagnostic" element={<Diagnostic />} />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
