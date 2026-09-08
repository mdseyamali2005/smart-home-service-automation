import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
        <div className="skeleton" style={{ width: 200, height: 24, borderRadius: "var(--r-sm)" }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    if (user.role === "admin") return children;
    return <Navigate to={user.role === "provider" ? "/provider" : "/"} replace />;
  }

  return children;
}
