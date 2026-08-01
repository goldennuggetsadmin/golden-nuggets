import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Calendar, MapPin, Youtube, Bell, Search, MoreHorizontal, Radio,
  CheckCircle2, Clock, FileEdit, Send, ImagePlus, X, ArrowLeft, Loader2, Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { MEDIA_FILE_URL } from "@/lib/api";

const STATUS_STYLE = {
  live: "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
  upcoming: "bg-primary/15 text-primary ring-1 ring-primary/20",
  draft: "bg-muted text-muted-foreground ring-1 ring-border",
  completed: "bg-gold/15 text-gold ring-1 ring-gold/25",
};

const STATUS_ICON = {
  live: Radio,
  upcoming: Clock,
  draft: FileEdit,
  completed: CheckCircle2,
};

const inputCls =
  "h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring";

export default function Meetings() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["meetings", { filter, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (filter !== "all") params.set("status", filter);
      return (await api.get(`/admin/meetings?${params}`)).data;
    },
  });

  if (creating || editing) {
    return (
      <MeetingForm
        meeting={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  const items = data?.items || [];

  return (
    <div data-testid="meetings-page" className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Congregation</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Announce services and events. Published meetings appear on the mobile home screen.
          </p>
        </div>
        <button
          data-testid="add-meeting-btn"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> Add Meeting
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border hairline bg-card p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings by title, speaker, or location"
            className="h-10 w-full rounded-lg border hairline bg-background/40 pl-10 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border hairline bg-background/40 p-1">
          {["all", "upcoming", "live", "draft", "completed"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs transition ${
                filter === f ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <div className="rounded-2xl border hairline bg-card p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            No meetings yet. Click <span className="text-foreground">Add Meeting</span> to schedule one.
          </div>
        )}
        {items.map((m) => {
          const Icon = STATUS_ICON[m.status] || Clock;
          return (
            <div
              key={m.id}
              data-testid={`meeting-card-${m.id}`}
              className="group rounded-2xl border hairline bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/25 to-gold/20 text-foreground">
                  {m.banner_url ? (
                    <img src={m.banner_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Calendar className="h-4 w-4" />
                  )}
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${STATUS_STYLE[m.status] || STATUS_STYLE.draft}`}>
                  <Icon className="h-3 w-3" /> {m.status}
                </span>
              </div>
              <div className="mt-4 font-serif text-lg text-foreground">{m.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.speaker}</div>

              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {(m.start_date || m.time) && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" /> {[m.start_date, m.time].filter(Boolean).join(" · ")}
                  </div>
                )}
                {m.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> {m.location}
                  </div>
                )}
                {m.youtube_url && (
                  <div className="flex items-center gap-2 text-primary">
                    <Youtube className="h-3.5 w-3.5" /> Live on YouTube
                  </div>
                )}
                {m.notify_users && (
                  <div className="flex items-center gap-2 text-gold">
                    <Bell className="h-3.5 w-3.5" /> Notifies all users on publish
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t hairline pt-4">
                <button onClick={() => setEditing(m)} className="text-xs text-primary hover:underline">Edit</button>
                <button className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeetingForm({ meeting, onClose }) {
  const isEdit = Boolean(meeting?.id);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    speaker: "",
    description: "",
    start_date: "",
    end_date: "",
    time: "",
    location: "",
    google_maps_url: "",
    youtube_url: "",
    registration_link: "",
    banner_url: "",
    banner_storage_path: "",
    featured: false,
    notify_users: false,
    status: "draft",
    ...(meeting || {}),
  });

  const saveMut = useMutation({
    mutationFn: async (payload) => {
      if (isEdit) return (await api.patch(`/admin/meetings/${meeting.id}`, payload)).data;
      return (await api.post(`/admin/meetings`, payload)).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "✓ Meeting updated successfully." : "✓ Meeting created successfully.");
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Unable to save meeting."),
  });

  const delMut = useMutation({
    mutationFn: () => api.delete(`/admin/meetings/${meeting.id}`),
    onSuccess: () => {
      toast.success("Meeting deleted");
      qc.invalidateQueries({ queryKey: ["meetings"] });
      onClose();
    },
  });

  const submit = (status) => (e) => {
    e.preventDefault();
    if (validationErrors.length > 0) return toast.error("Please fix the errors before saving.");
    saveMut.mutate({ ...form, status });
  };

  const validationErrors = [];
  if (!form.title.trim()) validationErrors.push("Title is required.");
  if (!form.start_date) validationErrors.push("Start date is required.");
  if (form.start_date && form.end_date && form.end_date < form.start_date) {
    validationErrors.push("End date cannot be earlier than the start date.");
  }
  
  const isPastUpcoming = form.start_date && new Date(form.start_date) < new Date(new Date().setHours(0,0,0,0));
  const warnings = [];
  if (isPastUpcoming) {
    warnings.push("⚠ This meeting is scheduled in the past but you are about to publish it as Upcoming.");
  }

  const uploadBanner = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(`/admin/media/upload?kind=banner`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({
        ...f,
        banner_storage_path: data.storage_path,
        banner_url: MEDIA_FILE_URL(data.id),
      }));
      toast.success("Banner uploaded");
    } catch {
      toast.error("Upload failed");
    }
  };

  return (
    <div className="mx-auto max-w-[1000px] space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border hairline bg-surface-2/40 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Meetings · {isEdit ? "Edit" : "New"}</p>
            <h1 className="mt-1 font-serif text-3xl text-foreground">{isEdit ? form.title || "Edit Meeting" : "Add a Meeting"}</h1>
          </div>
        </div>
        {isEdit && (
          <button
            onClick={() => window.confirm("Delete meeting?") && delMut.mutate()}
            className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>

      <form className="rounded-2xl border hairline bg-card p-6 lg:p-8" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Meeting title">
            <input data-testid="meeting-title-input" className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Healing Service" />
          </Field>
          <Field label="Speaker">
            <input className={inputCls} value={form.speaker} onChange={(e) => setForm({ ...form, speaker: e.target.value })} placeholder="Pastor Anand" />
          </Field>
          <Field label="Start date" error={!form.start_date && "Required"}>
            <input type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
          <Field label="End date" hint="Optional">
            <input type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </Field>
          <Field label="Time">
            <input type="time" className={inputCls} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
          <Field label="Location">
            <input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Main Sanctuary" />
          </Field>
          <Field label="Google Maps link" hint="Optional">
            <input className={inputCls} value={form.google_maps_url} onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })} placeholder="https://maps.google.com/…" />
          </Field>
          <Field label="YouTube Live link" hint="Optional">
            <input className={inputCls} value={form.youtube_url} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://youtube.com/live/…" />
          </Field>
          <Field label="Registration link" hint="Optional">
            <input className={inputCls} value={form.registration_link} onChange={(e) => setForm({ ...form, registration_link: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Description">
            <textarea
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border hairline bg-background/40 px-3.5 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="A short note that appears on the mobile home screen…"
            />
          </Field>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-5 text-left transition hover:border-primary/40 hover:bg-surface-2/40">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/12 text-primary">
              {form.banner_url ? <img src={form.banner_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-[18px] w-[18px]" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">Banner image</div>
              <div className="truncate text-xs text-muted-foreground">
                {form.banner_url ? "Uploaded" : "Optional · 1600×900 recommended"}
              </div>
            </div>
            <span className="text-xs text-primary">{form.banner_url ? "Replace" : "Upload"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadBanner(e.target.files?.[0])} />
          </label>

          <label className="flex items-center gap-4 rounded-2xl border hairline bg-surface-2/40 p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gold/12 text-gold">
              <Bell className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">Notify all users on publish</div>
              <div className="truncate text-xs text-muted-foreground">Send a push notification to every user.</div>
            </div>
            <input
              type="checkbox"
              checked={form.notify_users}
              onChange={(e) => setForm({ ...form, notify_users: e.target.checked })}
              className="h-5 w-5"
            />
          </label>
        </div>

        <div className="mt-8">
          {validationErrors.length > 0 && (
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <ul className="list-inside list-disc">
                {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="mb-4 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500">
              <ul className="list-inside">
                {warnings.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-5 py-2.5 text-sm text-foreground hover:bg-surface-2">
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              onClick={submit("draft")}
              disabled={saveMut.isPending || validationErrors.length > 0}
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-5 py-2.5 text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              <FileEdit className="h-4 w-4" /> Save Draft
            </button>
            <button
              data-testid="publish-meeting-btn"
              onClick={submit("upcoming")}
              disabled={saveMut.isPending || validationErrors.length > 0}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95 disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" /> Publish
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
