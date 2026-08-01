import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sliders, HardDrive, Smartphone, Bell, DownloadCloud, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const TABS = [
  { key: "general", label: "General", icon: Sliders },
  { key: "storage", label: "Storage", icon: HardDrive },
  { key: "application", label: "Application", icon: Smartphone },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "import", label: "Import Settings", icon: DownloadCloud },
];

const FIELDS = {
  general: {
    title: "General",
    blurb: "The basics of your ministry across web and mobile.",
    fields: [
      { key: "ministry_name", label: "Ministry name", hint: "Shown throughout the app and emails." },
      { key: "support_email", label: "Support email", hint: "Where members reach your team." },
      { key: "default_language", label: "Default language", hint: "Fallback language for new content." },
    ],
    toggle: { key: "weekly_banner", label: "Show weekly encouragement banner", hint: "Display a gentle verse on the mobile home screen every Sunday." },
  },
  storage: {
    title: "Storage",
    blurb: "Media backup and quality controls.",
    fields: [
      { key: "storage_plan", label: "Storage plan", hint: "Ministry · 200 GB (via object storage)." },
      { key: "backup_schedule", label: "Backup schedule", hint: "Every night at 2:00 am." },
      { key: "media_quality", label: "Media quality", hint: "Higher quality uses more storage." },
    ],
    toggle: { key: "keep_originals", label: "Keep original files after import", hint: "Store the untouched source files as a safety net." },
  },
  application: {
    title: "Application",
    blurb: "How the mobile app behaves for your congregation.",
    fields: [
      { key: "app_name", label: "App name", hint: "Shown on the phone home screen." },
      { key: "home_banner", label: "Home screen banner", hint: "Featured card at the top of the mobile app." },
      { key: "default_sort", label: "Default sermon sort", hint: "How sermons are ordered in the library." },
    ],
    toggle: { key: "offline_downloads", label: "Allow offline downloads", hint: "Let listeners save sermons for offline playback." },
  },
  notifications: {
    title: "Notifications",
    blurb: "Choose when to notify your congregation.",
    fields: [
      { key: "notify_before_meeting", label: "Notify before meetings", hint: "How long before a meeting to remind users." },
      { key: "quiet_hours", label: "Quiet hours", hint: "No notifications during this window." },
    ],
    toggle: { key: "notify_new_sermon", label: "Notify on new sermon", hint: "Push notification whenever a sermon is published." },
    toggle2: { key: "auto_meeting_reminders", label: "Send meeting reminders automatically", hint: "Reminders go out based on each meeting's time." },
  },
  import: {
    title: "Import Settings",
    blurb: "How the admin handles sermons imported from a URL.",
    fields: [
      { key: "default_import_status", label: "Default status after import", hint: "New imports land here until you publish." },
    ],
    toggle: { key: "auto_download_pdfs", label: "Auto-link PDF URLs", hint: "Detect English and Telugu transcripts when available." },
    toggle2: { key: "auto_download_artwork", label: "Auto-link artwork", hint: "Use the artwork detected on the source page." },
    toggle3: { key: "auto_publish_trusted", label: "Auto-publish trusted sources", hint: "Skip the preview step for sermons from branham.org." },
  },
};

export default function SettingsPage() {
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState({});
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get(`/admin/settings`)).data,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async (payload) => (await api.patch(`/admin/settings`, payload)).data,
    onSuccess: (updated) => {
      toast.success("Settings saved");
      setForm(updated);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const cfg = FIELDS[tab];

  return (
    <div data-testid="settings-page" className="mx-auto max-w-[1200px] space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Configure</p>
        <h1 className="mt-2 font-serif text-3xl text-foreground">Settings</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-1 rounded-2xl border hairline bg-card p-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                data-testid={`settings-tab-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  on ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${on ? "text-primary" : ""}`} />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="rounded-2xl border hairline bg-card p-6 lg:p-8">
          <h2 className="font-serif text-xl text-foreground">{cfg.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{cfg.blurb}</p>

          {isLoading ? (
            <div className="mt-8 grid place-items-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {cfg.fields.map((f) => (
                <div key={f.key} className="flex flex-wrap items-center justify-between gap-4 border-b hairline pb-5">
                  <div>
                    <div className="text-sm text-foreground">{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.hint}</div>
                  </div>
                  <input
                    data-testid={`setting-${f.key}`}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="h-10 min-w-[260px] rounded-lg border hairline bg-background/40 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}

              {["toggle", "toggle2", "toggle3"]
                .filter((tk) => cfg[tk])
                .map((tk) => {
                  const tg = cfg[tk];
                  const active = !!form[tg.key];
                  return (
                    <div key={tg.key} className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-foreground">{tg.label}</div>
                        <div className="text-xs text-muted-foreground">{tg.hint}</div>
                      </div>
                      <button
                        data-testid={`toggle-${tg.key}`}
                        onClick={() => setForm({ ...form, [tg.key]: !active })}
                        className={`relative h-6 w-11 rounded-full transition ${active ? "bg-primary/80" : "bg-surface-2"}`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-foreground shadow transition-all ${
                            active ? "right-0.5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}

              <div className="pt-2">
                <button
                  data-testid="save-settings-btn"
                  onClick={() => saveMut.mutate(form)}
                  disabled={saveMut.isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95 disabled:opacity-70"
                >
                  {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
