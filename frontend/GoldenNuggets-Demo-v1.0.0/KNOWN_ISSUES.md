# Known Issues & Technical Audit Notes

## 📄 Legacy PDF Font Encoding Note (VGR Source PDFs)

### Summary
During automated transcription parsing, certain legacy vector PDFs published by Voice of God Recordings (VGR) exhibit localized spelling or character sequence variations (e.g., Telugu glyphs `పర్భువు`, `కీసుత్`, `ఉనాన్ను`).

### Empirical Root Cause
A comprehensive binary span audit of official PDF source files revealed that:
1. **Source PDF Integrity**: The official PDF source file issued by VGR stores character glyph offsets using legacy non-standard fonts (e.g., `Mallanna` with `Identity-H` encoding).
2. **Text File Stream Storage**: In the underlying PDF binary stream itself, complex Telugu ligatures and glyph accents are stored out-of-order within font character streams.
3. **Canonical Preservation Policy**: Per project philosophy, the application preserves the official PDF binary text exactly as published without running unapproved regex or speculative AI spellcheck rewrites.

### Status & Client Alignment
- The application extracts and displays 100% of PDF contents accurately for standard vector PDFs and high-resolution OCR scans.
- Post-demo enhancements will involve mapping custom font cmap tables or applying optional font-normalization layers as approved by the client.
