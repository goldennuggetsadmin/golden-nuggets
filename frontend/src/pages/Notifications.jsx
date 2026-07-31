import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Megaphone, Send, Clock, Trash2, X, CalendarClock, Loader2, Ban } from "lucide-react";
import { api, formatDateTime, formatApiErrorDetail } from "@/lib/api";

const STATUS_STYLE = {
  draft: "bg-muted text-muted-foreground ring-1 ring-border",
  scheduled: "bg-gold/15 text-gold ring-1 ring-gold/25",
  published: "bg-primary/15 text-primary ring-1 ring-primary/20",
  cancelled: "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
};

const inputCls =
  "h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring";

export default function Notifications() {
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("");
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", { filter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      return (await api.get(`/admin/notifications?${params}`)).data;
    },
  });

  const publishMut = useMutation({
    mutationFn: (id) => api.post(`/admin/notifications/${id}/publish`, {}),
    onSuccess: () => {
      toast.success("✓ Notification published successfully.");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => {
      const msg = formatApiErrorDetail(e);
      toast.error(`Unable to publish notification. Reason: ${msg}`);
    },
  });
  const cancelMut = useMutation({
    mutationFn: (id) => api.post(`/admin/notifications/${id}/cancel`),
    onSuccess: () => {
      toast.success("Notification cancelled");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/notifications/${id}`),
    onSuccess: () => {
      toast.success("Notification deleted");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const items = data?.items || [];

  return (
    <div data-testid="notifications-page" className="mx-auto max-w-[1300px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Reach</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule and send push notifications to the congregation. (Wire Firebase later — endpoint ready.)
          </p>
        </div>
        <button
          data-testid="new-notification-btn"
          onClick={() => setEditing({})}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> New Notification
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-2xl border hairline bg-card p-3">
        <span className="mr-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Status</span>
        {[
          { k: "", label: "All" },
          { k: "draft", label: "Draft" },
          { k: "scheduled", label: "Scheduled" },
          { k: "published", label: "Published" },
          { k: "cancelled", label: "Cancelled" },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              filter === f.k ? "bg-primary/15 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <div className="rounded-2xl border hairline bg-card p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            No notifications yet. Draft your first one.
          </div>
        )}
        {items.map((n) => (
          <div key={n.id} className="rounded-2xl border hairline bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Megaphone className="h-4 w-4" />
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] ${STATUS_STYLE[n.status] || STATUS_STYLE.draft}`}>
                {n.status}
              </span>
            </div>
            <div className="mt-4 font-serif text-lg text-foreground">{n.title}</div>
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{n.body}</p>
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              {n.audience === "language" && <div>Audience: {n.language || "—"} speakers</div>}
              {n.schedule_at && (
                <div className="flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> {formatDateTime(n.schedule_at)}
                </div>
              )}
              {n.delivered_at && (
                <div className="flex items-center gap-1 text-primary">
                  <Send className="h-3 w-3" /> Delivered {formatDateTime(n.delivered_at)}
                </div>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between border-t hairline pt-4">
              <button onClick={() => setEditing(n)} className="text-xs text-primary hover:underline">
                Edit
              </button>
              <div className="flex items-center gap-2">
                {n.status !== "published" && n.status !== "cancelled" && (
                  <button
                    onClick={() => publishMut.mutate(n.id)}
                    disabled={publishMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full border hairline bg-surface-2/40 px-2.5 py-1 text-[11px] text-foreground hover:bg-surface-2 disabled:opacity-50"
                  >
                    {publishMut.isPending && publishMut.variables === n.id ? (
                      <>Publishing...</>
                    ) : (
                      <><Send className="h-3 w-3" /> Publish</>
                    )}
                  </button>
                )}
                {n.status === "scheduled" && (
                  <button
                    onClick={() => cancelMut.mutate(n.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border hairline bg-surface-2/40 px-2.5 py-1 text-[11px] text-foreground hover:bg-surface-2"
                  >
                    <Ban className="h-3 w-3" /> Cancel
                  </button>
                )}
                <button
                  onClick={() => window.confirm("Delete notification?") && delMut.mutate(n.id)}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <NotificationModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["notifications"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function NotificationModal({ initial, onClose, onSaved }) {
  const isEdit = Boolean(initial.id);
  const [form, setForm] = useState({
    id: initial.id,
    title: initial.title || "",
    body: initial.body || "",
    deep_link: initial.deep_link || "",
    audience: initial.audience || "all",
    language: initial.language || "",
    schedule_at: initial.schedule_at || "",
    status: initial.status || "draft",
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        body: form.body,
        deep_link: form.deep_link,
        audience: form.audience,
        language: form.audience === "language" ? form.language : null,
        schedule_at: form.schedule_at || null,
      };
      if (isEdit) return (await api.patch(`/admin/notifications/${form.id}`, payload)).data;
      return (await api.post(`/admin/notifications`, payload)).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Notification updated" : "Notification created");
      onSaved();
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Save failed"),
  });

  const scheduleMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/notifications/${form.id}/schedule`)).data,
    onSuccess: () => {
      toast.success("Notification scheduled");
      onSaved();
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Schedule failed"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-4 backdrop-blur">
      <div className="w-full max-w-2xl rounded-2xl border hairline bg-card p-6 shadow-glow">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-foreground">{isEdit ? "Edit notification" : "New notification"}</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Title</div>
            <input data-testid="notif-title-input" className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Sunday service at 10 AM" />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Body</div>
            <textarea
              data-testid="notif-body-input"
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="w-full rounded-lg border hairline bg-background/40 px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Join us as we open the word of God together."
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Deep link (optional)</div>
            <input className={inputCls} value={form.deep_link} onChange={(e) => setForm({ ...form, deep_link: e.target.value })} placeholder="goldennuggets://sermons/…" />
          </label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <div className="mb-1.5 text-[13px] text-foreground">Audience</div>
              <select className={inputCls} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                <option value="all">All users</option>
                <option value="language">By language</option>
              </select>
            </label>
            {form.audience === "language" && (
              <label className="block">
                <div className="mb-1.5 text-[13px] text-foreground">Language</div>
                <select className={inputCls} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="">Select</option>
                  <option>English</option>
                  <option>Telugu</option>
                  <option>Hindi</option>
                  <option>Tamil</option>
                </select>
              </label>
            )}
            <label className="block md:col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] text-foreground">Schedule at</span>
                <span className="text-[11px] text-muted-foreground">Leave empty to send immediately when publishing</span>
              </div>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.schedule_at}
                onChange={(e) => setForm({ ...form, schedule_at: e.target.value })}
              />
            </label>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="rounded-full border hairline bg-surface-2/40 px-4 py-2 text-sm text-foreground hover:bg-surface-2">
            Cancel
          </button>
          <button
            data-testid="save-notif-btn"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.title.trim() || !form.body.trim()}
            className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-4 py-2 text-sm text-foreground hover:bg-surface-2 disabled:opacity-70"
          >
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Clock className="h-4 w-4" /> Save Draft
          </button>
          {isEdit && form.schedule_at && (
            <button
              onClick={() => scheduleMut.mutate()}
              disabled={scheduleMut.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-70"
            >
              <CalendarClock className="h-4 w-4" /> Schedule
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
