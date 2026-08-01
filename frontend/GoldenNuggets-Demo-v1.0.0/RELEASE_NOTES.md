# Golden Nuggets — Production Demo Release v1.0.0

**Release Date**: July 31, 2026  
**Application Package**: `com.emergent.sermonstream.deysqo`  
**Version**: `1.0.0` (Build `1`)  
**Target Environment**: Production Cloud API & Local Standalone Android Client  

---

## 🌟 Executive Overview
This release package delivers the production-ready standalone Android APK (`GoldenNuggets-Demo-v1.0.0.apk`) and live backend deployment for the client demonstration. The application connects to a cloud-hosted FastAPI backend (`https://016e9339145303.lhr.life/api/v1/mobile`) and Supabase PostgreSQL storage pool.

---

## ✨ Features Verified & Operational in Demo Build

### 1. Global Sermon Catalog & Filtering
- **Dynamic Category & Series Browsing**: Complete library of sermons categorized by Year, State, Series, and Title.
- **Search Engine**: Title, keyword, and sermon code filtering with zero-delay indexing.
- **Telugu & English Language Support**: Multi-lingual sermon metadata and audio stream resolution.

### 2. Audio Streaming & Media Playback
- **Background Media Player**: Native background audio playback with lock screen media controls.
- **Presigned Media URLs**: Secure, auto-expiring Supabase storage signed URLs generated dynamically per request.
- **Seamless Streaming**: Tested and verified HTTP 200/206 streaming for audio files.

### 3. PDF Reading Mode & Synchronized Transcripts
- **Official Canonical PDF Viewer**: Direct download and rendering of original VGR PDF sermon documents.
- **Scanned PDF High-Resolution OCR**: Full paragraph extractions for scanned PDFs (such as Telugu sermon `59-0329S` with 240 extracted paragraphs).
- **Synchronized Text Highlight Engine**: Precise paragraph tracking aligned with audio progress.

---

## 📋 Included Files in Release Package
- `GoldenNuggets-Demo-v1.0.0.apk` — Standalone production Android APK (99 MB).
- `RELEASE_NOTES.md` — High-level release features and user guide.
- `BUILD_INFO.md` — Build specifications, SDK toolchain versions, git hashes, and checksums.
- `KNOWN_ISSUES.md` — Technical notes regarding source VGR PDF font encodings.
- `DEPLOYMENT_REPORT.md` — Full production smoke test and API verification audit.
- `BUILD_LOG.txt` — Complete log of execution commands, deployment outputs, and build traces.
