import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FolderKanban, Loader2, X, Search } from "lucide-react";
import { api } from "@/lib/api";

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function Categories() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {id,...} = edit
  const [q, setQ] = useState("");
  
  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get(`/admin/categories`)).data,
  });

  const allItems = data?.items || [];
  const items = allItems.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.slug.toLowerCase().includes(q.toLowerCase()));

  const saveMut = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) return (await api.patch(`/admin/categories/${payload.id}`, payload)).data;
      return (await api.post(`/admin/categories`, payload)).data;
    },
    onSuccess: () => {
      toast.success("Category saved");
      qc.invalidateQueries({ queryKey: ["categories"] });
      setEditing(null);
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/categories/${id}`),
    onSuccess: () => {
      toast.success("Category deleted");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  return (
    <div data-testid="categories-page" className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Organize</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group sermons under topics so listeners find what they need.
          </p>
        </div>
        <button
          data-testid="add-category-btn"
          onClick={() => setEditing({})}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> Add Category
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border hairline bg-card p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search categories…"
            className="h-10 w-full rounded-lg border hairline bg-background/40 pl-10 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <div className="rounded-2xl border hairline bg-card p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="rounded-2xl border hairline bg-card p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            No categories yet. Add your first one.
          </div>
        )}
        {items.map((c) => (
          <div key={c.id} className="group rounded-2xl border hairline bg-card p-5 transition hover:border-primary/30">
            <div className="flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary">
                <FolderKanban className="h-[18px] w-[18px]" />
              </div>
              <span className="rounded-full bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border">
                {c.sermon_count || 0} sermons
              </span>
            </div>
            <div className="mt-4 font-serif text-lg text-foreground">{c.name}</div>
            <div className="text-xs text-muted-foreground">/{c.slug}</div>
            {c.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
            <div className="mt-5 flex items-center justify-between border-t hairline pt-4">
              <button
                data-testid={`edit-cat-${c.id}`}
                onClick={() => setEditing(c)}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                data-testid={`delete-cat-${c.id}`}
                onClick={() => window.confirm("Delete this category?") && delMut.mutate(c.id)}
                className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <CategoryModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => saveMut.mutate(v)}
          busy={saveMut.isPending}
        />
      )}
    </div>
  );
}

function CategoryModal({ initial, onClose, onSave, busy }) {
  const [form, setForm] = useState({
    id: initial.id,
    name: initial.name || "",
    slug: initial.slug || "",
    description: initial.description || "",
    color: initial.color || "",
  });

  const setName = (name) =>
    setForm((f) => ({ ...f, name, slug: f.id ? f.slug : slugify(name) }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border hairline bg-card p-6 shadow-glow">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-foreground">
            {form.id ? "Edit category" : "New category"}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Name</div>
            <input
              data-testid="cat-name-input"
              value={form.name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Slug</div>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
              className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Description</div>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border hairline bg-background/40 px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border hairline bg-surface-2/40 px-4 py-2 text-sm text-foreground hover:bg-surface-2">
            Cancel
          </button>
          <button
            data-testid="cat-save-btn"
            disabled={busy || !form.name.trim() || !form.slug.trim()}
            onClick={() => onSave(form)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-70"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
