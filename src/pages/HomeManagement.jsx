import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Home, ImagePlus, Play, Star, Calendar, FolderKanban, Loader2, Save,
  ChevronDown, ChevronUp, X, Plus,
} from "lucide-react";
import { api, MEDIA_FILE_URL } from "@/lib/api";

const inputCls =
  "h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring";

export default function HomeManagement() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["home-config"],
    queryFn: async () => (await api.get(`/admin/home`)).data,
  });
  const { data: sermons } = useQuery({
    queryKey: ["sermons-picker"],
    queryFn: async () => (await api.get(`/admin/sermons?status=published&page_size=100`)).data,
  });
  const { data: meetings } = useQuery({
    queryKey: ["meetings-picker"],
    queryFn: async () => (await api.get(`/admin/meetings?status=upcoming`)).data,
  });
  const { data: cats } = useQuery({
    queryKey: ["cats-picker"],
    queryFn: async () => (await api.get(`/admin/categories`)).data,
  });

  useEffect(() => {
    if (data) {
      setForm({
        featured_banner_sermon_id: data.featured_banner_sermon_id || "",
        featured_banner_meeting_id: data.featured_banner_meeting_id || "",
        featured_banner_title: data.featured_banner_title || "",
        featured_banner_subtitle: data.featured_banner_subtitle || "",
        featured_banner_image_url: data.featured_banner_image_url || "",
        featured_banner_image_storage_path: data.featured_banner_image_storage_path || "",
        featured_sermon_ids: data.featured_sermon_ids || [],
        recently_added_count: data.recently_added_count ?? 6,
        category_ids: data.category_ids || [],
        upcoming_meeting_ids: data.upcoming_meeting_ids || [],
        show_recently_added: data.show_recently_added ?? true,
        show_upcoming_meetings: data.show_upcoming_meetings ?? true,
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => (await api.patch(`/admin/home`, form)).data,
    onSuccess: () => {
      toast.success("Home configuration saved");
      qc.invalidateQueries({ queryKey: ["home-config"] });
    },
    onError: () => toast.error("Save failed"),
  });

  const uploadBanner = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data: m } = await api.post(`/admin/media/upload?kind=banner`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({
        ...f,
        featured_banner_image_url: MEDIA_FILE_URL(m.id),
        featured_banner_image_storage_path: m.storage_path,
      }));
      toast.success("Banner uploaded");
    } catch {
      toast.error("Upload failed");
    }
  };

  if (isLoading || !form) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const sermonList = sermons?.items || [];
  const meetingList = meetings?.items || [];
  const catList = cats?.items || [];

  const move = (arr, from, to) => {
    const next = [...arr];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  };

  return (
    <div data-testid="home-page" className="mx-auto max-w-[1300px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Mobile</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Home Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure the mobile home screen — banner, featured sermons, recent additions, categories, and upcoming meetings.
          </p>
        </div>
        <button
          data-testid="save-home-btn"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-70"
        >
          {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" /> Save
        </button>
      </div>

      {/* Featured banner */}
      <section className="rounded-2xl border hairline bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg text-foreground">Featured Banner</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Headline</div>
            <input className={inputCls} value={form.featured_banner_title} onChange={(e) => setForm({ ...form, featured_banner_title: e.target.value })} placeholder="This Sunday, 10 AM" />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Subtitle</div>
            <input className={inputCls} value={form.featured_banner_subtitle} onChange={(e) => setForm({ ...form, featured_banner_subtitle: e.target.value })} placeholder="Faith Nights · Sanctuary" />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Linked sermon (optional)</div>
            <select className={inputCls} value={form.featured_banner_sermon_id} onChange={(e) => setForm({ ...form, featured_banner_sermon_id: e.target.value })}>
              <option value="">None</option>
              {sermonList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} — {s.speaker}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Linked meeting (optional)</div>
            <select className={inputCls} value={form.featured_banner_meeting_id} onChange={(e) => setForm({ ...form, featured_banner_meeting_id: e.target.value })}>
              <option value="">None</option>
              {meetingList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} — {m.start_date}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="grid h-24 w-40 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/25 to-gold/25">
            {form.featured_banner_image_url ? (
              <img src={form.featured_banner_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Home className="h-6 w-6 text-foreground/70" />
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border hairline bg-surface-2/40 px-4 py-2 text-sm text-foreground hover:bg-surface-2">
            <ImagePlus className="h-4 w-4" /> Upload Banner Image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadBanner(e.target.files?.[0])} />
          </label>
          {form.featured_banner_image_url && (
            <button
              onClick={() => setForm({ ...form, featured_banner_image_url: "", featured_banner_image_storage_path: "" })}
              className="p-1.5 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {/* Featured Sermons */}
      <Picker
        icon={Play}
        title="Featured Sermons"
        subtitle="Pinned to the top of the mobile library. Drag order using the arrows."
        selectedIds={form.featured_sermon_ids}
        options={sermonList}
        renderOption={(s) => `${s.title} — ${s.speaker || "—"}`}
        onAdd={(id) => setForm({ ...form, featured_sermon_ids: [...form.featured_sermon_ids, id] })}
        onRemove={(id) => setForm({ ...form, featured_sermon_ids: form.featured_sermon_ids.filter((x) => x !== id) })}
        onMove={(i, dir) => {
          const next = move(form.featured_sermon_ids, i, i + dir);
          setForm({ ...form, featured_sermon_ids: next });
        }}
      />

      {/* Categories on home */}
      <Picker
        icon={FolderKanban}
        title="Categories on Home"
        subtitle="Which category rows appear on the mobile home screen."
        selectedIds={form.category_ids}
        options={catList}
        renderOption={(c) => c.name}
        onAdd={(id) => setForm({ ...form, category_ids: [...form.category_ids, id] })}
        onRemove={(id) => setForm({ ...form, category_ids: form.category_ids.filter((x) => x !== id) })}
        onMove={(i, dir) => {
          const next = move(form.category_ids, i, i + dir);
          setForm({ ...form, category_ids: next });
        }}
      />

      {/* Upcoming meetings */}
      <Picker
        icon={Calendar}
        title="Upcoming Meetings"
        subtitle="Leave empty to auto-fill with the next five upcoming meetings."
        selectedIds={form.upcoming_meeting_ids}
        options={meetingList}
        renderOption={(m) => `${m.title} — ${m.start_date || "TBD"}`}
        onAdd={(id) => setForm({ ...form, upcoming_meeting_ids: [...form.upcoming_meeting_ids, id] })}
        onRemove={(id) => setForm({ ...form, upcoming_meeting_ids: form.upcoming_meeting_ids.filter((x) => x !== id) })}
        onMove={(i, dir) => {
          const next = move(form.upcoming_meeting_ids, i, i + dir);
          setForm({ ...form, upcoming_meeting_ids: next });
        }}
      />

      {/* Recently added */}
      <section className="rounded-2xl border hairline bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg text-foreground">Recently Added</h2>
            <p className="text-sm text-muted-foreground">Number of the newest sermons to surface on the mobile home screen.</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="number"
                min={0}
                max={20}
                value={form.recently_added_count}
                onChange={(e) => setForm({ ...form, recently_added_count: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                className="h-10 w-20 rounded-lg border hairline bg-background/40 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              sermons
            </label>
            <Toggle
              label="Show section"
              value={form.show_recently_added}
              onChange={(v) => setForm({ ...form, show_recently_added: v })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Picker({ icon: Icon, title, subtitle, selectedIds, options, renderOption, onAdd, onRemove, onMove }) {
  const byId = Object.fromEntries((options || []).map((o) => [o.id, o]));
  const available = (options || []).filter((o) => !selectedIds.includes(o.id));

  return (
    <section className="rounded-2xl border hairline bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-serif text-lg text-foreground">{title}</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>

      <div className="space-y-2">
        {selectedIds.length === 0 && <div className="text-sm text-muted-foreground">Nothing selected.</div>}
        {selectedIds.map((id, i) => {
          const o = byId[id];
          if (!o) return null;
          return (
            <div key={id} className="flex items-center gap-2 rounded-xl bg-surface-2/50 px-3 py-2 text-sm">
              <span className="w-6 text-center text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{renderOption(o)}</span>
              <button
                disabled={i === 0}
                onClick={() => onMove(i, -1)}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                disabled={i === selectedIds.length - 1}
                onClick={() => onMove(i, +1)}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button onClick={() => onRemove(id)} className="p-1 text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <select
          value=""
          onChange={(e) => e.target.value && onAdd(e.target.value)}
          className="h-10 min-w-[240px] rounded-lg border hairline bg-background/40 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">+ Add {title.toLowerCase()}</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {renderOption(o)}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition ${value ? "bg-primary/80" : "bg-surface-2"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-foreground shadow transition-all ${value ? "right-0.5" : "left-0.5"}`} />
      </button>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}
