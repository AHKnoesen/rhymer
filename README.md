# Rhyme Analyzer (Obsidian)

In-vault rhyme & assonance analyzer with live updates. Finds end/internal rhymes, groups them into clusters, shows a rhyme map (A/B/C…), and can copy results as JSON.

## Features
- **Live processing** (debounced) — analyzes selection or whole note as you type
- **Rhyme clusters** with end vs internal position
- **Assonance (vowel echo)** groups with adjustable sensitivity
- **Rhyme map** (A/B/C…) per line
- **Fast**: memoized phonetics + bucketed comparisons
- **Copy JSON** export for scripts/automation

## Install
1. Download the plugin and place it under:
   ```
   path/to/your-vault/.obsidian/plugins/rhyme-analyzer/
   ```
2. In Obsidian: **Settings → Community Plugins → Enable** “Rhyme Analyzer”.

> Minimum Obsidian: `1.5.8` (see `manifest.json`).

### Example vault paths
- **macOS/Linux**
  ```
  ~/Obsidian/MyVault/.obsidian/plugins/rhyme-analyzer/
  ```
- **Windows**
  ```
  %USERPROFILE%\Obsidian\MyVault\.obsidian\plugins\rhyme-analyzer\
  ```

## Use
- Open the side pane: **Command Palette → “Open Rhyme Analyzer”**
- Analyze: click **Analyze** or run **“Analyze current note for rhymes”**
- Live updates: toggle **Live processing** in settings  
  - If text is selected, only the selection is analyzed; otherwise the whole note.

## Settings (plain language)
- **Live processing** — analyze while typing
- **Exact cutoff** — strictness for perfect end-rhymes (lower = stricter)
- **Loose cutoff** — tolerance for slant/internal matches (higher = more)
- **Vowel echo** — show assonance clusters
- **Vowel echo sensitivity** — how close vowels must be (lower = closer)
- **Ignore common words** — skip function words in clusters

## Export
Click **Copy JSON** in the pane to copy the current analysis (words, spans, groups, assonance, scheme).

## Dev notes
- Plain JS plugin (no build step). Files: `main.js`, `styles.css`, `manifest.json`.
- A minimal `main-simple.js` is included for a console/notice-only demo.

---
MIT © 2025
