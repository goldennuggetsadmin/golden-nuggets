import { Link, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Library, Calendar, DownloadCloud, Settings,
  LogOut, ChevronsLeft,
  Megaphone, Layers,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/sermons", label: "Sermon Library", icon: Library },
  { to: "/meetings", label: "Meetings", icon: Calendar },
  { to: "/import", label: "Import Center", icon: DownloadCloud },
  { to: "/series", label: "Series", icon: Layers },
  { to: "/notifications", label: "Notifications", icon: Megaphone },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [theme] = useState("dark");
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  const initials = (user?.name || user?.email || "GN")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside
        data-testid="admin-sidebar"
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-r hairline bg-sidebar transition-[width] duration-300 ease-out ${
          collapsed ? "w-[76px]" : "w-[264px]"
        }`}
      >
        <div className="flex items-center gap-3 px-5 pt-6 pb-8">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
            <span className="font-serif text-lg text-primary">G</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-serif text-[17px] leading-none text-foreground">Golden Nuggets</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Content Control
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                key={item.to}
                to={item.to}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-primary" : ""}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t hairline px-3 py-3">
          <button
            data-testid="sidebar-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <ChevronsLeft className={`h-[18px] w-[18px] transition-transform ${collapsed ? "rotate-180" : ""}`} />
            {!collapsed && <span>Collapse</span>}
          </button>

          <div className={`flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-2.5 ${collapsed ? "justify-center" : ""}`}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-gold/30 font-serif text-sm text-foreground">
              {initials || "GN"}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground">{user?.name || "Admin"}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.role || "admin"}</div>
              </div>
            )}
            {!collapsed && (
              <button data-testid="sidebar-logout-btn" onClick={logout} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Logout">
                <LogOut className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
