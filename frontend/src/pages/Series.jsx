import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, Loader2, X, Search, GripVertical } from "lucide-react";
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
  try {
    const raw = localStorage.getItem(MANAGED_SERIES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    // Sanitize & deduplicate case-insensitively
    const seen = new Set();
    const cleanList = [];
    let dirty = false;
    for (const item of list) {
      const normalized = normalizeSeriesName(item);
      if (!normalized) {
        dirty = true;
        continue;
      }
      const key = canonicalKey(normalized);
      if (!seen.has(key)) {
        seen.add(key);
        cleanList.push(normalized);
      } else {
        dirty = true;
      }
    }
    if (dirty) {
      localStorage.setItem(MANAGED_SERIES_KEY, JSON.stringify(cleanList));
    }
    return cleanList;
  } catch {
    return [];
  }
}

export function saveManagedSeriesName(name) {
  const normalized = normalizeSeriesName(name);
  if (!normalized) return;
  const list = getManagedSeriesList();
  const key = canonicalKey(normalized);
  if (!list.some((item) => canonicalKey(item) === key)) {
    list.push(normalized);
    localStorage.setItem(MANAGED_SERIES_KEY, JSON.stringify(list));
  }
}

// ── Sortable Row ──────────────────────────────────────────────────────────────
function SortableSeriesRow({ item, onEdit, onDelete, isDragging }) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-4 transition hover:bg-surface-2/40"
    >
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
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <Layers className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-serif text-lg text-foreground truncate">{toTitleCase(item.name)}</div>
          <div className="text-xs text-gold">{item.count} Sermon{item.count !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
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

  const { data: sermonsData, isLoading } = useQuery({
    queryKey: ["sermons-all-series"],
    queryFn: async () => (await api.get(`/admin/sermons?page_size=9999`)).data,
  });

  const allSermons = sermonsData?.items || [];

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

    allSermons.forEach((sermon) => {
      if (sermon.series && sermon.series.trim()) {
        const norm = normalizeSeriesName(sermon.series);
        const key = canonicalKey(norm);
        if (!keyToDisplay[key]) keyToDisplay[key] = norm;
        map[key] = (map[key] || 0) + 1;
      }
    });

    const result = {};
    Object.keys(map).forEach((key) => {
      const displayName = keyToDisplay[key] || key;
      result[displayName] = map[key];
    });
    return result;
  }, [allSermons, managedList]);

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
        ...allSermons.filter((s) => s.series).map((s) => canonicalKey(s.series)),
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
        const toUpdate = allSermons.filter((s) => s.series && canonicalKey(s.series) === oldKey);
        await Promise.all(toUpdate.map((s) => api.patch(`/admin/sermons/${s.id}`, { series: trimmed })));
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

      const toUpdate = allSermons.filter((s) => s.series && canonicalKey(s.series) === delKey);
      await Promise.all(toUpdate.map((s) => api.patch(`/admin/sermons/${s.id}`, { series: "" })));
    },
    onSuccess: () => {
      toast.success("Series deleted");
      qc.invalidateQueries({ queryKey: ["sermons"] });
      qc.invalidateQueries({ queryKey: ["sermons-all-series"] });
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
