import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search, User, Clock } from "lucide-react";
import { api, formatDateTime } from "@/lib/api";

const ACTION_STYLE = {
  login: "bg-primary/15 text-primary ring-1 ring-primary/20",
  logout: "bg-muted text-muted-foreground ring-1 ring-border",
  sermon_created: "bg-primary/15 text-primary ring-1 ring-primary/20",
  sermon_updated: "bg-gold/15 text-gold ring-1 ring-gold/25",
  sermon_deleted: "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
  sermon_published: "bg-primary/15 text-primary ring-1 ring-primary/20",
  sermon_imported: "bg-primary/15 text-primary ring-1 ring-primary/20",
  meeting_created: "bg-primary/15 text-primary ring-1 ring-primary/20",
  media_uploaded: "bg-gold/15 text-gold ring-1 ring-gold/25",
  media_deleted: "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
  settings_updated: "bg-muted text-muted-foreground ring-1 ring-border",
  home_updated: "bg-primary/15 text-primary ring-1 ring-primary/20",
  login_failed: "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
};

export default function ActivityLog() {
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const { data, isLoading } = useQuery({
    queryKey: ["activity", { q, entity, status, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (entity) params.set("entity_type", entity);
      if (status) params.set("status", status);
      params.set("page", page);
      params.set("page_size", pageSize);
      return (await api.get(`/admin/activity?${params}`)).data;
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div data-testid="activity-page" className="mx-auto max-w-[1300px] space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Audit trail</p>
        <h1 className="mt-2 font-serif text-3xl text-foreground">Activity Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every admin action is recorded here — searchable and filterable.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border hairline bg-card p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="activity-search-input"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setQ(e.currentTarget.value);
                setPage(1);
              }
            }}
            placeholder="Search by admin, action or message"
            className="h-10 w-full rounded-lg border hairline bg-background/40 pl-10 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-lg border hairline bg-background/40 px-3 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Entities</option>
          <option value="sermon">Sermon</option>
          <option value="meeting">Meeting</option>
          <option value="category">Category</option>
          <option value="media">Media</option>
          <option value="user">User</option>
          <option value="import">Import</option>
          <option value="settings">Settings</option>
          <option value="notification">Notification</option>
          <option value="home">Home</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-lg border hairline bg-background/40 px-3 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Statuses</option>
          <option value="ok">OK</option>
          <option value="fail">Failed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border hairline bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b hairline text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-3 pl-5 font-normal">Timestamp</th>
                <th className="py-3 font-normal">Admin</th>
                <th className="py-3 font-normal">Action</th>
                <th className="py-3 font-normal">Entity</th>
                <th className="py-3 font-normal">Message</th>
                <th className="py-3 font-normal">IP</th>
                <th className="py-3 pr-5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    No matching activity.
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-b hairline last:border-b-0 hover:bg-surface-2/40">
                  <td className="py-3.5 pl-5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDateTime(row.created_at)}
                    </div>
                  </td>
                  <td className="py-3.5">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground">{row.actor_email || "—"}</span>
                    </div>
                  </td>
                  <td className="py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] ${
                        ACTION_STYLE[row.action] || "bg-surface-2/60 text-muted-foreground ring-1 ring-border"
                      }`}
                    >
                      {row.action}
                    </span>
                  </td>
                  <td className="py-3.5 text-muted-foreground">{row.entity_type || "—"}</td>
                  <td className="py-3.5 max-w-[360px] truncate text-foreground/90">{row.message || "—"}</td>
                  <td className="py-3.5 text-muted-foreground">{row.ip || "—"}</td>
                  <td className="py-3.5 pr-5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        row.status === "fail"
                          ? "bg-destructive/15 text-destructive ring-1 ring-destructive/25"
                          : "bg-primary/10 text-primary ring-1 ring-primary/20"
                      }`}
                    >
                      {row.status || "ok"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t hairline px-5 py-3 text-xs text-muted-foreground">
          <span>
            Showing {items.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + items.length} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-md px-3 py-1 hover:bg-surface-2">
              Prev
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} className="rounded-md px-3 py-1 hover:bg-surface-2">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
