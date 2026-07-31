import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <div className="text-sm">Loading…</div>
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}
