import { Navigate, Route, Routes } from 'react-router';
import { HomePage } from './HomePage';
import { DisplayPage } from '../features/display/DisplayPage';
import { TrackingPage } from '../features/tracking/TrackingPage';
import { StaffPage } from '../features/staff/StaffPage';
import { RequireAdmin } from '../features/auth/RequireAdmin';
import { SignInPage } from '../features/auth/SignInPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/painel/login" element={<SignInPage />} />
      <Route path="/painel" element={<RequireAdmin><StaffPage /></RequireAdmin>} />
      <Route path="/totem" element={<Navigate to="/painel" replace />} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="/acompanhar/:token" element={<TrackingPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
