import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Filter, Download, MoreHorizontal, Play, ChevronLeft, ChevronRight,
  ArrowUpDown, CheckCircle2, Circle, Eye, Pencil, Trash2, DownloadCloud, Star, StarOff,
  Send, Undo2,
} from "lucide-react";
import { api } from "@/lib/api";

function BulkCategoryPicker({ onAssign }) {
  const { data } = useQuery({
    queryKey: ["cats-picker-min"],
    queryFn: async () => (await api.get(`/admin/categories`)).data,
  });
  return (
    <select
      onChange={(e) => {
        if (e.target.value) {
          onAssign(e.target.value);
          e.target.value = "";
        }
      }}
      defaultValue=""
      className="h-8 rounded-full border hairline bg-surface-2/60 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">Assign category…</option>
      {(data?.items || []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

const STATUS_STYLE = {
  published: "bg-primary/15 text-primary ring-1 ring-primary/20",
  draft: "bg-muted text-muted-foreground ring-1 ring-border",
  scheduled: "bg-gold/15 text-gold ring-1 ring-gold/25",
};

function resourceHealth(r) {
  if (!r.audio_url) return { dot: "bg-amber-500", label: "Missing audio" };
  if (!r.artwork_url) return { dot: "bg-blue-400/70", label: "Missing artwork" };
  return { dot: "bg-emerald-500", label: "Healthy" };
}

export default function SermonsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState(new Set());
  const [openMenu, setOpenMenu] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const q = searchParams.get("q") || "";
  const language = searchParams.get("language") || "";
  const year = searchParams.get("year") || "";

  const LANG_LABELS = { en: "English", te: "Telugu", hi: "Hindi", ta: "Tamil" };
  const langLabel = (code) => LANG_LABELS[code] || code;

  const qc = useQueryClient();

  const { data: yearsData } = useQuery({
    queryKey: ["sermons-years"],
    queryFn: async () => (await api.get("/admin/sermons/years")).data,
  });
  const availableYears = yearsData?.items || [];

  const { data, isLoading } = useQuery({
    queryKey: ["sermons", { q, year, language, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (year) params.set("year", year);
      if (language) params.set("language", language);
      params.set("page", page);
      params.set("page_size", pageSize);
      return (await api.get(`/admin/sermons?${params}`)).data;
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (!val) next.delete(key);
    else next.set(key, val);
    setSearchParams(next);
    setPage(1);
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };
  const toggleOne = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/sermons/${id}`),
    onSuccess: () => {
      toast.success("Sermon deleted");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () => toast.error("Failed to delete sermon"),
  });

  const featureMut = useMutation({
    mutationFn: (id) => api.post(`/admin/sermons/${id}/toggle-featured`),
    onSuccess: () => {
      toast.success("Featured updated");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const publishMut = useMutation({
    mutationFn: ({ id, action }) => api.post(`/admin/sermons/${id}/${action}`),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const bulkMut = useMutation({
    mutationFn: ({ action, category_id }) =>
      api.post(`/admin/sermons/bulk`, { ids: [...selected], action, category_id }),
    onSuccess: (_, vars) => {
      toast.success(`Bulk ${vars.action} complete`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  return (
    <div data-testid="sermons-page" className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Library</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Sermon Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString()} sermons in your library
          </p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-4 py-2.5 text-sm text-foreground hover:bg-surface-2">
            <Download className="h-4 w-4" /> Export
          </button>
          <Link
            to="/import"
            className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/40 px-4 py-2.5 text-sm text-foreground hover:bg-surface-2"
          >
            <DownloadCloud className="h-4 w-4" /> Import from URL
          </Link>
          <Link
            data-testid="create-sermon-btn"
            to="/sermons/new"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> Create Manually
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border hairline bg-card p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="sermons-search-input"
            defaultValue={q}
            onKeyDown={(e) => e.key === "Enter" && setParam("q", e.currentTarget.value)}
            placeholder="Search by title, speaker, series, description"
            className="h-10 w-full rounded-lg border hairline bg-background/40 pl-10 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          data-testid="filter-year"
          value={year}
          onChange={(e) => setParam("year", e.target.value)}
          className="h-10 rounded-lg border hairline bg-background/40 px-3 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Years</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          data-testid="filter-language"
          value={language}
          onChange={(e) => setParam("language", e.target.value)}
          className="h-10 rounded-lg border hairline bg-background/40 px-3 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Languages</option>
          <option value="en">English</option>
          <option value="te">Telugu</option>
          <option value="hi">Hindi</option>
          <option value="ta">Tamil</option>
        </select>
        {(year || language || q) && (
          <button
            onClick={() => {
              setSearchParams({});
              setPage(1);
            }}
            className="inline-flex items-center gap-2 rounded-lg border hairline bg-background/40 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Filter className="h-4 w-4" /> Reset
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div data-testid="bulk-actions-bar" className="flex flex-wrap items-center gap-2 rounded-2xl border hairline bg-card p-3">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => bulkMut.mutate({ action: "publish" })}
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/60 px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
            >
              <Send className="h-3.5 w-3.5" /> Publish
            </button>
            <button
              onClick={() => bulkMut.mutate({ action: "unpublish" })}
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/60 px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
            >
              <Undo2 className="h-3.5 w-3.5" /> Unpublish
            </button>
            <button
              onClick={() => bulkMut.mutate({ action: "feature" })}
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/60 px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
            >
              <Star className="h-3.5 w-3.5" /> Feature
            </button>
            <BulkCategoryPicker onAssign={(cid) => bulkMut.mutate({ action: "assign-category", category_id: cid })} />
            <button
              onClick={() => bulkMut.mutate({ action: "archive" })}
              className="inline-flex items-center gap-2 rounded-full border hairline bg-surface-2/60 px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
            >
              <Trash2 className="h-3.5 w-3.5" /> Archive
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${selected.size} sermons?`)) bulkMut.mutate({ action: "delete" });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {isLoading && (
          <div className="rounded-2xl border hairline bg-card p-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="rounded-2xl border hairline bg-card p-12 text-center text-sm text-muted-foreground">
            No sermons found. Try importing from a URL or creating one manually.
          </div>
        )}
        {!isLoading &&
          items.map((r) => {
            const on = selected.has(r.id);
            const metaStr = [r.year, r.language ? langLabel(r.language) : null, r.duration].filter(Boolean).join(" • ");
            const health = resourceHealth(r);
            return (
              <div
                key={r.id}
                data-testid={`sermon-row-${r.id}`}
                className="group relative rounded-2xl border hairline bg-card p-5 transition hover:border-primary/30 hover:bg-surface-2/20"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Select + Title + Speaker */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      onClick={() => toggleOne(r.id)}
                      aria-label="Select"
                      className="mt-1 shrink-0"
                    >
                      {on ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary" />
                      )}
                    </button>

                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/25 to-gold/20">
                      {r.artwork_url ? (
                        <img src={r.artwork_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Play className="h-5 w-5 text-foreground/80" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif text-lg text-foreground leading-snug break-words">
                          {r.title}
                        </h3>
                        <span
                          title={health.label}
                          className={`h-2 w-2 shrink-0 rounded-full ${health.dot}`}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
                        {r.speaker || "William Branham"}
                      </p>

                      {/* Metadata Row */}
                      <div className="pt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                        <span>{metaStr || "—"}</span>
                      </div>

                      {/* Badges Row */}
                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        {r.series && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-foreground ring-1 ring-border">
                            Series: {r.series}
                          </span>
                        )}
                        {r.source === "import" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2.5 py-0.5 text-[11px] text-gold ring-1 ring-gold/25">
                            <DownloadCloud className="h-3 w-3" /> Branham.org
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
                            Manual Upload
                          </span>
                        )}
                        {r.featured && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] text-gold ring-1 ring-gold/25 font-medium">
                            <Star className="h-3 w-3 fill-current" /> Featured
                          </span>
                        )}
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${STATUS_STYLE[r.status] || STATUS_STYLE.draft}`}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Right Side */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => featureMut.mutate(r.id)}
                      className={`p-2 rounded-full hover:bg-surface-2 ${r.featured ? "text-gold" : "text-muted-foreground/40 hover:text-foreground"}`}
                      aria-label="Toggle featured"
                    >
                      {r.featured ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                    </button>

                    <div className="relative">
                      <button
                        data-testid={`sermon-menu-${r.id}`}
                        onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}
                        className="rounded-full p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openMenu === r.id && (
                        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border hairline bg-card shadow-glow">
                          <Link
                            to={`/sermons/${r.id}/edit`}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-surface-2"
                            onClick={() => setOpenMenu(null)}
                          >
                            <Eye className="h-4 w-4" /> View / Edit
                          </Link>
                          <button
                            onClick={() => {
                              publishMut.mutate({ id: r.id, action: r.status === "published" ? "unpublish" : "publish" });
                              setOpenMenu(null);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-surface-2"
                          >
                            <Pencil className="h-4 w-4" /> {r.status === "published" ? "Unpublish" : "Publish"}
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm("Delete this sermon?")) delMut.mutate(r.id);
                              setOpenMenu(null);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-destructive transition hover:bg-surface-2"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="flex items-center justify-between rounded-2xl border hairline bg-card px-5 py-3 text-xs text-muted-foreground">
        <span>
          Showing {items.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + items.length} of {total}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-2">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-2">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
