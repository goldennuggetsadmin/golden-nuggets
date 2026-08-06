import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, Loader2, X, Search, GripVertical, Eye, ChevronDown, ChevronUp, XCircle, FileText } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";

const MANAGED_SERIES_KEY = "gn_managed_series_list";

/** The ONLY valid series that may exist in Golden Nuggets.
 *  These are the 14 predefined ministry series. No others are allowed.
 */
export const PREDEFINED_SERIES = [
  "General",
  "My Life Story",
  "How the Angel Came to Me",
  "The Revelation of the Seven Seals",
  "The Revelation of Jesus Christ",
  "Conduct, Order, and Doctrine of the Church",
  "The Book of Hebrews",
  "The Holy Ghost",
  "Adoption",
  "The Seventy Weeks of Daniel",
  "The Church",
  "Demonology",
  "Israel and the Church",
  "The Church Age Book (audio)",
];

/** Sermon-code pattern: e.g. 47-0412, 50-0820A — NEVER a valid series name */
const SERMON_CODE_PATTERN = /^\d{2}-\d{4}[A-Za-z]?$/;

/** Convert any string to Title Case */
function toTitleCase(str) {
  if (!str) return str;
  const minor = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "at", "by", "in", "of", "on", "to", "up", "as", "is", "it"]);
  return str
    .split(" ")
    .map((word, i) =>
      i === 0 || !minor.has(word.toLowerCase())
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word.toLowerCase()
    )
    .join(" ");
}

export function normalizeSeriesName(str) {
  return str ? str.trim().replace(/\s+/g, " ") : "";
}

export function canonicalKey(str) {
  return normalizeSeriesName(str).toLowerCase();
}

export function getManagedSeriesList() {
  // Always return the locked predefined list — no localStorage overrides allowed.
  // This guarantees only the 14 canonical series exist in any dropdown.
  return PREDEFINED_SERIES.slice();
}

/**
 * saveManagedSeriesName is kept for API compatibility but is now a no-op.
 * The series list is permanently locked to PREDEFINED_SERIES.
 * Sermon codes and ad-hoc names are silently rejected.
 */
export function saveManagedSeriesName(name) {
  const normalized = normalizeSeriesName(name);
  if (!normalized) return;
  // Block sermon codes (e.g. 47-0412, 50-0820A)
  if (SERMON_CODE_PATTERN.test(normalized)) {
    console.warn(`[Series] Rejected invalid series name (sermon code): "${normalized}"`);
    return;
  }
  // Block names not in the predefined list
  if (!PREDEFINED_SERIES.some((s) => canonicalKey(s) === canonicalKey(normalized))) {
    console.warn(`[Series] Rejected unknown series name: "${normalized}". Only predefined series are allowed.`);
    return;
  }
  // No-op: list is already locked to PREDEFINED_SERIES
}

// ── Sortable Row ──────────────────────────────────────────────────────────────
function SortableSeriesRow({ item, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSelfDragging,
  } = useSortable({ id: item.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSelfDragging ? 0.4 : 1,
  };

  const { data: sermonsData, isLoading: isLoadingSermons } = useQuery({
    queryKey: ["sermons-in-series", item.name],
    queryFn: async () => {
      const res = await api.get(`/admin/sermons?series=${encodeURIComponent(item.name)}&limit=100`);
      return res.data?.items || res.data || [];
    },
    enabled: expanded,
  });

  const removeSermonMut = useMutation({
    mutationFn: async (sermonId) => {
      await api.patch(`/admin/sermons/${sermonId}`, { series: "General" });
    },
    onSuccess: () => {
      toast.success("Sermon removed from series");
      qc.invalidateQueries({ queryKey: ["sermons-in-series", item.name] });
      qc.invalidateQueries({ queryKey: ["sermons-series-lookup"] });
      qc.invalidateQueries({ queryKey: ["sermons"] });
    },
    onError: () => toast.error("Failed to remove sermon from series"),
  });

  return (
    <div ref={setNodeRef} style={style} className="divide-y hairline">
      <div className="flex items-center justify-between p-4 transition hover:bg-surface-2/40">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="mr-3 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground transition active:cursor-grabbing"
          aria-label="Reorder"
          tabIndex={0}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        {/* Series Icon + Info */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-4 min-w-0 flex-1 cursor-pointer select-none"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-serif text-lg text-foreground truncate flex items-center gap-2">
              {toTitleCase(item.name)}
              {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="text-xs text-gold">{item.count} Sermon{item.count !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <Eye className="h-3.5 w-3.5" /> {expanded ? "Hide Sermons" : "View Sermons"}
          </button>
          <button
            onClick={() => onEdit(item)}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete series "${toTitleCase(item.name)}"?\n\nThis will clear the series from all associated sermons.`)) {
                onDelete(item.name);
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Expandable Sermon List Panel */}
      {expanded && (
        <div className="bg-surface-1/50 p-4 pl-14 space-y-3 border-t hairline">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sermons inside "{toTitleCase(item.name)}" ({sermonsData?.length || 0})
            </h4>
          </div>

          {isLoadingSermons ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sermons...
            </div>
          ) : !sermonsData || sermonsData.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 italic">
              No sermons found in this series.
            </div>
          ) : (
            <div className="divide-y hairline rounded-xl border hairline bg-card/60 overflow-hidden max-h-[350px] overflow-y-auto">
              {sermonsData.map((sermon) => (
                <div key={sermon.id} className="flex items-center justify-between p-3 text-xs hover:bg-surface-2/30 transition">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="h-4 w-4 shrink-0 text-gold" />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {sermon.sermon_code ? <span className="text-gold font-mono mr-2">[{sermon.sermon_code}]</span> : null}
                        {sermon.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {sermon.speaker || "Rev. William Marrion Branham"} • {sermon.date || sermon.year || "Unknown Date"}
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={removeSermonMut.isPending}
                    onClick={() => {
                      if (window.confirm(`Remove "${sermon.title}" from "${item.name}" series?`)) {
                        removeSermonMut.mutate(sermon.id);
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-lg transition"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Remove from Series
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SeriesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const [managedList, setManagedList] = useState(getManagedSeriesList());
  const [activeDragName, setActiveDragName] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: seriesLookupData, isLoading } = useQuery({
    queryKey: ["sermons-series-lookup"],
    queryFn: async () => {
      try {
        return (await api.get("/admin/sermons/series-lookup")).data;
      } catch {
        return (await api.get("/admin/sermons?page_size=200")).data;
      }
    },
  });

  const seriesLookupList = useMemo(() => seriesLookupData?.items || [], [seriesLookupData]);

  const seriesMap = useMemo(() => {
    const map = {};
    const keyToDisplay = {};

    managedList.forEach((s) => {
      if (s) {
        const key = canonicalKey(s);
        keyToDisplay[key] = normalizeSeriesName(s);
        map[key] = 0;
      }
    });

    seriesLookupList.forEach((item) => {
      const seriesName = typeof item === "string" ? item : item.name;
      const count = typeof item === "string" ? 1 : (item.count || 0);
      if (seriesName && seriesName.trim()) {
        const norm = normalizeSeriesName(seriesName);
        const key = canonicalKey(norm);
        if (!keyToDisplay[key]) keyToDisplay[key] = norm;
        map[key] = (map[key] || 0) + count;
      }
    });

    const result = {};
    Object.keys(map).forEach((key) => {
      const displayName = keyToDisplay[key] || key;
      result[displayName] = map[key];
    });
    return result;
  }, [seriesLookupList, managedList]);

  // Ordered series items (respects managedList order for names that appear there)
  const seriesItems = useMemo(() => {
    const allNames = Object.keys(seriesMap);
    const managedKeys = new Set(managedList.map((n) => canonicalKey(n)));
    
    // De-duplicate managed list names by canonicalKey preserving order
    const seenManaged = new Set();
    const orderedManaged = [];
    managedList.forEach((n) => {
      const key = canonicalKey(n);
      if (n && seriesMap[n] !== undefined && !seenManaged.has(key)) {
        seenManaged.add(key);
        orderedManaged.push(n);
      }
    });

    const unmanaged = allNames
      .filter((n) => !managedKeys.has(canonicalKey(n)))
      .sort((a, b) => a.localeCompare(b));

    const ordered = [...orderedManaged, ...unmanaged];
    return ordered
      .map((name) => ({ name, count: seriesMap[name] ?? 0 }))
      .filter((item) => item.name.toLowerCase().includes(q.toLowerCase()));
  }, [seriesMap, managedList, q]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const saveSeriesMut = useMutation({
    mutationFn: async ({ oldName, newName }) => {
      const trimmed = normalizeSeriesName(newName);
      if (!trimmed) throw new Error("Series name is required.");

      const newKey = canonicalKey(trimmed);
      const oldKey = oldName ? canonicalKey(oldName) : null;

      // Reload latest localStorage state before every mutation to prevent stale state overwrites
      const latestManaged = getManagedSeriesList();
      const allExistingKeys = new Set([
        ...latestManaged.map((n) => canonicalKey(n)),
        ...seriesLookupList.map((item) => canonicalKey(typeof item === "string" ? item : item.name)),
      ]);

      // Collision Check: reject if newKey already exists (excluding the record currently being edited)
      if (oldKey) {
        // Editing existing series
        allExistingKeys.delete(oldKey);
        if (allExistingKeys.has(newKey)) {
          throw new Error("This series already exists.");
        }
      } else {
        // Creating new series
        if (allExistingKeys.has(newKey)) {
          throw new Error("This series already exists.");
        }
      }

      // Order of Operations: Rename in-place / Insert once
      let nextManaged = [];
      if (oldKey) {
        // Replace oldName in-place and strip any accidental duplicates of newKey
        const seen = new Set();
        latestManaged.forEach((n) => {
          const k = canonicalKey(n);
          const replaceTarget = k === oldKey ? trimmed : n;
          const rKey = canonicalKey(replaceTarget);
          if (!seen.has(rKey)) {
            seen.add(rKey);
            nextManaged.push(replaceTarget);
          }
        });
      } else {
        // Create new series once
        nextManaged = [...latestManaged, trimmed];
      }

      // Persist to localStorage
      localStorage.setItem(MANAGED_SERIES_KEY, JSON.stringify(nextManaged));

      // Update sermons referencing old name or case variants
      if (oldKey && oldKey !== newKey) {
        try {
          const { data: searchData } = await api.get(`/admin/sermons?series=${encodeURIComponent(oldName)}&page_size=500`);
          const toUpdate = searchData?.items || [];
          await Promise.all(toUpdate.map((s) => api.patch(`/admin/sermons/${s.id}`, { series: trimmed })));
        } catch {
          // ignore lookup error
        }
      }

      // Refresh UI state
      setManagedList(getManagedSeriesList());
    },
    onSuccess: () => {
      toast.success("Series saved");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["sermons-all-series"] });
      setEditing(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save series");
    },
  });

  const deleteSeriesMut = useMutation({
    mutationFn: async (seriesName) => {
      const delKey = canonicalKey(seriesName);
      const latestManaged = getManagedSeriesList();
      const nextList = latestManaged.filter((s) => canonicalKey(s) !== delKey);
      localStorage.setItem(MANAGED_SERIES_KEY, JSON.stringify(nextList));
      setManagedList(getManagedSeriesList());

      try {
        const { data: searchData } = await api.get(`/admin/sermons?series=${encodeURIComponent(seriesName)}&page_size=500`);
        const toUpdate = searchData?.items || [];
        await Promise.all(toUpdate.map((s) => api.patch(`/admin/sermons/${s.id}`, { series: "" })));
      } catch {
        // ignore lookup error
      }
    },
    onSuccess: () => {
      toast.success("Series deleted");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["sermons-series-lookup"] });
    },
    onError: () => toast.error("Failed to delete series"),
  });

  // ── Drag-and-Drop Handlers ──────────────────────────────────────────────────
  const handleDragStart = ({ active }) => setActiveDragName(active.id);

  const handleDragEnd = ({ active, over }) => {
    setActiveDragName(null);
    if (!over || active.id === over.id) return;

    // Only reorder within the displayed (possibly filtered) list
    const displayedNames = seriesItems.map((i) => i.name);
    const oldIdx = displayedNames.indexOf(active.id);
    const newIdx = displayedNames.indexOf(over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(displayedNames, oldIdx, newIdx);

    // Merge back into managedList preserving names not in displayedNames
    const managedSet = new Set(managedList);
    const displayed = new Set(reordered);
    const notInDisplayed = managedList.filter((n) => !displayed.has(n));
    const newManagedList = [...reordered.filter((n) => managedSet.has(n)), ...notInDisplayed];
    localStorage.setItem(MANAGED_SERIES_KEY, JSON.stringify(newManagedList));
    setManagedList(newManagedList);
    toast.success("Series order updated");
  };

  const activeDragItem = activeDragName ? seriesItems.find((i) => i.name === activeDragName) : null;

  return (
    <div data-testid="series-page" className="mx-auto max-w-[1200px] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Organize</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Series Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage canonical sermon series. Drag rows to reorder — the mobile app will respect this order.
          </p>
        </div>
        <button
          data-testid="add-series-btn"
          onClick={() => setEditing({})}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> Add Series
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border hairline bg-card p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search series…"
            className="h-10 w-full rounded-lg border hairline bg-background/40 pl-10 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-2xl border hairline bg-card p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : seriesItems.length === 0 ? (
        <div className="rounded-2xl border hairline bg-card p-8 text-center text-sm text-muted-foreground">
          No series found. Add your first series above.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={seriesItems.map((i) => i.name)} strategy={verticalListSortingStrategy}>
            <div className="divide-y hairline rounded-2xl border hairline bg-card overflow-hidden">
              {seriesItems.map((item) => (
                <SortableSeriesRow
                  key={item.name}
                  item={item}
                  onEdit={(i) => setEditing(i)}
                  onDelete={(name) => deleteSeriesMut.mutate(name)}
                />
              ))}
            </div>
          </SortableContext>

          {/* Drag overlay — ghost card while dragging */}
          <DragOverlay>
            {activeDragItem ? (
              <div className="flex items-center gap-4 rounded-2xl border hairline bg-card p-4 shadow-glow opacity-95">
                <GripVertical className="h-5 w-5 text-muted-foreground/40" />
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-serif text-lg text-foreground">{toTitleCase(activeDragItem.name)}</div>
                  <div className="text-xs text-gold">{activeDragItem.count} Sermon{activeDragItem.count !== 1 ? "s" : ""}</div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modal */}
      {editing !== null && (
        <SeriesModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(newName) => saveSeriesMut.mutate({ oldName: editing.name, newName })}
          busy={saveSeriesMut.isPending}
        />
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function SeriesModal({ initial, onClose, onSave, busy }) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (busy || isSubmitting || !name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSave(name);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border hairline bg-card p-6 shadow-glow">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-foreground">
            {initial.name ? "Edit Series" : "Add Series"}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">
              Series Name <span className="text-destructive">*</span>
            </div>
            <input
              data-testid="series-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Holy Ghost"
              className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {name.trim() && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Will display as: <span className="text-foreground font-medium">{toTitleCase(name.trim())}</span>
              </p>
            )}
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Description (optional)</div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional overview of this series..."
              className="w-full rounded-lg border hairline bg-background/40 px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border hairline bg-surface-2/40 px-4 py-2 text-sm text-foreground hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            data-testid="series-save-btn"
            disabled={busy || isSubmitting || !name.trim()}
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-70"
          >
            {(busy || isSubmitting) && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial.name ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
