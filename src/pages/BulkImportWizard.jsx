import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  FolderUp, Archive, Play, Pause, Square, RefreshCw, CheckCircle2,
  AlertCircle, FileText, Music, Sparkles, Layers, ShieldCheck, Download,
  Clock, Server, Database, FileCode, Check, Search, Filter, HelpCircle, Link2, X, ArrowRight
} from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";

const DUPLICATE_ACTIONS = [
  { key: "skip", label: "Skip (Default)", desc: "Do not import duplicate sermons" },
  { key: "replace", label: "Replace Complete Sermon", desc: "Overwrite metadata, files, and transcripts" },
  { key: "update_metadata", label: "Update Metadata Only", desc: "Keep existing files & transcripts, update titles/series" },
  { key: "replace_files", label: "Replace Files Only", desc: "Re-upload media files and re-extract transcripts" },
];

const DEFAULT_IMPORT_PROFILES = [
  { id: "english_library", name: "English Library", language: "English", speaker: "William Marrion Branham" },
  { id: "telugu_library", name: "Telugu Library", language: "Telugu", speaker: "William Marrion Branham" },
  { id: "mixed_library", name: "Mixed Library (Auto-Detect)", language: "Mixed", speaker: "William Marrion Branham" },
  { id: "custom", name: "Custom Configuration", language: "English", speaker: "" },
];

export default function BulkImportWizard() {
  const [activeTab, setActiveTab] = useState("wizard"); // wizard | history
  const [activeStep, setActiveStep] = useState(1); // 1: Source, 2: Scan, 3: Preview, 4: Queue
  const [sourceMode, setSourceMode] = useState("urls"); // folder | zip | urls
  const [selectedProfileId, setSelectedProfileId] = useState("english_library");
  const [isDryRun, setIsDryRun] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState("skip");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urlInputText, setUrlInputText] = useState("");

  const [scannedManifest, setScannedManifest] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [showLogsModal, setShowLogsModal] = useState(false);

  const navigate = useNavigate();
  const qc = useQueryClient();

  // Fetch Import Profiles
  const { data: profiles } = useQuery({
    queryKey: ["bulk-import-profiles"],
    queryFn: async () => (await api.get("/admin/import/bulk/profiles")).data,
  });

  // Fetch System Health Checklist
  const { data: healthCheck } = useQuery({
    queryKey: ["bulk-import-health"],
    queryFn: async () => (await api.get("/admin/import/bulk/health-check")).data,
  });

  // Fetch Active Job Poll (if any)
  const { data: activeJob, refetch: refetchActiveJob } = useQuery({
    queryKey: ["bulk-import-active-job", activeJobId],
    queryFn: async () => {
      if (activeJobId) {
        return (await api.get(`/admin/import/bulk/status/${activeJobId}`)).data;
      }
      const active = (await api.get("/admin/import/bulk/active")).data;
      if (active) setActiveJobId(active.id);
      return active;
    },
    refetchInterval: (query) => {
      const job = query.state.data;
      return job && job.status === "running" ? 1000 : false;
    },
  });

  // Fetch Job History
  const { data: historyJobs } = useQuery({
    queryKey: ["bulk-import-history"],
    queryFn: async () => (await api.get("/admin/import/bulk/history")).data,
    enabled: activeTab === "history",
  });

  // Auto-switch to Step 4 if an active job is running or completed
  useEffect(() => {
    if (activeJob && (activeJob.status === "running" || activeJob.status === "paused" || activeJob.status === "completed")) {
      setActiveStep(4);
    }
  }, [activeJob]);

  // Handle Folder Selection Scan
  const handleFolderSelect = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    setIsScanning(true);
    setActiveStep(2);
    toast.info(`Scanning ${rawFiles.length} files...`);

    const manifest = rawFiles.map((f) => ({
      name: f.name,
      size: f.size,
      sha256: ""
    }));

    try {
      const res = await api.post("/admin/import/bulk/scan-manifest", {
        files: manifest,
        profile_id: selectedProfileId
      });
      setScannedManifest(res.data);
      setActiveStep(3);
      toast.success(`Scan complete! ${res.data.summary.total_sermons} sermon pairs matched.`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err) || "Failed to scan folder manifest");
      setActiveStep(1);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle ZIP Archive Upload Scan
  const handleZipUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setActiveStep(2);
    toast.info("Uploading & extracting ZIP archive...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("profile_id", selectedProfileId);

    try {
      const res = await api.post("/admin/import/bulk/upload-zip", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setScannedManifest(res.data);
      setActiveStep(3);
      toast.success(`ZIP extracted cleanly! ${res.data.summary.total_sermons} sermon pairs matched.`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err) || "Failed to extract ZIP archive");
      setActiveStep(1);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle URL Links Scan
  const handleUrlScan = async () => {
    const urls = urlInputText
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http"));

    if (urls.length === 0) {
      toast.error("Please paste at least one valid sermon webpage URL (e.g. https://branham.org/...)");
      return;
    }

    setIsScanning(true);
    setActiveStep(2);
    toast.info(`Fetching & extracting metadata from ${urls.length} sermon links...`);

    try {
      const res = await api.post("/admin/import/bulk/scan-urls", {
        urls: urls,
        profile_id: selectedProfileId
      });
      setScannedManifest(res.data);
      setActiveStep(3);
      toast.success(`Scan complete! ${res.data.summary.total_sermons} sermon pages extracted.`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err) || "Failed to scan sermon links");
      setActiveStep(1);
    } finally {
      setIsScanning(false);
    }
  };

  // Start Bulk Job
  const startJobMut = useMutation({
    mutationFn: async () => {
      const payload = {
        tasks: scannedManifest.tasks,
        options: { duplicate_action: duplicateAction },
        dry_run: isDryRun
      };
      return (await api.post("/admin/import/bulk/start", payload)).data;
    },
    onSuccess: (data) => {
      setActiveJobId(data.id);
      setActiveStep(4);
      toast.success(isDryRun ? "Dry run initiated!" : "Bulk import job started!");
    },
    onError: (err) => toast.error(formatApiErrorDetail(err) || "Failed to start bulk import job")
  });

  // Pause / Resume / Stop Controls
  const controlMut = useMutation({
    mutationFn: async (action) => {
      if (!activeJobId) return;
      return (await api.post(`/admin/import/bulk/${action}/${activeJobId}`)).data;
    },
    onSuccess: () => {
      refetchActiveJob();
      qc.invalidateQueries(["bulk-import-active-job"]);
    }
  });

  // Filtered Tasks for Step 3 Preview Table
  const filteredTasks = useMemo(() => {
    if (!scannedManifest?.tasks) return [];
    return scannedManifest.tasks.filter((t) => {
      const matchQuery = !searchQuery ||
        (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.sermon_code && t.sermon_code.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [scannedManifest, searchQuery, statusFilter]);

  const selectedProfile = (profiles || DEFAULT_IMPORT_PROFILES).find((p) => p.id === selectedProfileId);

  // Safe Progress Metrics Calculation (Prevents NaN%)
  const processedCount = activeJob?.processed_count ?? activeJob?.completed_tasks ?? 0;
  const totalCount = activeJob?.total_count ?? activeJob?.total_tasks ?? 0;
  const progressPercent = totalCount > 0 ? Math.min(100, Math.round((processedCount / totalCount) * 100)) : 0;
  const importedCount = activeJob?.imported_count ?? activeJob?.approved_count ?? 0;
  const skippedCount = activeJob?.skipped_count ?? activeJob?.needs_review_count ?? 0;
  const failedCount = activeJob?.failed_count ?? activeJob?.failed_tasks ?? 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-6">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Bulk Import Wizard</h1>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2.5 py-0.5 rounded-full font-medium">
              Enterprise v2.0
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Batch-import 1,200+ sermons via URL links, local folder, or ZIP archive with dry-run validation & live progress tracking.
          </p>
        </div>

        {/* Primary Tabs */}
        <div className="flex items-center gap-2 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setActiveTab("wizard")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "wizard" ? "bg-emerald-500 text-zinc-950 font-bold" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            Import Wizard
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "history" ? "bg-emerald-500 text-zinc-950 font-bold" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            Job History
          </button>
        </div>
      </div>

      {activeTab === "wizard" && (
        <div className="space-y-6">
          {/* Import Profile Selector Strip */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Select Import Profile</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(profiles || DEFAULT_IMPORT_PROFILES).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProfileId(p.id)}
                  className={`p-3 rounded-lg border text-left text-xs transition-all ${
                    selectedProfileId === p.id
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 font-bold"
                      : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="font-semibold text-zinc-200">{p.name}</div>
                  <div className="text-[10px] text-zinc-500 mt-1">{p.language} • {p.speaker || "Branham"}</div>
                </button>
              ))}
            </div>

            {/* Source Mode Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-zinc-800/80">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSourceMode("urls")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                    sourceMode === "urls" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" /> Paste URL Links
                </button>
                <button
                  onClick={() => setSourceMode("folder")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                    sourceMode === "folder" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <FolderUp className="w-3.5 h-3.5" /> Folder Upload
                </button>
                <button
                  onClick={() => setSourceMode("zip")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                    sourceMode === "zip" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" /> ZIP Archive
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDryRun}
                  onChange={(e) => setIsDryRun(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
                />
                Dry Run Validation Pass (No DB Write)
              </label>
            </div>
          </div>

          {/* Stepper Header */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
            {[
              { num: 1, label: "Choose Source" },
              { num: 2, label: "Scan & Match" },
              { num: 3, label: "Preview & Validate" },
              { num: 4, label: "Import Queue Console" },
            ].map((s) => (
              <div
                key={s.num}
                onClick={() => { if (s.num <= activeStep) setActiveStep(s.num); }}
                className={`py-3 px-2 rounded-xl border transition-all cursor-pointer ${
                  activeStep === s.num
                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                    : activeStep > s.num
                    ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                    : "bg-zinc-950/40 border-zinc-800/40 text-zinc-600"
                }`}
              >
                <span className="inline-block w-5 h-5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 mr-2">
                  {s.num}
                </span>
                {s.label}
              </div>
            ))}
          </div>

          {/* STEP 1: Source Upload / Paste URLs */}
          {activeStep === 1 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-6">
              {sourceMode === "urls" && (
                <div className="space-y-4 max-w-2xl mx-auto">
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mx-auto">
                    <Link2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-100">Bulk Import Sermon Webpage URLs</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Paste a list of Branham.org or sermon webpage URLs (one per line) to automatically fetch metadata, transcripts & audio links.
                    </p>
                  </div>

                  <textarea
                    rows={6}
                    value={urlInputText}
                    onChange={(e) => setUrlInputText(e.target.value)}
                    placeholder={`https://branham.org/en/messagestream/ENG=51-0413\nhttps://branham.org/en/messagestream/ENG=51-0414\nhttps://branham.org/en/messagestream/ENG=51-0415A`}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />

                  <button
                    onClick={handleUrlScan}
                    disabled={isScanning}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-2 mx-auto"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isScanning ? "Scanning Links..." : "Scan Links & Extract Metadata"}
                  </button>
                </div>
              )}

              {sourceMode === "folder" && (
                <div className="space-y-4 max-w-lg mx-auto py-6 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 hover:border-emerald-500/50 transition-all">
                  <FolderUp className="w-12 h-12 text-emerald-400 mx-auto" />
                  <div>
                    <h3 className="text-base font-bold text-zinc-100">Select Sermon Folder</h3>
                    <p className="text-xs text-zinc-400 mt-1">Choose a folder containing sermon PDFs and MP3s</p>
                  </div>
                  <label className="inline-block px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl cursor-pointer transition-all">
                    Browse Folder
                    <input
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleFolderSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {sourceMode === "zip" && (
                <div className="space-y-4 max-w-lg mx-auto py-6 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 hover:border-emerald-500/50 transition-all">
                  <Archive className="w-12 h-12 text-emerald-400 mx-auto" />
                  <div>
                    <h3 className="text-base font-bold text-zinc-100">Upload ZIP Archive</h3>
                    <p className="text-xs text-zinc-400 mt-1">Upload a ZIP archive containing sermon PDFs & audio</p>
                  </div>
                  <label className="inline-block px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl cursor-pointer transition-all">
                    Upload .ZIP
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleZipUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Scan & Match Loading Indicator */}
          {activeStep === 2 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-zinc-100">Scanning & Extracting Sermons...</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Parsing metadata, regex matching sermon codes, pairing PDF & MP3 media, and verifying server health...
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Preview & System Validation */}
          {activeStep === 3 && scannedManifest && (
            <div className="space-y-6">
              {/* System Health Checklist Bar */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-semibold text-zinc-200">Pre-Import System Health Checklist:</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                  {healthCheck?.checks?.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <span className="text-xs text-zinc-400">Total Found</span>
                  <div className="text-2xl font-bold text-zinc-100 mt-1">{scannedManifest.summary.total_sermons}</div>
                </div>
                <div className="bg-zinc-900 border border-emerald-500/30 rounded-xl p-4 text-center bg-emerald-500/5">
                  <span className="text-xs text-emerald-400 font-medium">✓ Ready</span>
                  <div className="text-2xl font-bold text-emerald-300 mt-1">{scannedManifest.summary.ready}</div>
                </div>
                <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-4 text-center bg-amber-500/5">
                  <span className="text-xs text-amber-400 font-medium">⚠ Duplicates</span>
                  <div className="text-2xl font-bold text-amber-300 mt-1">{scannedManifest.summary.duplicates}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <span className="text-xs text-zinc-400">Missing Audio</span>
                  <div className="text-2xl font-bold text-zinc-300 mt-1">{scannedManifest.summary.missing_audio}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <span className="text-xs text-zinc-400">Missing PDF</span>
                  <div className="text-2xl font-bold text-zinc-300 mt-1">{scannedManifest.summary.missing_pdf}</div>
                </div>
                <div className="bg-zinc-900 border border-red-500/30 rounded-xl p-4 text-center bg-red-500/5">
                  <span className="text-xs text-red-400 font-medium">Errors</span>
                  <div className="text-2xl font-bold text-red-300 mt-1">{scannedManifest.summary.invalid_filename}</div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-zinc-400">Duplicate Action:</span>
                  <select
                    value={duplicateAction}
                    onChange={(e) => setDuplicateAction(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-1.5 font-medium"
                  >
                    {DUPLICATE_ACTIONS.map((a) => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => startJobMut.mutate()}
                  disabled={startJobMut.isPending}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/10 flex items-center gap-2 transition-all"
                >
                  <Play className="w-4 h-4 fill-zinc-950" />
                  {isDryRun ? "Run Dry-Run Validation" : "Start Import Queue"}
                </button>
              </div>

              {/* Table Filters & Search */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search title or sermon code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-200 w-full"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {["all", "ready", "duplicate", "missing_audio", "missing_pdf"].map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                          statusFilter === st ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {st.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sermon Data Table */}
                <div className="overflow-x-auto border border-zinc-800/80 rounded-lg">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] font-semibold border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Title</th>
                        <th className="py-2.5 px-3">Language</th>
                        <th className="py-2.5 px-3">PDF</th>
                        <th className="py-2.5 px-3">Audio</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {filteredTasks.slice(0, 50).map((t, idx) => (
                        <tr key={idx} className="hover:bg-zinc-800/20">
                          <td className="py-2 px-3 font-mono font-medium text-emerald-400">{t.sermon_code || "—"}</td>
                          <td className="py-2 px-3 font-medium text-zinc-200 max-w-xs truncate">{t.title}</td>
                          <td className="py-2 px-3 text-zinc-400 uppercase">{t.language}</td>
                          <td className="py-2 px-3">
                            {t.has_pdf ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-zinc-600" />}
                          </td>
                          <td className="py-2 px-3">
                            {t.has_audio ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-zinc-600" />}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              t.status === "ready" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                              t.status === "duplicate" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                              "bg-zinc-800 text-zinc-400"
                            }`}>
                              {t.status.replace("_", " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Import Queue Console */}
          {activeStep === 4 && (
            <div className="space-y-6">
              {/* Job Complete Banner with One-Click Needs Review Link */}
              {activeJob?.status === "completed" && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    <div>
                      <h4 className="text-base font-bold text-zinc-100">Bulk Ingestion Completed!</h4>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {importedCount} Approved & Frozen | {skippedCount} Needs Review | {failedCount} Failed
                      </p>
                    </div>
                  </div>
                  {skippedCount > 0 && (
                    <Link
                      to="/sermons"
                      className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                    >
                      View All Sermons ({skippedCount}) <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              )}

              {/* Progress Console Board */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                  <div>
                    <span className="text-xs uppercase font-semibold text-zinc-400 tracking-wider">Active Ingestion Console</span>
                    <h3 className="text-lg font-bold text-zinc-100 mt-0.5">
                      {selectedProfile?.name || "English Library"} Processing
                    </h3>
                  </div>

                  {/* Execution Control Buttons */}
                  <div className="flex items-center gap-2">
                    {activeJob?.status === "running" ? (
                      <button
                        onClick={() => controlMut.mutate("pause")}
                        className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <Pause className="w-3.5 h-3.5" /> Pause
                      </button>
                    ) : activeJob?.status === "paused" ? (
                      <button
                        onClick={() => controlMut.mutate("resume")}
                        className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <Play className="w-3.5 h-3.5" /> Resume
                      </button>
                    ) : null}

                    {activeJob?.status === "running" && (
                      <button
                        onClick={() => controlMut.mutate("stop")}
                        className="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <Square className="w-3.5 h-3.5" /> Stop After Current
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar & Stage Indicator */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-zinc-200">
                      {processedCount} / {totalCount} Sermons Processed
                    </span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {progressPercent}%
                    </span>
                  </div>

                  <div className="w-full bg-zinc-950 h-3 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300 shadow-sm"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Active Sermon Indicator */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">Current Item:</span>
                      <div className="text-sm font-semibold text-emerald-400">
                        {activeJob?.current_item || "Processing Queue..."}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Sub-Stage:</span>
                      <span className="px-2.5 py-1 bg-zinc-800 text-zinc-200 text-xs font-medium rounded-md border border-zinc-700">
                        {activeJob?.active_stage || (activeJob?.status === "completed" ? "Done" : "Processing")}
                      </span>
                    </div>
                  </div>

                  {/* Counters */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-center">
                      <span className="text-[10px] text-zinc-500">Imported & Approved</span>
                      <div className="text-lg font-bold text-emerald-400">{importedCount}</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-center">
                      <span className="text-[10px] text-zinc-500">Needs Review</span>
                      <div className="text-lg font-bold text-amber-400">{skippedCount}</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-center">
                      <span className="text-[10px] text-zinc-500">Failed</span>
                      <div className="text-lg font-bold text-red-400">{failedCount}</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-center">
                      <span className="text-[10px] text-zinc-500">ETA Remaining</span>
                      <div className="text-lg font-bold text-zinc-200">
                        {activeJob?.status === "completed" ? "0 min" : `${Math.ceil((totalCount - processedCount) * 0.1)} min`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Logs Modal Link */}
                <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                  <button
                    onClick={() => setShowLogsModal(true)}
                    className="text-xs text-emerald-400 hover:underline font-medium"
                  >
                    View Execution Log Stream ({activeJob?.logs?.length || 0} entries)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-zinc-100">Job Execution History</h3>
          {historyJobs && historyJobs.length > 0 ? (
            <div className="space-y-3">
              {historyJobs.map((j) => (
                <div key={j.id} className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-zinc-200">Job {j.id.substring(0, 8)}...</div>
                    <div className="text-zinc-500 mt-0.5">{j.created_at}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-emerald-400 font-bold">{j.approved_count ?? j.imported_count} Approved</span>
                    <span className="text-amber-400 font-bold">{j.needs_review_count ?? j.skipped_count} Needs Review</span>
                    <span className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 font-mono uppercase text-[10px] font-bold">
                      {j.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-xs">No prior bulk job history recorded.</div>
          )}
        </div>
      )}

      {/* Log Modal */}
      {showLogsModal && activeJob?.logs && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">Execution Log Stream</h3>
              <button onClick={() => setShowLogsModal(false)} className="text-zinc-400 hover:text-zinc-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 space-y-1.5 max-h-96 overflow-y-auto">
              {activeJob.logs.map((log, i) => (
                <div key={i} className="leading-relaxed">{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
