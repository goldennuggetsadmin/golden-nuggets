import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, UploadCloud, FileText, Play, ArrowLeft, Save, Send, DownloadCloud, Loader2, X, Star, Bell } from "lucide-react";
import { api, formatApiErrorDetail, MEDIA_FILE_URL } from "@/lib/api";
import { getManagedSeriesList, saveManagedSeriesName } from "@/pages/Series";

function buildCleanPayload(formState, targetStatus) {
  return {
    title: formState.title || "",
    speaker: formState.speaker || "",
    series: formState.series || "General",
    year: formState.year ? String(formState.year) : "",
    location: formState.location || "",
    state: formState.state || "",
    date: formState.date || "",
    language: formState.language || "en",
    duration: formState.duration ? String(formState.duration) : "",
    description: formState.description || "",
    tags: Array.isArray(formState.tags) ? formState.tags : [],
    category_ids: Array.isArray(formState.category_ids) && formState.category_ids.length > 0
      ? formState.category_ids
      : (formState.category_id ? [formState.category_id] : []),
    category_id: formState.category_id || (Array.isArray(formState.category_ids) && formState.category_ids[0] ? formState.category_ids[0] : ""),
    featured: Boolean(formState.featured),
    status: targetStatus,
    source: formState.source || "manual",
    sermon_code: formState.sermon_code || "",
    audio_url: formState.audio_url || "",
    audio_storage_path: formState.audio_storage_path || "",
    artwork_url: formState.artwork_url || "",
    artwork_storage_path: formState.artwork_storage_path || "",
    pdf_english_url: formState.pdf_english_url || "",
    pdf_english_storage_path: formState.pdf_english_storage_path || "",
    pdf_telugu_url: formState.pdf_telugu_url || "",
    pdf_telugu_storage_path: formState.pdf_telugu_storage_path || "",
  };
}

const inputCls =
  "h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring";

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

function SearchableSeriesSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Only the 14 predefined series are allowed — no dynamic lookup from DB sermons.
  const availableSeries = getManagedSeriesList();

  const filtered = availableSeries.filter((s) => s.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <div
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="h-11 w-full flex items-center justify-between rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground cursor-pointer"
      >
        <span className={value ? "text-foreground font-medium" : "text-muted-foreground"}>
          {value || "Select series…"}
        </span>
        {value && (
          <X
            className="h-4 w-4 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border hairline bg-card shadow-glow">
          <div className="sticky top-0 bg-card p-2 pb-1">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search series…"
              className="h-9 w-full rounded-lg border hairline bg-background/60 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <div className="p-2 pt-1 space-y-0.5">
            {filtered.length > 0 ? (
              filtered.map((s) => (
                <div
                  key={s}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs cursor-pointer transition hover:bg-surface-2 ${
                    value === s ? "bg-primary/15 text-primary font-medium" : "text-foreground"
                  }`}
                >
                  {s}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No series found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableCategorySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: catsData } = useQuery({
    queryKey: ["categories-lookup"],
    queryFn: async () => (await api.get(`/admin/categories`)).data,
  });

  const categories = useMemo(() => catsData?.items || [], [catsData]);
  const selectedCat = useMemo(() => {
    if (!value) return null;
    return categories.find((c) => c.id === value || c.slug === value || c.name.toLowerCase() === String(value).toLowerCase());
  }, [categories, value]);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <div
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="h-11 w-full flex items-center justify-between rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground cursor-pointer"
      >
        <span className={selectedCat ? "text-foreground font-medium" : "text-muted-foreground"}>
          {selectedCat ? selectedCat.name : (value || "Select category…")}
        </span>
        {value && (
          <X
            className="h-4 w-4 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border hairline bg-card shadow-glow">
          <div className="sticky top-0 bg-card p-2 pb-1">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category…"
              className="h-9 w-full rounded-lg border hairline bg-background/60 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <div className="p-2 pt-1 space-y-0.5">
            {filtered.length > 0 ? (
              filtered.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs cursor-pointer transition hover:bg-surface-2 ${
                    (value === c.id || value === c.slug) ? "bg-primary/15 text-primary font-medium" : "text-foreground"
                  }`}
                >
                  <div className="font-medium">{c.name}</div>
                  {c.description && <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No categories available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY = {
  title: "",
  speaker: "",
  series: "",
  year: "",
  location: "",
  state: "",
  date: "",
  language: "",
  duration: "",
  description: "",
  tags: [],
  featured: false,
  status: "draft",
  source: "manual",
  audio_url: "",
  audio_storage_path: "",
  artwork_url: "",
  artwork_storage_path: "",
  pdf_english_url: "",
  pdf_english_storage_path: "",
  pdf_telugu_url: "",
  pdf_telugu_storage_path: "",
  transcript: "",
  category_id: "",
  category_ids: [],
};

export default function SermonForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [sendNotification, setSendNotification] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["sermon", id],
    queryFn: async () => (await api.get(`/admin/sermons/${id}`)).data,
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      const category_ids = Array.isArray(existing.category_ids) && existing.category_ids.length > 0
        ? existing.category_ids
        : (existing.category_id ? [existing.category_id] : []);
      setForm({ ...EMPTY, ...existing, category_ids });
    }
  }, [existing]);

  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const saveMut = useMutation({
    mutationFn: async (payload) => {
      if (isEdit) return (await api.patch(`/admin/sermons/${id}`, payload)).data;
      return (await api.post(`/admin/sermons`, payload)).data;
    },
    onSuccess: async (data) => {
      toast.success(isEdit ? "✓ Sermon updated successfully." : "✓ Sermon created successfully.");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["sermon", id] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["sermons-series-lookup"] });
      setDirty(false);
      // Fire push notification if checked and status is published
      if (sendNotification && data?.status === "published") {
        try {
          const notifRes = await api.post("/admin/notifications", {
            title: "New Sermon Available",
            body: data.title || form.title,
            type: "sermon",
            sermon_id: data.id,
            status: "draft",
          });
          if (notifRes?.data?.id) {
            await api.post(`/admin/notifications/${notifRes.data.id}/publish`, {});
            toast.success("Push notification sent to all users");
          }
        } catch {
          toast.error("Sermon saved, but notification failed to send");
        }
      }
      if (!isEdit) navigate(`/sermons/${data.id}/edit`, { replace: true });
    },
    onError: (e) => {
      const msg = formatApiErrorDetail(e);
      toast.error(msg || (isEdit ? "Unable to update sermon." : "Unable to create sermon."));
    },
  });

  const [showNoSeriesModal, setShowNoSeriesModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("published");

  const handleSubmit = (status) => (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.language || !form.language.trim()) {
      toast.error("Language is required — please select a language before saving.");
      return;
    }
    if (!form.series || !form.series.trim()) {
      setPendingStatus(status);
      setShowNoSeriesModal(true);
      return;
    }
    const sanitized = buildCleanPayload(form, status);
    saveMut.mutate(sanitized);
  };

  const handleContinueWithoutSeries = () => {
    setShowNoSeriesModal(false);
    const sanitized = buildCleanPayload({ ...form, series: "General" }, pendingStatus);
    saveMut.mutate(sanitized);
  };

  if (isEdit && isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="sermon-form-page" className="mx-auto max-w-[1300px] space-y-8">
      <div className="flex items-center gap-3">
        <Link
          to="/sermons"
          className="grid h-9 w-9 place-items-center rounded-full border hairline bg-surface-2/40 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Library · {isEdit ? "Edit" : "Create Manually"}
            </p>
            {isEdit && form.source === "import" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-2.5 py-1 text-[11px] text-gold ring-1 ring-gold/25">
                <DownloadCloud className="h-3 w-3" /> Imported from Branham.org
              </span>
            )}
            {isEdit && form.source === "manual" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border">
                Manual Upload
              </span>
            )}
          </div>
          <h1 className="mt-1 font-serif text-3xl text-foreground">
            {isEdit ? form.title || "Edit Sermon" : "Add a Sermon"}
          </h1>
        </div>
      </div>

      {!isEdit && (
        <div className="rounded-2xl border hairline bg-gold/5 p-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <span className="text-foreground">Tip:</span> If this sermon already exists on a webpage, importing is faster — everything is filled in for you.
            </span>
            <Link
              to="/import"
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-4 py-2 text-sm text-foreground hover:bg-surface-2"
            >
              <DownloadCloud className="h-4 w-4" /> Go to Import Center
            </Link>
          </div>
        </div>
      )}

      {isEdit && form.source === "import" && form.source_url && (
        <div className="rounded-2xl border hairline bg-surface-2/40 px-5 py-3.5 text-sm text-muted-foreground flex items-center gap-3">
          <DownloadCloud className="h-4 w-4 shrink-0 text-gold" />
          <span>Original source: <a href={form.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{form.source_url}</a></span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
        <form className="space-y-5 rounded-2xl border hairline bg-card p-6 lg:p-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Title">
              <input data-testid="sermon-title-input" required className={inputCls} value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. From Ashes to Anointing" />
            </Field>
            <Field label="Speaker">
              <input data-testid="sermon-speaker-input" className={inputCls} value={form.speaker} onChange={(e) => update({ speaker: e.target.value })} placeholder="Sis. Priya" />
            </Field>
            <Field label="Series">
              <SearchableSeriesSelect
                value={form.series || ""}
                onChange={(series) => update({ series })}
              />
            </Field>
            <Field label="Category">
              <SearchableCategorySelect
                value={(form.category_ids && form.category_ids[0]) || form.category_id || ""}
                onChange={(catId) => update({ category_ids: catId ? [catId] : [], category_id: catId })}
              />
            </Field>
            <Field label="Year">
              <input className={inputCls} value={form.year || ""} onChange={(e) => update({ year: e.target.value })} placeholder="2024" />
            </Field>
            <Field label="Location">
              <input className={inputCls} value={form.location || ""} onChange={(e) => update({ location: e.target.value })} placeholder="Jeffersonville, IN" />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.date || ""} onChange={(e) => update({ date: e.target.value })} />
            </Field>
            <Field label="Language *">
              <select
                required
                className={inputCls}
                value={form.language}
                onChange={(e) => update({ language: e.target.value })}
              >
                <option value="">— Select language —</option>
                <option value="en">English</option>
                <option value="te">Telugu (తెలుగు)</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="ta">Tamil (தமிழ்)</option>
              </select>
            </Field>
            <Field label="Duration" hint="mm:ss">
              <input className={inputCls} value={form.duration || ""} onChange={(e) => update({ duration: e.target.value })} placeholder="24:12" />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={4}
              value={form.description || ""}
              onChange={(e) => update({ description: e.target.value })}
              className="w-full rounded-lg border hairline bg-background/40 px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="A short summary that will appear on the sermon's detail card…"
            />
          </Field>
          
          <Field label="Transcript">
            <textarea
              rows={8}
              value={form.transcript || ""}
              onChange={(e) => update({ transcript: e.target.value })}
              className="w-full rounded-lg border hairline bg-background/40 px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Paste full text transcript here if available…"
            />
          </Field>

          {/* ── Publishing Controls ── */}
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Feature on Home Screen */}
            <label
              data-testid="sermon-featured-checkbox"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                form.featured
                  ? "border-gold/40 bg-gold/8"
                  : "border-hairline bg-surface-2/40 hover:bg-surface-2/70"
              }`}
            >
              <input
                type="checkbox"
                checked={!!form.featured}
                onChange={(e) => update({ featured: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-yellow-400"
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Star className={`h-3.5 w-3.5 ${form.featured ? "fill-gold text-gold" : "text-muted-foreground"}`} />
                  Feature on Home Screen
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Appears in the Most Popular section of the mobile app.
                </div>
              </div>
            </label>

            {/* Send Push Notification */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                sendNotification
                  ? "border-primary/40 bg-primary/8"
                  : "border-hairline bg-surface-2/40 hover:bg-surface-2/70"
              }`}
            >
              <input
                type="checkbox"
                data-testid="send-notification-checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Bell className={`h-3.5 w-3.5 ${sendNotification ? "text-primary" : "text-muted-foreground"}`} />
                  Send Push Notification
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Notifies all app users: <span className="italic">"New Sermon Available — Listen now →"</span>
                </div>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Link
              to="/sermons"
              className="rounded-full border hairline bg-surface-2/40 px-5 py-2.5 text-sm text-foreground hover:bg-surface-2"
            >
              Cancel
            </Link>
            <button
              data-testid="save-draft-btn"
              onClick={handleSubmit("draft")}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-5 py-2.5 text-sm text-foreground hover:bg-surface-2 disabled:opacity-70"
            >
              <Save className="h-4 w-4" /> Save Draft
            </button>
            <button
              data-testid="publish-btn"
              onClick={handleSubmit("published")}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95 disabled:opacity-70"
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" /> Publish
            </button>
          </div>
        </form>

        <div className="space-y-5">
          {/* Import notice at top of right sidebar for imported sermons */}
          {isEdit && form.source === "import" && (
            <div className="rounded-2xl border hairline border-gold/25 bg-gold/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-gold mb-2">Imported Resources</div>
              <p className="text-xs text-muted-foreground">
                These resources stream from Branham.org. Upload a local file below to override any resource independently.
              </p>
            </div>
          )}

          <UploadCard
            icon={ImagePlus}
            title="Artwork"
            hint={form.source === "import" && form.artwork_url && !form.artwork_storage_path ? "External (Branham.org) · Upload to override" : "Square, 1400×1400 recommended"}
            kind="artwork"
            accept="image/*"
            currentPath={form.artwork_storage_path}
            currentUrl={form.artwork_url}
            onUploaded={(m) =>
              update({ artwork_storage_path: m.storage_path, artwork_url: MEDIA_FILE_URL(m.id) })
            }
            onRemoved={() => update({ artwork_storage_path: "", artwork_url: "" })}
          />
          <UploadCard
            icon={UploadCloud}
            title="Audio File"
            hint={form.source === "import" && form.audio_url && !form.audio_storage_path ? "External (Branham.org) · Upload to override" : "MP3 or WAV · up to 500 MB"}
            kind="audio"
            accept="audio/*"
            currentPath={form.audio_storage_path}
            currentUrl={form.audio_url}
            onUploaded={(m) =>
              update({ audio_storage_path: m.storage_path, audio_url: MEDIA_FILE_URL(m.id) })
            }
            onRemoved={() => update({ audio_storage_path: "", audio_url: "" })}
          />
          <UploadCard
            icon={FileText}
            title="English PDF"
            hint={form.source === "import" && form.pdf_english_url && !form.pdf_english_storage_path ? "External (Branham.org) · Upload to override" : "Transcript, optional"}
            kind="pdf"
            accept="application/pdf"
            currentPath={form.pdf_english_storage_path}
            currentUrl={form.pdf_english_url}
            onUploaded={(m) =>
              update({ pdf_english_storage_path: m.storage_path, pdf_english_url: MEDIA_FILE_URL(m.id) })
            }
            onRemoved={() => update({ pdf_english_storage_path: "", pdf_english_url: "" })}
          />
          <UploadCard
            icon={FileText}
            title="Telugu PDF"
            hint={form.source === "import" && form.pdf_telugu_url && !form.pdf_telugu_storage_path ? "External (Branham.org) · Upload to override" : "Transcript, optional"}
            kind="pdf"
            accept="application/pdf"
            currentPath={form.pdf_telugu_storage_path}
            currentUrl={form.pdf_telugu_url}
            onUploaded={(m) =>
              update({ pdf_telugu_storage_path: m.storage_path, pdf_telugu_url: MEDIA_FILE_URL(m.id) })
            }
            onRemoved={() => update({ pdf_telugu_storage_path: "", pdf_telugu_url: "" })}
          />

          <div className="rounded-2xl border hairline bg-card p-5">
            <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Preview</div>
            <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/30 to-gold/25">
                {form.artwork_url ? (
                  <img src={form.artwork_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Play className="h-4 w-4 text-foreground/80" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-[15px] text-foreground">
                  {form.title || "Untitled sermon"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[form.speaker, form.series, form.duration].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* No Series Selected Warning Modal */}
      {showNoSeriesModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border hairline bg-card p-6 shadow-glow">
            <div className="font-serif text-xl text-foreground">No Series Selected</div>
            <p className="mt-3 text-sm text-muted-foreground">
              This sermon has not been assigned to a Series. If you continue, this sermon will automatically be placed under <span className="text-foreground font-medium">General</span>.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setShowNoSeriesModal(false)}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow"
              >
                Select Series
              </button>
              <button
                onClick={handleContinueWithoutSeries}
                className="rounded-full border hairline bg-surface-2/60 px-4 py-2 text-sm text-foreground hover:bg-surface-2"
              >
                Continue Without Series
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadCard({ icon: Icon, title, hint, kind, accept, currentPath, currentUrl, onUploaded, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (file) => {
    if (!file) return;
    if (kind === "pdf" && file.size > 100 * 1024 * 1024) {
      toast.error("PDF file size exceeds maximum limit of 100 MB");
      return;
    }
    if (hasFile && kind === "pdf") {
      const confirmReplace = window.confirm("Replacing this PDF will archive the current version and re-extract transcript paragraphs. Continue?");
      if (!confirmReplace) return;
    }
    setBusy(true);
    setProgress(0);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(`/admin/media/upload?kind=${kind}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
      });
      onUploaded(data);
      toast.success(`${title} uploaded`);
    } catch (err) {
      toast.error(`Failed to upload ${title}`);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const hasFile = Boolean(currentPath || currentUrl);

  return (
    <div
      data-testid={`upload-${kind}-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="group flex w-full items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-5 text-left transition hover:border-primary/40 hover:bg-surface-2/40"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary transition group-hover:scale-105">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">{title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {hasFile ? "Uploaded" : hint}
        </div>
        {busy && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {hasFile ? (
        <button type="button" onClick={onRemoved} className="p-1.5 text-muted-foreground hover:text-destructive" aria-label="Remove">
          <X className="h-4 w-4" />
        </button>
      ) : (
        <label className="cursor-pointer text-xs text-primary">
          {busy ? "Uploading…" : "Upload"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
