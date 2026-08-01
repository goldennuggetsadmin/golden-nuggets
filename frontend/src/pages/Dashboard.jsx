import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock, HardDrive, DownloadCloud,
  Plus, Play, ArrowUpRight, Calendar, Library,
} from "lucide-react";
import { api, formatBytes } from "@/lib/api";

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => (await api.get("/admin/dashboard/stats")).data,
  });
  const { data: recent } = useQuery({
    queryKey: ["dashboard-recent"],
    queryFn: async () => (await api.get("/admin/dashboard/recent-sermons?limit=5")).data,
  });
  const { data: upcoming } = useQuery({
    queryKey: ["dashboard-upcoming"],
    queryFn: async () => (await api.get("/admin/dashboard/upcoming-meetings?limit=4")).data,
  });

  const s = stats || {};
  const num = (v) => (v === undefined || v === null ? "—" : v);
  const statCards = [
    { label: "Total Sermons", value: num(s.total_sermons), hint: `${s.published_sermons ?? 0} published`, icon: Library, tone: "primary" },
    { label: "Total Meetings", value: num(s.total_meetings), hint: `${s.upcoming_meetings ?? 0} upcoming`, icon: CalendarClock, tone: "gold" },
    { label: "Storage Usage", value: formatBytes(s.storage_bytes || 0), hint: "Supabase object storage", icon: HardDrive, tone: "primary" },
  ];

  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div data-testid="dashboard-page" className="mx-auto max-w-[1400px] space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{date}</p>
          <h1 className="mt-2 font-serif text-4xl leading-tight text-foreground">
            Welcome to <span className="text-gold">Golden Nuggets</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Manage sermons, meetings, and media from one calm control center.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            data-testid="dashboard-import-btn"
            to="/import"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-95"
          >
            <DownloadCloud className="h-4 w-4" /> Import Sermon
          </Link>
          <Link
            data-testid="dashboard-create-sermon-btn"
            to="/sermons/new"
            className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/50 px-5 py-2.5 text-sm text-foreground hover:bg-surface-2"
          >
            <Plus className="h-4 w-4" /> Create Sermon
          </Link>
          <Link
            to="/meetings"
            className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/50 px-5 py-2.5 text-sm text-foreground hover:bg-surface-2"
          >
            <Calendar className="h-4 w-4" /> Add Meeting
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((sc) => {
          const Icon = sc.icon;
          return (
            <div
              key={sc.label}
              data-testid={`stat-${sc.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="group relative overflow-hidden rounded-2xl border hairline bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/30"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`grid h-9 w-9 place-items-center rounded-lg ${
                    sc.tone === "primary" ? "bg-primary/10 text-primary" : "bg-gold/10 text-gold"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition group-hover:text-foreground" />
              </div>
              <div className="mt-5 font-serif text-3xl leading-none text-foreground">{sc.value}</div>
              <div className="mt-2 text-[13px] text-muted-foreground">{sc.label}</div>
              <div className="mt-1 text-[11px] text-primary/90">{sc.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border hairline bg-card">
          <div className="flex items-center justify-between px-6 pt-6">
            <div>
              <h3 className="font-serif text-lg text-foreground">Recently Added</h3>
              <p className="text-xs text-muted-foreground">The last few sermons</p>
            </div>
            <Link to="/sermons" className="text-xs text-primary hover:underline">Open Library</Link>
          </div>
          <ul className="mt-4 divide-y hairline">
            {(recent?.items || []).length === 0 && (
              <li className="px-6 py-8 text-sm text-muted-foreground">No sermons yet. Import one from a URL or create manually.</li>
            )}
            {(recent?.items || []).map((t) => (
              <li key={t.id} className="group flex items-center gap-4 px-6 py-4 transition hover:bg-surface-2/40">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/25 to-gold/20">
                  <Play className="h-4 w-4 text-foreground/80" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{t.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[t.speaker, t.series, t.language].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="hidden text-xs text-muted-foreground sm:block">
                  {t.status}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border hairline bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg text-foreground">Upcoming Meetings</h3>
              <Link to="/meetings" className="text-xs text-primary hover:underline">Manage</Link>
            </div>
            <ul className="mt-4 space-y-4">
              {(upcoming?.items || []).length === 0 && (
                <li className="text-sm text-muted-foreground">No upcoming meetings.</li>
              )}
              {(upcoming?.items || []).map((m) => (
                <li key={m.id} className="flex items-start gap-3">
                  <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">{m.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {[m.start_date, m.time, m.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                    m.status === "upcoming" || m.status === "live"
                      ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                      : "bg-muted text-muted-foreground ring-1 ring-border"
                  }`}>{m.status}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border hairline bg-card p-6">
            <h3 className="font-serif text-lg text-foreground">Quick Actions</h3>
            <div className="mt-4 grid gap-2">
              <Link to="/import" className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-4 py-3 text-sm text-foreground transition hover:bg-surface-2">
                <DownloadCloud className="h-4 w-4 text-primary" /> Import from a URL
              </Link>
              <Link to="/sermons/new" className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-4 py-3 text-sm text-foreground transition hover:bg-surface-2">
                <Plus className="h-4 w-4 text-primary" /> Create a sermon manually
              </Link>
              <Link to="/sermons?status=draft" className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-4 py-3 text-sm text-foreground transition hover:bg-surface-2">
                <Library className="h-4 w-4 text-primary" /> Review draft sermons
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
