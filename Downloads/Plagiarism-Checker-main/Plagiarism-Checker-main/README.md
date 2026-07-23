# ScribeGuard — Plagiarism Detector

ScribeGuard is a small web application that helps teachers, reviewers, and developers **spot possible plagiarism/copying** between two texts (or multiple uploaded documents), and also compare **code submissions** in a more structure-aware way.

## Why this project is useful

ScribeGuard is useful because it combines three practical features that are hard to get all at once:

1. **Instant similarity scoring (semantic + overlap)**
   - It computes **TF‑IDF cosine similarity** (semantic/vocabulary overlap) to quickly estimate how close two documents are.
   - It also computes **n‑gram/token overlap plagiarism percentage** using matched blocks, so you get an additional, more “direct match” style metric.

2. **Human-readable evidence via highlighted matches**
   - After scanning, the UI shows **side-by-side highlighting** of matched segments.
   - You can **hover/click** matches and jump between the document preview and a **match sidebar**, making it easier to review and verify results.

3. **Code plagiarism support that’s more resilient to renaming**
   - For Python/Java/C, the detector **strips comments/docstrings** and **abstracts identifiers** into generic tokens (e.g., variables become `VAR_1`, `VAR_2`, …).
   - This means the comparison focuses more on *structure* than on superficial variable name changes.

4. **Works for both manual input and file uploads**
   - Text mode: paste two documents and scan.
   - Files mode: upload 2+ files (`.txt`, `.py`, `.docx`, `.pdf`) and get a **cross-comparison matrix**.

## What it does (high level)

### Backend (FastAPI)
- `main.py` exposes endpoints like:
  - `POST /api/compare-raw-text` — compare two pasted texts
  - `POST /api/compare-code` — compare two code snippets (Python/Java/C)
  - `POST /api/compare-files` — upload multiple files and compute pairwise matrix
  - `GET /api/detailed-comparison` — fetch cached detailed matches for a chosen pair
- The backend uses `detector.py` to:
  - Extract text from PDFs/DOCX files
  - Tokenize with character positions
  - Find matching n‑gram blocks
  - Compute plagiarism percentage based on covered tokens
  - Compute TF‑IDF cosine similarity

### Frontend (HTML/CSS/JS)
- `index.html` + `style.css` provide the UI.
- `app.js` handles:
  - Tabs (Text / Files / Code)
  - Upload logic & scan calls to the API
  - Rendering gauges, verdict banner, matrix, and highlighted matches
  - Exporting a report (download as `.txt`)

## How to run

See `start.bat` (Windows) for the intended workflow.

## Notes / limitations
- Scores are **not legal proof**; they are signals to help reviewers locate overlap and patterns.
- Like any n‑gram/fingerprint approach, results depend on chosen sensitivity (`Min Matching Words/Tokens`).

## Project files
- `main.py` — FastAPI server + API routes
- `detector.py` — core similarity/plagiarism detection logic
- `index.html` — UI
- `app.js` — frontend logic
- `style.css` — styling
- `requirements.txt` — Python dependencies
- `start.bat` — convenience script to install deps and launch server
- `test_detector.py` — basic unit tests for the detection logic

