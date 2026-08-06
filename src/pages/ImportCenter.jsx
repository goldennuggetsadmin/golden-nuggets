import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DownloadCloud, Link2, Sparkles, CheckCircle2, Loader2,
  Play, Send, RefreshCw, Plus, ArrowRight, Layers, AlertCircle, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { getManagedSeriesList, saveManagedSeriesName } from "@/pages/Series";

const IMPORT_STEPS = [
  { key: "fetch", label: "Reading webpage…" },
  { key: "parse", label: "Extracting metadata…" },
  { key: "media", label: "Locating audio, PDFs, artwork…" },
  { key: "ready", label: "Preparing preview…" },
];

export default function ImportCenter() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | importing | preview
  const [preview, setPreview] = useState(null);
  const [runningStep, setRunningStep] = useState(-1);
  const [showNoSeriesWarning, setShowNoSeriesWarning] = useState(false);
  const [pendingPublishStatus, setPendingPublishStatus] = useState("published");
  const [seriesSearch, setSeriesSearch] = useState("");
  const [seriesDropdownOpen, setSeriesDropdownOpen] = useState(false);

  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: recentData } = useQuery({
    queryKey: ["sermons-recent-imports"],
    queryFn: async () => (await api.get(`/admin/sermons?source=import&page_size=5`)).data,
  });

  const { data: sermonsData } = useQuery({
    queryKey: ["sermons-series-lookup"],
    queryFn: async () => (await api.get(`/admin/sermons?page_size=9999`)).data,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories-picker"],
    queryFn: async () => (await api.get(`/admin/categories`)).data,
  });
  const categories = categoriesData?.items || [];

  // Available series list
  const availableSeries = useMemo(() => {
    const set = new Set(getManagedSeriesList());
    (sermonsData?.items || []).forEach((s) => {
      if (s.series && s.series.trim()) set.add(s.series.trim());
    });
    return Array.from(set).sort();
  }, [sermonsData]);

  // Smart series suggestion based on title similarity & keywords
  const suggestedSeries = useMemo(() => {
    if (!preview?.title || availableSeries.length === 0) return null;
    const titleLower = preview.title.toLowerCase();

    // 1. Direct title/keyword match
    for (const s of availableSeries) {
      const sLower = s.toLowerCase();
      if (titleLower.includes(sLower) || sLower.includes(titleLower)) {
        return s;
      }
    }

    // 2. Keyword heuristic matches (e.g. "Hebrews" -> "Book of Hebrews", "Holy Ghost" -> "Holy Ghost")
    const keywordsMap = {
      "holy ghost": ["holy ghost", "holy spirit"],
      "seven seals": ["seal", "seals"],
      "book of hebrews": ["hebrews", "hebrew"],
      "church ages": ["church age", "church ages"],
    };

    for (const [canonicalSeries, keywords] of Object.entries(keywordsMap)) {
      const matchingSeries = availableSeries.find((s) => s.toLowerCase() === canonicalSeries);
      if (matchingSeries && keywords.some((kw) => titleLower.includes(kw))) {
        return matchingSeries;
      }
    }

    return null;
  }, [preview?.title, availableSeries]);

  const previewMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/import/preview`, { url })).data,
    onMutate: () => {
      setPhase("importing");
      setRunningStep(0);
      IMPORT_STEPS.forEach((_, i) => {
        setTimeout(() => setRunningStep(i), i * 350);
      });
    },
    onSuccess: (data) => {
      setPreview({ ...data, category_ids: [], series: "" });
      setRunningStep(IMPORT_STEPS.length);
      setPhase("preview");
    },
    onError: (e) => {
      setPhase("idle");
      setRunningStep(-1);
      toast.error(e?.response?.data?.detail || "Failed to import. Check the URL.");
    },
  });

  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [refreshPreviewData, setRefreshPreviewData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const publishMut = useMutation({
    mutationFn: async (payloadOrStatus) => {
      const isObject = typeof payloadOrStatus === "object";
      const allowDuplicate = isObject && payloadOrStatus.allow_duplicate ? "?allow_duplicate=true" : "";
      const payload = isObject ? payloadOrStatus : { ...preview, status: payloadOrStatus };
      return (await api.post(`/admin/import/publish${allowDuplicate}`, payload)).data;
    },
    onSuccess: () => {
      toast.success("Sermon published from URL");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      navigate("/sermons");
    },
    onError: (e) => {
      if (e.response?.status === 409 && e.response?.data?.status === "duplicate_detected") {
        setDuplicateInfo(e.response.data);
      } else {
        toast.error(e?.response?.data?.detail || "Failed to publish");
      }
    },
  });

  const handleFetchRefreshPreview = async () => {
    if (!duplicateInfo?.existing_sermon?.id) return;
    setIsRefreshing(true);
    try {
      const res = await api.post(`/admin/sermons/${duplicateInfo.existing_sermon.id}/refresh-preview`, preview);
      setRefreshPreviewData(res.data);
    } catch (err) {
      toast.error("Failed to load refresh preview");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirmRefresh = async () => {
    if (!duplicateInfo?.existing_sermon?.id) return;
    setIsRefreshing(true);
    try {
      await api.put(`/admin/sermons/${duplicateInfo.existing_sermon.id}/refresh`, preview);
      toast.success("Existing sermon refreshed successfully");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      setDuplicateInfo(null);
      setRefreshPreviewData(null);
      navigate("/sermons");
    } catch (err) {
      toast.error("Failed to refresh sermon");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateDuplicateCopy = () => {
    setDuplicateInfo(null);
    setRefreshPreviewData(null);
    publishMut.mutate({ ...preview, allow_duplicate: true });
  };

  const runImport = () => {
    if (!url.trim()) {
      toast.error("Paste a URL first");
      return;
    }
    previewMut.mutate();
  };

  const handlePublish = (status) => {
    if (!preview.language || !preview.language.trim()) {
      toast.error("Language is required — please select a language before publishing.");
      return;
    }
    if (!preview.series || !preview.series.trim()) {
      setPendingPublishStatus(status);
      setShowNoSeriesWarning(true);
      return;
    }
    publishMut.mutate(status);
  };

  const executePublishNow = () => {
    setShowNoSeriesWarning(false);
    publishMut.mutate({ ...preview, series: "General", status: pendingPublishStatus });
  };

  const reset = () => {
    setPhase("idle");
    setUrl("");
    setPreview(null);
    setRunningStep(-1);
  };

  const filteredSeries = availableSeries.filter((s) =>
    s.toLowerCase().includes(seriesSearch.toLowerCase())
  );

  return (
    <div data-testid="import-center-page" className="mx-auto max-w-[1200px] space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Metadata-only import</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Import Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Paste a Branham.org (or similar) sermon URL — we extract metadata and stream audio from the original source. Nothing is downloaded or mirrored.
          </p>
        </div>
        <Link
          to="/sermons/new"
          className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-4 py-2.5 text-sm text-foreground hover:bg-surface-2"
        >
          <Plus className="h-4 w-4" /> Create Manually Instead
        </Link>
      </div>

      <div className="rounded-2xl border hairline bg-card p-6 lg:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <DownloadCloud className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-lg text-foreground">Sermon webpage URL</div>
            <div className="text-xs text-muted-foreground">
              Works best with branham.org sermon pages. Audio keeps streaming from the source.
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <div className="relative min-w-[280px] flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              data-testid="import-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={phase === "importing"}
              placeholder="https://branham.org/en/messagesaudio/…"
              className="h-12 w-full rounded-full border hairline bg-background/40 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
          {phase === "idle" && (
            <button
              data-testid="import-run-btn"
              onClick={runImport}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" /> Import
            </button>
          )}
          {phase !== "idle" && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-5 py-3 text-sm text-foreground hover:bg-surface-2"
            >
              <RefreshCw className="h-4 w-4" /> Start Over
            </button>
          )}
        </div>

        {phase !== "idle" && (
          <div className="mt-6 space-y-2 rounded-2xl border hairline bg-background/30 p-5">
            {IMPORT_STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-3 text-sm">
                {i < runningStep ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : i === runningStep ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="h-4 w-4 rounded-full border hairline" />
                )}
                <span className={i > runningStep ? "text-muted-foreground" : "text-foreground"}>{s.label}</span>
                {i < runningStep && <span className="ml-auto text-[11px] text-muted-foreground">done</span>}
              </div>
            ))}
            {phase === "preview" && (
              <div className="mt-3 flex items-center gap-2 pt-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" /> Completed — preview ready below.
              </div>
            )}
          </div>
        )}
      </div>

      {phase === "preview" && preview && (
        <div data-testid="import-preview" className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border hairline bg-card p-6 lg:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Source: Branham.org (Imported)</p>
                <h2 className="mt-1 font-serif text-xl text-foreground">Import Preview</h2>
              </div>
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] text-primary ring-1 ring-primary/20">
                Ready to Publish
              </span>
            </div>

            {/* Smart Series Suggestion Banner */}
            {suggestedSeries && preview.series !== suggestedSeries && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                <div className="flex items-center gap-3">
                  <Layers className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-primary uppercase tracking-wider">Suggested Series</div>
                    <div className="text-sm text-foreground font-medium">{suggestedSeries}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreview({ ...preview, series: suggestedSeries })}
                    className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-glow hover:opacity-95"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => setSeriesDropdownOpen(true)}
                    className="rounded-full border hairline bg-surface-2/60 px-3.5 py-1.5 text-xs text-foreground hover:bg-surface-2"
                  >
                    Choose Another
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <EditField label="Title" value={preview.title || ""} onChange={(v) => setPreview({ ...preview, title: v })} />
              <EditField label="Speaker" value={preview.speaker || ""} onChange={(v) => setPreview({ ...preview, speaker: v })} />
              <EditField label="Sermon Code" value={preview.sermon_code || ""} onChange={(v) => setPreview({ ...preview, sermon_code: v })} />
              <EditField label="Full Date" value={preview.date || ""} onChange={(v) => setPreview({ ...preview, date: v })} />
              <EditField label="Year" value={preview.year || ""} onChange={(v) => setPreview({ ...preview, year: v })} />
              <EditField label="Location" value={preview.location || ""} onChange={(v) => setPreview({ ...preview, location: v })} />
              <div>
                <div className="mb-1.5 text-[13px] text-foreground">Language *</div>
                <select
                  required
                  value={preview.language || ""}
                  onChange={(e) => setPreview({ ...preview, language: e.target.value })}
                  className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select language —</option>
                  <option value="en">English</option>
                  <option value="te">Telugu (తెలుగు)</option>
                  <option value="hi">Hindi (हिंदी)</option>
                  <option value="ta">Tamil (தமிழ்)</option>
                </select>
              </div>

              {/* Searchable Series Selector */}
              <div className="relative">
                <div className="mb-1.5 text-[13px] text-foreground">Series</div>
                <div
                  onClick={() => setSeriesDropdownOpen(!seriesDropdownOpen)}
                  className="h-11 w-full flex items-center justify-between rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground cursor-pointer"
                >
                  <span className={preview.series ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {preview.series || "Select Series..."}
                  </span>
                  {preview.series && (
                    <X
                      className="h-4 w-4 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview({ ...preview, series: "" });
                      }}
                    />
                  )}
                </div>

                {seriesDropdownOpen && (
                  <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border hairline bg-card p-2 shadow-glow space-y-1">
                    <input
                      autoFocus
                      value={seriesSearch}
                      onChange={(e) => setSeriesSearch(e.target.value)}
                      placeholder="Search or create series..."
                      className="h-9 w-full rounded-lg border hairline bg-background/60 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    {filteredSeries.map((s) => (
                      <div
                        key={s}
                        onClick={() => {
                          setPreview({ ...preview, series: s });
                          setSeriesDropdownOpen(false);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs cursor-pointer hover:bg-surface-2 ${
                          preview.series === s ? "bg-primary/15 text-primary font-medium" : "text-foreground"
                        }`}
                      >
                        {s}
                      </div>
                    ))}
                    {seriesSearch.trim() && !filteredSeries.includes(seriesSearch.trim()) && (
                      <div
                        onClick={() => {
                          const newName = seriesSearch.trim();
                          saveManagedSeriesName(newName);
                          setPreview({ ...preview, series: newName });
                          setSeriesDropdownOpen(false);
                          setSeriesSearch("");
                        }}
                        className="px-3 py-2 rounded-lg text-xs cursor-pointer bg-primary/10 text-primary font-medium hover:bg-primary/20 flex items-center gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" /> Create "{seriesSearch.trim()}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Category Field (Preserved Intact) */}
              <label className="block">
                <div className="mb-1.5 text-[13px] text-foreground">Category</div>
                <select
                  className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={preview.category_ids?.[0] || ""}
                  onChange={(e) => setPreview({ ...preview, category_ids: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">-- Choose Category (Optional) --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <div className="mb-1.5 text-[13px] text-foreground">Description</div>
                <textarea
                  rows={4}
                  value={preview.description || ""}
                  onChange={(e) => setPreview({ ...preview, description: e.target.value })}
                  className="w-full rounded-lg border hairline bg-background/40 px-3.5 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="mt-6 border-t hairline pt-6">
              <h3 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-3">Detected Resources</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ResourceBadge label="Audio Stream" source="Branham.org" ok={!!preview.audio_url} />
                <ResourceBadge label="Artwork Thumbnail" source="Branham.org" ok={!!preview.artwork_url} />
                <ResourceBadge label="English Transcript" source="Branham.org" ok={!!preview.pdf_english_url} />
                <ResourceBadge label="Telugu Transcript" source="Branham.org" ok={!!preview.pdf_telugu_url} />
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-surface-2/40 p-3 text-xs text-muted-foreground">
              Source URL: <span className="text-foreground">{preview.source_url}</span>
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => handlePublish("draft")}
                disabled={publishMut.isPending}
                className="rounded-full border hairline bg-surface-2/40 px-5 py-2.5 text-sm text-foreground hover:bg-surface-2"
              >
                Save as Draft
              </button>
              <button
                data-testid="import-publish-btn"
                onClick={() => handlePublish("published")}
                disabled={publishMut.isPending}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95 disabled:opacity-70"
              >
                {publishMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" /> Publish
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border hairline bg-card p-5">
              <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Artwork Cover</div>
              <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/25 to-gold/25">
                {preview.artwork_url ? (
                  <img src={preview.artwork_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Play className="h-8 w-8 text-foreground/80" />
                )}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                External image reference (metadata link only). Nothing will be saved to Supabase Storage.
              </div>
            </div>
            <div className="rounded-2xl border hairline bg-card p-5">
              <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Import Characteristics</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-primary" /> streams directly from Branham.org
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-primary" /> No storage consumption
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-primary" /> Verified metadata source
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* No Series Selected Warning Modal */}
      {showNoSeriesWarning && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border hairline bg-card p-6 shadow-glow">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h3 className="font-serif text-xl text-foreground">No Series Selected</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This sermon has not been assigned to a Series. Selecting a series helps listeners discover related sermons easily.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  setShowNoSeriesWarning(false);
                  setSeriesDropdownOpen(true);
                }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow"
              >
                Select Series
              </button>
              <button
                onClick={executePublishNow}
                className="rounded-full border hairline bg-surface-2/60 px-4 py-2 text-sm text-foreground hover:bg-surface-2"
              >
                Continue Without Series
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border hairline bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-serif text-xl text-foreground">This sermon is already in your library</h3>
                <p className="mt-1 text-xs text-muted-foreground">A sermon with matching code, language, or URL already exists.</p>
              </div>
              <button onClick={() => { setDuplicateInfo(null); setRefreshPreviewData(null); }} className="rounded-full p-1 text-muted-foreground hover:bg-surface-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border hairline bg-surface-2/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Code: <strong className="text-foreground font-mono">{duplicateInfo.existing_sermon.sermon_code || "—"}</strong></span>
                <span>Language: <strong className="text-foreground uppercase">{duplicateInfo.existing_sermon.language}</strong></span>
              </div>
              <div className="font-medium text-foreground text-base leading-snug">{duplicateInfo.existing_sermon.title}</div>
              <div className="text-xs text-muted-foreground">Status: <span className="text-primary font-medium">{duplicateInfo.existing_sermon.status}</span></div>
            </div>

            {refreshPreviewData ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="text-xs font-medium text-primary uppercase tracking-wider">Preview Refresh Changes</div>
                {refreshPreviewData.changes_detected ? (
                  <ul className="space-y-1.5 text-xs text-foreground">
                    {refreshPreviewData.changes.map((c, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-primary font-bold">✓</span>
                        <span><strong>{c.field}:</strong> Updated from original web source</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-muted-foreground">No metadata changes detected. Text version history will be preserved.</div>
                )}
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-primary/10">
                  🛡️ <strong>User Data Protection Guarantee:</strong> Notes, Highlights, Favorites, Bookmarks, and Reading Progress will be 100% preserved.
                </div>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                onClick={() => { setDuplicateInfo(null); setRefreshPreviewData(null); }}
                className="rounded-full border hairline bg-surface-2/60 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-surface-2"
              >
                Cancel
              </button>

              {refreshPreviewData ? (
                <button
                  disabled={isRefreshing}
                  onClick={handleConfirmRefresh}
                  className="rounded-full bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-50"
                >
                  {isRefreshing ? "Refreshing..." : "Confirm Refresh"}
                </button>
              ) : (
                <button
                  disabled={isRefreshing}
                  onClick={handleFetchRefreshPreview}
                  className="rounded-full bg-primary/20 text-primary border border-primary/30 px-4 py-2.5 text-xs font-medium hover:bg-primary/30 disabled:opacity-50"
                >
                  {isRefreshing ? "Analyzing..." : "Refresh Existing Sermon"}
                </button>
              )}

              <button
                onClick={handleCreateDuplicateCopy}
                className="rounded-full border hairline bg-surface-2/40 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                Create Duplicate Copy
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border hairline bg-card">
        <div className="flex items-center justify-between px-6 pt-6">
          <div>
            <h3 className="font-serif text-lg text-foreground">Recent Imports</h3>
            <p className="text-xs text-muted-foreground">The last few sermons pulled in from the web</p>
          </div>
          <Link to="/sermons" className="text-xs text-primary hover:underline">Open Library</Link>
        </div>
        <ul className="mt-4 divide-y hairline">
          {(recentData?.items || []).filter((s) => s.source === "import").length === 0 && (
            <li className="px-6 py-8 text-sm text-muted-foreground">No imports yet.</li>
          )}
          {(recentData?.items || [])
            .filter((s) => s.source === "import")
            .map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-6 py-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <DownloadCloud className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{r.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.source_url}</div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] ${
                    r.status === "published"
                      ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                      : "bg-muted text-muted-foreground ring-1 ring-border"
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[13px] text-foreground">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function ResourceBadge({ label, source, ok }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border hairline px-4 py-3 ${
        ok ? "bg-primary/8 border-primary/20" : "bg-surface-2/40 border-border"
      }`}
    >
      <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold ${ok ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
        {ok ? "✓" : "✗"}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${ok ? "text-foreground" : "text-muted-foreground"}`}>{label}</div>
        {ok ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">via {source}</div>
        ) : (
          <div className="mt-0.5 text-[11px] text-muted-foreground/60">Not available on this page</div>
        )}
      </div>
    </div>
  );
}
