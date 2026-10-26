import { Navigate, Route, Routes } from 'react-router-dom';
import AiConfig from './pages/AiConfig';
import AuditLog from './pages/AuditLog';
import Cameras from './pages/Cameras';
import IncidentTypes from './pages/IncidentTypes';
import Routing from './pages/Routing';
import SetupHealth from './pages/SetupHealth';
import StoreLayout from './pages/StoreLayout';
import SystemHealth from './pages/SystemHealth';
import UsersRoles from './pages/UsersRoles';
import OperatorCameraLive from './pages/operator/OperatorCameraLive';
import OperatorFloorMap from './pages/operator/OperatorFloorMap';
import OperatorTasks, { OperatorTaskDetail } from './pages/operator/OperatorTasks';
import Login from './pages/auth/Login';
import { ForgotPassword, PasswordUpdated, ResetLinkExpired, ResetLinkSent, SetNewPassword } from './pages/auth/Recovery';
import { ProtectedRoute } from './auth/ProtectedRoute';
import RoleWorkspace, { RoleRedirect } from './pages/RoleWorkspace';
import Leave from './pages/manager/Leave';
import Schedule from './pages/manager/Schedule';
import ShiftTemplates from './pages/manager/ShiftTemplates';
import { SwapRequestDetail, SwapRequests } from './pages/manager/SwapRequests';
import ZoneStaffing from './pages/manager/ZoneStaffing';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/forgot-password/sent" element={<ResetLinkSent />} />
      <Route path="/reset-password" element={<SetNewPassword />} />
      <Route path="/reset-password/done" element={<PasswordUpdated />} />
      <Route path="/reset-password/expired" element={<ResetLinkExpired />} />

      <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
        <Route path="/admin/dashboard" element={<SetupHealth />} />
        <Route path="/admin/setup" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/store-layout" element={<StoreLayout />} />
        <Route path="/admin/cameras" element={<Cameras />} />
        <Route path="/admin/ai-config" element={<AiConfig />} />
        <Route path="/admin/incident-types" element={<IncidentTypes />} />
        <Route path="/admin/routing" element={<Routing />} />
        <Route path="/admin/users" element={<UsersRoles />} />
        <Route path="/admin/audit-logs" element={<AuditLog />} />
        <Route path="/admin/system-health" element={<SystemHealth />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'OPERATOR']} />}>
        <Route path="/operator/dashboard" element={<Navigate to="/operator/floor-map" replace />} />
        <Route path="/operator/floor-map" element={<OperatorFloorMap />} />
        <Route path="/operator/tasks" element={<OperatorTasks />} />
        <Route path="/operator/tasks/:taskId" element={<OperatorTaskDetail />} />
        <Route path="/operator/cameras/:cameraId" element={<OperatorCameraLive />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['MANAGER']} />}>
        <Route path="/manager/dashboard" element={<Navigate to="/manager/schedule" replace />} />
        <Route path="/manager/schedule" element={<Schedule />} />
        <Route path="/manager/staffing" element={<ZoneStaffing />} />
        <Route path="/manager/swaps" element={<SwapRequests />} />
        <Route path="/manager/swaps/:swapRequestId" element={<SwapRequestDetail />} />
        <Route path="/manager/leave" element={<Leave />} />
        <Route path="/manager/shifts" element={<ShiftTemplates />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['STAFF']} />}>
        <Route path="/staff/dashboard" element={<RoleWorkspace />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/access-denied" element={<RoleWorkspace denied />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
