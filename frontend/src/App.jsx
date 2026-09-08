import { Routes, Route, Navigate } from "react-router-dom";
import Nav from "./components/Nav";
import ProtectedRoute from "./components/ProtectedRoute";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import SignupCustomer from "./pages/SignupCustomer";
import SignupProvider from "./pages/SignupProvider";
import CategoryGrid from "./pages/CategoryGrid";
import RequestForm from "./pages/RequestForm";
import TrackRequest from "./pages/TrackRequest";
import MyRequests from "./pages/MyRequests";
import Notifications from "./pages/Notifications";
import ProviderDashboard from "./pages/ProviderDashboard";
import ProviderJobs from "./pages/ProviderJobs";
import ProviderAvailability from "./pages/ProviderAvailability";
import ProviderProfile from "./pages/ProviderProfile";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignupCustomer />} />
          <Route path="/signup/provider" element={<SignupProvider />} />
          <Route path="/services" element={<CategoryGrid />} />

          {/* Customer-only */}
          <Route
            path="/book"
            element={
              <ProtectedRoute role="customer">
                <RequestForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/track/:id"
            element={
              <ProtectedRoute role="customer">
                <TrackRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-requests"
            element={
              <ProtectedRoute role="customer">
                <MyRequests />
              </ProtectedRoute>
            }
          />
          {/* Authenticated user notifications */}
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />

          {/* Provider-only */}
          <Route
            path="/provider"
            element={
              <ProtectedRoute role="provider">
                <ProviderDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provider/jobs"
            element={
              <ProtectedRoute role="provider">
                <ProviderJobs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provider/availability"
            element={
              <ProtectedRoute role="provider">
                <ProviderAvailability />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provider/profile"
            element={
              <ProtectedRoute role="provider">
                <ProviderProfile />
              </ProtectedRoute>
            }
          />

          {/* Admin-only */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
