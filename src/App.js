import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "@/components/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import SermonsList from "@/pages/SermonsList";
import SermonForm from "@/pages/SermonForm";
import ImportCenter from "@/pages/ImportCenter";
import BulkImportWizard from "@/pages/BulkImportWizard";
import Meetings from "@/pages/Meetings";
import Categories from "@/pages/Categories";
import MediaManager from "@/pages/MediaManager";
import ActivityLog from "@/pages/ActivityLog";
import Notifications from "@/pages/Notifications";
import HomeManagement from "@/pages/HomeManagement";
import SeriesPage from "@/pages/Series";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <div className="App dark">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="sermons" element={<SermonsList />} />
              <Route path="sermons/new" element={<SermonForm />} />
              <Route path="sermons/:id/edit" element={<SermonForm />} />
              <Route path="import" element={<ImportCenter />} />
              <Route path="import/bulk" element={<BulkImportWizard />} />
              <Route path="meetings" element={<Meetings />} />
              <Route path="categories" element={<Categories />} />
              <Route path="series" element={<SeriesPage />} />
              <Route path="media" element={<MediaManager />} />
              <Route path="home-screen" element={<HomeManagement />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="activity" element={<ActivityLog />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
