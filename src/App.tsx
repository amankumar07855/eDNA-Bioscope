/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { RequireAdmin, RequireUser } from './components/ProtectedRoute';

import LandingPage from './pages/LandingPage';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import DemoPage from './pages/DemoPage';

import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import UploadAndPreprocessPage from './pages/UploadAndPreprocessPage';
import AnalysisPage from './pages/AnalysisPage';
import SpeciesExplorerPage from './pages/SpeciesExplorerPage';
import BiodiversityMapPage from './pages/BiodiversityMapPage';
import AssistantPage from './pages/AssistantPage';
import ReportsPage from './pages/ReportsPage';
import ProfilePage from './pages/ProfilePage';

import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminControlCenterPage from './pages/admin/AdminControlCenterPage';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/demo" element={<DemoPage />} />

            {/* Protected Researcher Workspace Routes */}
            <Route path="/dashboard" element={<RequireUser><DashboardPage /></RequireUser>} />
            <Route path="/projects" element={<RequireUser><ProjectsPage /></RequireUser>} />
            <Route path="/upload" element={<RequireUser><UploadAndPreprocessPage /></RequireUser>} />
            <Route path="/analysis" element={<RequireUser><AnalysisPage /></RequireUser>} />
            <Route path="/species" element={<RequireUser><SpeciesExplorerPage /></RequireUser>} />
            <Route path="/map" element={<RequireUser><BiodiversityMapPage /></RequireUser>} />
            <Route path="/assistant" element={<RequireUser><AssistantPage /></RequireUser>} />
            <Route path="/reports" element={<RequireUser><ReportsPage /></RequireUser>} />
            <Route path="/profile" element={<RequireUser><ProfilePage /></RequireUser>} />

            {/* Hidden Server-Verified Administrator Environment */}
            <Route path="/control-center/login" element={<AdminLoginPage />} />
            <Route path="/control-center" element={<RequireAdmin><AdminControlCenterPage /></RequireAdmin>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
