# Spark Config Architect (v12)

A browser-based calculator and planner for Apache Spark cluster configuration.

## 🚀 Quick Start
1. Open `index.html` in a modern browser (Chrome/Edge/Firefox).
2. Adjust cluster specs (nodes, cores, RAM) and workload profile.
3. Use the **Cluster Setup** tab to view recommended executor settings.
4. Explore **Visualizations**, plan **Parallel Jobs**, and export configs/reports.

> 📝 No build step required — this is a static HTML/CSS/JS app.

---

## 📁 Files in this folder
- `index.html` — Main UI shell (tabs, layout, input fields).
- `styles.css` — App styling and layout.
- `app.js` — All UI logic, calculations, chart rendering, and export features.
- `spark-config-v12.html` — Original single-file version (kept for reference).

---

## 🧠 How it works
- **Calculator logic** is in `app.js`.
- Inputs update values and trigger a debounced `compute()`.
- The app computes:
  - Recommended executor/driver specs
  - Resource utilization
  - Parallel job allocations (with pre-allocation support)
  - Spark config snippets (spark-defaults.conf, spark-submit)
- Charts are rendered via **Chart.js** (CDN included in `index.html`).

---

## 🛠️ Editing / Customizing
### Add/Adjust Fields
- `index.html` contains the UI input elements and tab structure.
- `app.js` contains the logic that reads those fields via `document.getElementById()`.

### Extend behavior
- Add new functions or modify existing ones in `app.js`.
- If you add new input fields, ensure their IDs match those referenced in `app.js`.

---

## ✅ Notes
- The app is designed as a standalone client-side tool; no server is required.
- You can host it on any static web server (GitHub Pages, local web server, etc.).
- For best results, open `index.html` via `http://` or `https://` (some browser clipboard APIs may be restricted for `file://`).

---

## 🔍 Troubleshooting
- If charts fail to render, ensure a modern browser is used and that `app.js` loads successfully.
- If behavior changes after edits, re-open `index.html` or clear your browser cache.

---

Enjoy tuning your Spark cluster! 🚀
