import { Navigate, Route, Routes } from 'react-router-dom';
import AiConfig from './pages/AiConfig';
import AuditLog from './pages/AuditLog';
import Cameras from './pages/Cameras';
import IncidentTypes from './pages/IncidentTypes';
import SetupHealth from './pages/SetupHealth';
import StoreLayout from './pages/StoreLayout';
import SystemHealth from './pages/SystemHealth';
import UsersRoles from './pages/UsersRoles';
import ResponsePolicies from './pages/admin/ResponsePolicies';
import SlaPolicies from './pages/admin/SlaPolicies';
import OperatorCameraLive from './pages/operator/OperatorCameraLive';
import OperatorFloorMap from './pages/operator/OperatorFloorMap';
import OperatorTasks, { OperatorTaskDetail } from './pages/operator/OperatorTasks';
import OperatorIncidents from './pages/operator/OperatorIncidents';
import Login from './pages/auth/Login';
import { ForgotPassword, PasswordUpdated, ResetLinkExpired, ResetLinkSent, SetNewPassword } from './pages/auth/Recovery';
import { ProtectedRoute } from './auth/ProtectedRoute';
import RoleWorkspace, { RoleRedirect } from './pages/RoleWorkspace';
import Leave from './pages/manager/Leave';
import Schedule from './pages/manager/Schedule';
import WorkShifts from './pages/manager/WorkShifts';
import { SwapRequestDetail, SwapRequests } from './pages/manager/SwapRequests';
import ZoneStaffing from './pages/manager/ZoneStaffing';
import Analytics from './pages/manager/Analytics';
import OperationalEvents, { OperationalEventDetail } from './pages/operator/OperationalEvents';
import GlobalSettings from './pages/GlobalSettings';
import { ManagerNotifications, OperatorNotifications } from './pages/NotificationInbox';
import { RecommendationDetail, Recommendations } from './pages/Recommendations';

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
        <Route path="/admin/routing" element={<Navigate to="/admin/ai-config" replace />} />
        <Route path="/admin/response-policies/:ruleId" element={<ResponsePolicies />} />
        <Route path="/admin/sla-policies" element={<SlaPolicies />} />
        <Route path="/admin/users" element={<UsersRoles />} />
        <Route path="/admin/audit-logs" element={<AuditLog />} />
        <Route path="/admin/system-health" element={<SystemHealth />} />
        <Route path="/admin/settings" element={<GlobalSettings />} />
        <Route path="/admin/live-floor-map" element={<OperatorFloorMap workspace="admin" />} />
        <Route path="/admin/live-cameras/:cameraId" element={<OperatorCameraLive workspace="admin" />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['OPERATOR']} />}>
        <Route path="/operator/dashboard" element={<Navigate to="/operator/floor-map" replace />} />
        <Route path="/operator/floor-map" element={<OperatorFloorMap />} />
        <Route path="/operator/tasks" element={<OperatorTasks />} />
        <Route path="/operator/events" element={<OperationalEvents />} />
        <Route path="/operator/incidents" element={<OperatorIncidents />} />
        <Route path="/operator/events/:eventId" element={<OperationalEventDetail />} />
        <Route path="/operator/tasks/:taskId" element={<OperatorTaskDetail />} />
        <Route path="/operator/cameras/:cameraId" element={<OperatorCameraLive />} />
        <Route path="/operator/notifications" element={<OperatorNotifications />} />
        <Route path="/operator/recommendations" element={<Recommendations workspace="operator" />} />
        <Route path="/operator/recommendations/:id" element={<RecommendationDetail workspace="operator" />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['MANAGER']} />}>
        <Route path="/manager/dashboard" element={<Navigate to="/manager/analytics" replace />} />
        <Route path="/manager/analytics" element={<Analytics />} />
        <Route path="/manager/events" element={<OperationalEvents workspace="manager" />} />
        <Route path="/manager/events/:eventId" element={<OperationalEventDetail workspace="manager" />} />
        <Route path="/manager/schedule" element={<Schedule />} />
        <Route path="/manager/floor-map" element={<OperatorFloorMap workspace="manager" />} />
        <Route path="/manager/staffing" element={<ZoneStaffing />} />
        <Route path="/manager/swaps" element={<SwapRequests />} />
        <Route path="/manager/swaps/:swapRequestId" element={<SwapRequestDetail />} />
        <Route path="/manager/leave" element={<Leave />} />
        <Route path="/manager/shifts" element={<WorkShifts />} />
        <Route path="/manager/notifications" element={<ManagerNotifications />} />
        <Route path="/manager/recommendations" element={<Recommendations workspace="manager" />} />
        <Route path="/manager/recommendations/:id" element={<RecommendationDetail workspace="manager" />} />
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
