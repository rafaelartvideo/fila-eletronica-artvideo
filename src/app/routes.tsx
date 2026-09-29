import { Route, Routes } from 'react-router';
import { HomePage } from './HomePage';
import { DisplayPage } from '../features/display/DisplayPage';
import { KioskPage } from '../features/kiosk/KioskPage';
import { TrackingPage } from '../features/tracking/TrackingPage';
import { StaffPage } from '../features/staff/StaffPage';
import { RequireAdmin, RequirePermission } from '../features/auth/RequireAdmin';
import { SignInPage } from '../features/auth/SignInPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/painel/login" element={<SignInPage />} />
      <Route path="/painel" element={<RequireAdmin><StaffPage /></RequireAdmin>} />
      <Route path="/totem" element={<RequireAdmin><RequirePermission permission="queue.issue"><KioskPage /></RequirePermission></RequireAdmin>} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="/acompanhar/:token" element={<TrackingPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
