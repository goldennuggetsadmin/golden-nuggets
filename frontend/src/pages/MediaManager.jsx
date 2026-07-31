import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Music2, FileText, ImageIcon, Trash2, HardDrive, UploadCloud, ExternalLink, Search } from "lucide-react";
import { api, formatBytes, MEDIA_FILE_URL } from "@/lib/api";

const KIND_ICON = {
  audio: Music2,
  pdf: FileText,
  artwork: ImageIcon,
  banner: ImageIcon,
  other: FileText,
};

export default function MediaManager() {
  const qc = useQueryClient();
  const [kindFilter, setKindFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: media, isLoading } = useQuery({
    queryKey: ["media", { kindFilter, q, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (kindFilter !== "all") params.set("kind", kindFilter);
      if (q) params.set("q", q);
      params.set("page", page);
      params.set("page_size", pageSize);
      return (await api.get(`/admin/media?${params}`)).data;
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["media-usage"],
    queryFn: async () => (await api.get(`/admin/media/usage`)).data,
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/media/${id}`),
    onSuccess: () => {
      toast.success("File deleted");
      qc.invalidateQueries({ queryKey: ["media"] });
      qc.invalidateQueries({ queryKey: ["media-usage"] });
    },
  });

  const uploadMut = useMutation({
    mutationFn: async ({ file, kind }) => {
      const fd = new FormData();
      fd.append("file", file);
      return (await api.post(`/admin/media/upload?kind=${kind}`, fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: () => {
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["media"] });
      qc.invalidateQueries({ queryKey: ["media-usage"] });
    },
    onError: () => toast.error("Upload failed"),
  });

  const items = media?.items || [];

  return (
    <div data-testid="media-page" className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Vault</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Media Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">Audio, PDFs, artwork, and banners in one place.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95">
          <UploadCloud className="h-4 w-4" /> Upload File
          <input
            data-testid="media-upload-input"
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const type = f.type;
              const kind = type.startsWith("audio")
                ? "audio"
                : type === "application/pdf"
                  ? "pdf"
                  : type.startsWith("image")
                    ? "artwork"
                    : "other";
              uploadMut.mutate({ file: f, kind });
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UsageCard label="Total" icon={HardDrive} value={formatBytes(usage?.total_bytes || 0)} />
        <UsageCard label="Audio" icon={Music2} value={formatBytes(usage?.by_kind?.audio || 0)} />
        <UsageCard label="PDFs" icon={FileText} value={formatBytes(usage?.by_kind?.pdf || 0)} />
        <UsageCard label="Images" icon={ImageIcon} value={formatBytes((usage?.by_kind?.artwork || 0) + (usage?.by_kind?.banner || 0))} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border hairline bg-card p-3">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground mr-2">Filter</span>
          {["all", "audio", "pdf", "artwork", "banner", "other"].map((k) => (
            <button
              key={k}
              data-testid={`filter-media-${k}`}
              onClick={() => { setKindFilter(k); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                kindFilter === k ? "bg-primary/15 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative min-w-[240px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setQ(e.currentTarget.value);
                setPage(1);
              }
            }}
            placeholder="Search filenames…"
            className="h-10 w-full rounded-lg border hairline bg-background/40 pl-10 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border hairline bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b hairline text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-3 pl-5 pr-2 font-normal">File</th>
                <th className="py-3 font-normal">Type</th>
                <th className="py-3 font-normal">Size</th>
                <th className="py-3 font-normal">Uploaded</th>
                <th className="py-3 pr-5 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                    No media yet.
                  </td>
                </tr>
              )}
              {items.map((m) => {
                const Icon = KIND_ICON[m.kind] || FileText;
                return (
                  <tr key={m.id} data-testid={`media-row-${m.id}`} className="border-b hairline last:border-b-0 hover:bg-surface-2/40">
                    <td className="py-4 pl-5 pr-2">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm text-foreground">{m.original_filename}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{m.storage_path}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-muted-foreground">{m.kind}</td>
                    <td className="py-4 tabular-nums text-muted-foreground">{formatBytes(m.size)}</td>
                    <td className="py-4 text-muted-foreground">{m.created_at ? m.created_at.slice(0, 10) : "—"}</td>
                    <td className="py-4 pr-5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <a
                          href={MEDIA_FILE_URL(m.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                          title="Preview"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => window.confirm("Delete this file?") && delMut.mutate(m.id)}
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t hairline px-5 py-3 text-xs text-muted-foreground">
          <span>
            Showing {items.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + items.length} of {media?.total || 0}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-md px-3 py-1 hover:bg-surface-2">
              Prev
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil((media?.total || 0) / pageSize))}
            </span>
            <button onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil((media?.total || 0) / pageSize)), p + 1))} className="rounded-md px-3 py-1 hover:bg-surface-2">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageCard({ label, icon: Icon, value }) {
  return (
    <div className="rounded-2xl border hairline bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      <div className="mt-4 font-serif text-2xl text-foreground">{value}</div>
      <div className="mt-1 text-[13px] text-muted-foreground">{label}</div>
    </div>
  );
}
