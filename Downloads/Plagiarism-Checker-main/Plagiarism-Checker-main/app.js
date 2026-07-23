// =============================================
// Global State
// =============================================
let uploadedFiles = [];
let activeTab = 'text';
let currentMatchData = [];
// FastAPI server base URL.
// Using localhost by default fixes 405/404 when opening index.html directly.
// Override this value in deployments if you mount the API under a different origin.
const API_URL = window.location.protocol.startsWith('http') ? window.location.origin : "http://localhost:8000";


// =============================================
// DOM Elements
// =============================================
const docTextA = document.getElementById('doc-text-a');
const docTextB = document.getElementById('doc-text-b');
const charCountA = document.getElementById('char-count-a');
const charCountB = document.getElementById('char-count-b');
const dropZone = document.getElementById('drop-zone');
const fileListCard = document.getElementById('file-list-card');
const fileListContainer = document.getElementById('file-list-container');
const fileCount = document.getElementById('file-count');
const filesSettingsBar = document.getElementById('files-settings-bar');

// =============================================
// Word / Character Counter Listeners
// =============================================
function updateTextStats(textarea, charEl, wordEl) {
    const text = textarea.value;
    const chars = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    if (charEl) charEl.innerText = `${chars} characters`;
    if (wordEl) wordEl.innerText = `${words} words`;
}

if (docTextA) {
    docTextA.addEventListener('input', () => updateTextStats(docTextA, charCountA, document.getElementById('word-count-a')));
}
if (docTextB) {
    docTextB.addEventListener('input', () => updateTextStats(docTextB, charCountB, document.getElementById('word-count-b')));
}

// =============================================
// Tab Switching Logic
// =============================================
window.switchTab = function(tabName) {
    activeTab = tabName;
    document.getElementById('tab-text-btn').classList.toggle('active', tabName === 'text');
    document.getElementById('tab-files-btn').classList.toggle('active', tabName === 'files');
    document.getElementById('tab-code-btn').classList.toggle('active', tabName === 'code');
    document.getElementById('compare-text-section').classList.toggle('active', tabName === 'text');
    document.getElementById('compare-files-section').classList.toggle('active', tabName === 'files');
    document.getElementById('compare-code-section').classList.toggle('active', tabName === 'code');
    document.getElementById('results-section').classList.add('hidden');
};

// =============================================
// Drag and Drop File Handlers
// =============================================
if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    dropZone.addEventListener('click', (e) => {
        if (e.target !== document.getElementById('file-input')) {
            document.getElementById('file-input').click();
        }
    });
}

window.handleFileSelect = function(event) {
    handleFiles(event.target.files);
};

function handleFiles(files) {
    const allowedExtensions = ['txt', 'py', 'docx', 'pdf'];
    let addedCount = 0;
    for (let file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (allowedExtensions.includes(ext)) {
            if (!uploadedFiles.some(f => f.name === file.name)) {
                uploadedFiles.push(file);
                addedCount++;
            } else {
                showToast(`"${file.name}" is already added.`, 'info');
            }
        } else {
            showToast(`Unsupported file type: .${ext}`, 'error');
        }
    }
    if (addedCount > 0) showToast(`${addedCount} file(s) added.`, 'success');
    updateFileList();
}

window.removeFile = function(index) {
    uploadedFiles.splice(index, 1);
    updateFileList();
};

window.clearFiles = function() {
    uploadedFiles = [];
    updateFileList();
    document.getElementById('file-input').value = "";
    showToast('All files cleared.', 'info');
};

function updateFileList() {
    if (uploadedFiles.length === 0) {
        fileListCard.classList.add('hidden');
        filesSettingsBar.classList.add('hidden');
        return;
    }
    fileListCard.classList.remove('hidden');
    filesSettingsBar.classList.remove('hidden');
    fileCount.innerText = uploadedFiles.length;
    fileListContainer.innerHTML = "";
    uploadedFiles.forEach((file, index) => {
        const sizeKB = (file.size / 1024).toFixed(1);
        const ext = file.name.split('.').pop().toUpperCase();
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-item-left">
                <div class="file-ext-badge">${escapeHtml(ext)}</div>
                <div style="min-width: 0;">
                    <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                    <div class="file-size">${sizeKB} KB</div>
                </div>
            </div>
            <button class="remove-file-btn" onclick="removeFile(${index})" title="Remove file">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        fileListContainer.appendChild(item);
    });
}

// =============================================
// Radial Gauge Updater
// =============================================
function setGaugeValue(id, value) {
    const gauge = document.getElementById(id);
    const valueText = document.getElementById(id.replace('-gauge', '-val'));
    if (!gauge || !valueText) return;
    const val = Math.min(Math.max(value, 0), 100);
    gauge.style.strokeDasharray = `${val}, 100`;
    valueText.textContent = `${Math.round(val)}%`;
}

// =============================================
// Verdict Banner Renderer
// =============================================
function renderVerdictBanner(cosine, plagA, plagB, titleA, titleB) {
    const container = document.getElementById('verdict-banner-container');
    if (!container) return;

    const maxPlag = Math.max(plagA, plagB);
    const maxScore = Math.max(cosine, maxPlag);

    let verdictClass, icon, title, description;

    if (maxScore >= 60) {
        verdictClass = 'verdict-high';
        icon = '🚨';
        title = 'High Plagiarism Detected';
        description = `Strong evidence of copied content found between "${titleA}" and "${titleB}". Immediate review is recommended.`;
    } else if (maxScore >= 25) {
        verdictClass = 'verdict-suspicious';
        icon = '⚠️';
        title = 'Suspicious Similarity Found';
        description = `Moderate overlap detected between "${titleA}" and "${titleB}". Manual review of highlighted sections is advised.`;
    } else {
        verdictClass = 'verdict-clear';
        icon = '✅';
        title = 'Documents Appear Original';
        description = `Low similarity between "${titleA}" and "${titleB}". No significant plagiarism detected.`;
    }

    container.innerHTML = `
        <div class="verdict-banner ${verdictClass}">
            <div class="verdict-icon">${icon}</div>
            <div class="verdict-text">
                <h3>${title}</h3>
                <p>${escapeHtml(description)}</p>
            </div>
            <div class="verdict-actions">
                <button class="btn btn-export" onclick="exportReport()" title="Export PDF Report">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export Report
                </button>
                <button class="btn btn-secondary" onclick="resetScan()" title="Start a new scan">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                    New Scan
                </button>
            </div>
        </div>
    `;
}

// =============================================
// Stats Bar Renderer
// =============================================
function renderStatsBar(textA, textB, matchCount) {
    const container = document.getElementById('stats-bar-container');
    if (!container) return;
    const wordsA = textA.trim() === '' ? 0 : textA.trim().split(/\s+/).length;
    const wordsB = textB.trim() === '' ? 0 : textB.trim().split(/\s+/).length;
    container.innerHTML = `
        <div class="stats-bar">
            <div class="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Doc A: <strong>${wordsA.toLocaleString()} words</strong>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Doc B: <strong>${wordsB.toLocaleString()} words</strong>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Matching Blocks: <strong>${matchCount}</strong>
            </div>
        </div>
    `;
}

// =============================================
// Match Sidebar Renderer
// =============================================
function renderMatchSidebar(matches, textA) {
    currentMatchData = matches;
    const container = document.getElementById('match-sidebar-container');
    if (!container) return;

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="card match-sidebar">
                <div class="card-header"><h3>Matched Segments</h3><span class="badge">${matches ? matches.length : 0}</span></div>
                <div class="no-matches-msg">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px; opacity:0.4"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    <p>No matching segments found at the current sensitivity level.</p>
                </div>
            </div>
        `;
        return;
    }

    const matchItems = matches.map((m, i) => {
        const preview = escapeHtml(m.text.substring(0, 120).replace(/\s+/g, ' ').trim());
        const wordCount = m.text.trim().split(/\s+/).length;
        return `
            <div class="match-item" id="match-item-${i}" onclick="jumpToMatch(${i})">
                <button class="match-copy-btn" onclick="event.stopPropagation(); copyMatchText(${i})" title="Copy matched text">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <div class="match-item-header">
                    <span class="match-num">Match #${i + 1}</span>
                    <span class="match-words">${wordCount} words</span>
                </div>
                <div class="match-preview">${preview}${m.text.length > 120 ? '...' : ''}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="card match-sidebar">
            <div class="card-header">
                <h3>Matched Segments</h3>
                <span class="badge">${matches.length}</span>
            </div>
            <div class="match-list">
                ${matchItems}
            </div>
        </div>
    `;
}

// =============================================
// Jump to Match in Document Viewer
// =============================================
window.jumpToMatch = function(matchId) {
    // Clear active match items
    document.querySelectorAll('.match-item').forEach(el => el.classList.remove('active-match'));
    const activeItem = document.getElementById(`match-item-${matchId}`);
    if (activeItem) activeItem.classList.add('active-match');

    // Highlight and scroll both viewers
    const highlights = document.querySelectorAll(`.hl-match[data-match-id="${matchId}"]`);
    highlights.forEach(hl => {
        hl.classList.add('hl-jump-flash');
        hl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => hl.classList.remove('hl-jump-flash'), 850);
    });
};

// =============================================
// Copy Match Text to Clipboard
// =============================================
window.copyMatchText = function(matchId) {
    if (!currentMatchData[matchId]) return;
    navigator.clipboard.writeText(currentMatchData[matchId].text).then(() => {
        showToast('Matched text copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy text.', 'error');
    });
};

// =============================================
// Compare Raw Text (Text Tab)
// =============================================
window.scanRawText = async function() {
    const textA = docTextA.value;
    const textB = docTextB.value;
    const titleA = document.getElementById('doc-title-a').value.trim() || "Document A";
    const titleB = document.getElementById('doc-title-b').value.trim() || "Document B";
    const nGramVal = parseInt(document.getElementById('ngram-text-slider').value);

    if (!textA.trim() || !textB.trim()) {
        showToast('Please paste text in both Document A and Document B.', 'error');
        return;
    }

    toggleSpinner('scan-text-spinner', 'btn-scan-text', true);

    try {
        const response = await fetch(`${API_URL}/api/compare-raw-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title_a: titleA,
                text_a: textA,
                title_b: titleB,
                text_b: textB,
                n_gram_size: nGramVal
            })
        });

        if (!response.ok) {
            // Backend may return non-JSON (HTML 404 page, empty body, etc.)
            const ct = response.headers.get('content-type') || '';
            let message = `Server error (HTTP ${response.status}).`;
            if (ct.includes('application/json')) {
                try {
                    const err = await response.json();
                    message = err?.detail || err?.message || message;
                } catch (_) {
                    // ignore JSON parse failure
                }
            }
            if (!ct.includes('application/json')) {
                try {
                    const t = await response.text();
                    if (t) message = t;
                } catch (_) {
                    // ignore
                }
            }
            throw new Error(message);
        }


        const result = await response.json();

        document.getElementById('bulk-matrix-container').classList.add('hidden');

        // Update gauge titles
        document.getElementById('plag-a-title').innerText = `${titleA} Overlap`;
        document.getElementById('plag-b-title').innerText = `${titleB} Overlap`;

        // Set gauge values
        setGaugeValue('cosine-gauge', result.cosine_similarity);
        setGaugeValue('plag-a-gauge', result.plagiarism_percentage_a);
        setGaugeValue('plag-b-gauge', result.plagiarism_percentage_b);

        // Render verdict banner
        renderVerdictBanner(result.cosine_similarity, result.plagiarism_percentage_a, result.plagiarism_percentage_b, titleA, titleB);

        // Render stats bar
        renderStatsBar(textA, textB, result.matches.length);

        // Render detailed highlights + match sidebar
        renderComparison(titleA, textA, titleB, textB, result.matches);
        renderMatchSidebar(result.matches, textA);

        // Show results section
        document.getElementById('results-section').classList.remove('hidden');
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
        showToast('Scan complete!', 'success');

    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        toggleSpinner('scan-text-spinner', 'btn-scan-text', false);
    }
};

// =============================================
// Compare Uploaded Files (Files Tab)
// =============================================
window.scanFiles = async function() {
    if (uploadedFiles.length < 2) {
        showToast('Please upload at least 2 files to compare.', 'error');
        return;
    }

    const nGramVal = parseInt(document.getElementById('ngram-files-slider').value);
    toggleSpinner('scan-files-spinner', 'btn-scan-files', true);

    const formData = new FormData();
    for (let file of uploadedFiles) {
        formData.append('files', file);
    }
    formData.append('n_gram_size', nGramVal);

    try {
        const response = await fetch(`${API_URL}/api/compare-files`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const ct = response.headers.get('content-type') || '';
            let message = `Server error (HTTP ${response.status}).`;
            if (ct.includes('application/json')) {
                try {
                    const err = await response.json();
                    message = err?.detail || err?.message || message;
                } catch (_) {
                    // ignore JSON parse failure
                }
            }
            if (!ct.includes('application/json')) {
                try {
                    const t = await response.text();
                    if (t) message = t;
                } catch (_) {
                    // ignore
                }
            }
            throw new Error(message);
        }


        const result = await response.json();

        renderMatrix(result.matrix, result.files, nGramVal);
        document.getElementById('bulk-matrix-container').classList.remove('hidden');

        // Auto-load details for the highest match pair
        if (result.highest_matches && result.highest_matches.length > 0) {
            let bestPair = result.highest_matches.reduce((max, item) => item.similarity > max.similarity ? item : max, result.highest_matches[0]);
            if (bestPair && bestPair.similarity > 0 && bestPair.match_file) {
                await loadDetailedComparison(bestPair.file, bestPair.match_file, nGramVal);
            } else {
                await loadDetailedComparison(result.files[0].name, result.files[1].name, nGramVal);
            }
        }

        document.getElementById('results-section').classList.remove('hidden');
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
        showToast('Files compared successfully!', 'success');

    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        toggleSpinner('scan-files-spinner', 'btn-scan-files', false);
    }
};

// =============================================
// Render Cross-Comparison Matrix
// =============================================
function renderMatrix(matrix, files, nGramVal) {
    const table = document.getElementById('matrix-table');
    table.innerHTML = "";

    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th'));
    files.forEach(f => {
        const th = document.createElement('th');
        th.innerText = f.name;
        th.style.maxWidth = '160px';
        th.style.overflow = 'hidden';
        th.style.textOverflow = 'ellipsis';
        th.title = f.name;
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    files.forEach(fileA => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.style.fontWeight = '600';
        nameCell.style.maxWidth = '160px';
        nameCell.style.overflow = 'hidden';
        nameCell.style.textOverflow = 'ellipsis';
        nameCell.style.whiteSpace = 'nowrap';
        nameCell.innerText = fileA.name;
        nameCell.title = fileA.name;
        row.appendChild(nameCell);

        files.forEach(fileB => {
            const cell = document.createElement('td');
            if (fileA.name === fileB.name) {
                cell.innerHTML = `<div class="matrix-cell-score matrix-self">—</div>`;
            } else {
                const scoreData = matrix[fileA.name][fileB.name];
                const cosineScore = scoreData.cosine;
                let ratingClass = 'matrix-low';
                if (cosineScore > 60) ratingClass = 'matrix-high';
                else if (cosineScore > 25) ratingClass = 'matrix-mid';

                cell.innerHTML = `
                    <div class="matrix-cell-score ${ratingClass}" onclick="loadDetailedComparison('${escapeJsStr(fileA.name)}', '${escapeJsStr(fileB.name)}', ${nGramVal})">
                        ${cosineScore}%
                    </div>
                `;
            }
            row.appendChild(cell);
        });
        table.appendChild(row);
    });
}

// =============================================
// Load Detailed File Comparison from Cache
// =============================================
window.loadDetailedComparison = async function(fileA, fileB, nGramVal) {
    try {
        const response = await fetch(`${API_URL}/api/detailed-comparison?file_a=${encodeURIComponent(fileA)}&file_b=${encodeURIComponent(fileB)}&n_gram_size=${nGramVal}`);
        if (!response.ok) {
            const ct = response.headers.get('content-type') || '';
            let message = `Server error (HTTP ${response.status}).`;
            if (ct.includes('application/json')) {
                try {
                    const err = await response.json();
                    message = err?.detail || err?.message || message;
                } catch (_) {
                    // ignore JSON parse failure
                }
            }
            if (!ct.includes('application/json')) {
                try {
                    const t = await response.text();
                    if (t) message = t;
                } catch (_) {
                    // ignore
                }
            }
            throw new Error(message);
        }


        const details = await response.json();

        document.getElementById('plag-a-title').innerText = `${fileA} Overlap`;
        document.getElementById('plag-b-title').innerText = `${fileB} Overlap`;

        setGaugeValue('cosine-gauge', details.cosine_similarity);
        setGaugeValue('plag-a-gauge', details.plagiarism_percentage_a);
        setGaugeValue('plag-b-gauge', details.plagiarism_percentage_b);

        // Render verdict
        renderVerdictBanner(details.cosine_similarity, details.plagiarism_percentage_a, details.plagiarism_percentage_b, fileA, fileB);

        // Render stats
        renderStatsBar(details.file_a_text, details.file_b_text, details.matches.length);

        // Render highlights and sidebar
        renderComparison(fileA, details.file_a_text, fileB, details.file_b_text, details.matches);
        renderMatchSidebar(details.matches, details.file_a_text);

        document.querySelector('.comparison-card').scrollIntoView({ behavior: 'smooth' });

    } catch (e) {
        showToast(`Error loading comparison: ${e.message}`, 'error');
    }
};

// =============================================
// Render Side-by-Side Highlighted Comparison
// =============================================
function renderComparison(titleA, textA, titleB, textB, matches) {
    document.getElementById('panel-title-a').innerText = titleA;
    document.getElementById('panel-title-b').innerText = titleB;

    const spansA = matches.map((m, index) => ({ start: m.source_start, end: m.source_end, id: index }));
    const spansB = matches.map((m, index) => ({ start: m.target_start, end: m.target_end, id: index }));

    document.getElementById('viewer-a').innerHTML = highlightText(textA, spansA);
    document.getElementById('viewer-b').innerHTML = highlightText(textB, spansB);
}

// =============================================
// Generate Highlighted HTML
// =============================================
function highlightText(text, spans) {
    spans.sort((a, b) => a.start - b.start);
    let html = "";
    let lastIndex = 0;

    for (let span of spans) {
        if (span.start < lastIndex) {
            if (span.end <= lastIndex) continue;
            span.start = lastIndex;
        }
        html += escapeHtml(text.substring(lastIndex, span.start));
        const matchText = text.substring(span.start, span.end);
        html += `<span class="hl-match" data-match-id="${span.id}" onmouseover="highlightPair('${span.id}', true)" onmouseout="highlightPair('${span.id}', false)" onclick="jumpToMatchSidebar(${span.id})">${escapeHtml(matchText)}</span>`;
        lastIndex = span.end;
    }
    html += escapeHtml(text.substring(lastIndex));
    return html;
}

// =============================================
// Cross-Highlight Hover
// =============================================
window.highlightPair = function(matchId, isHover) {
    const highlights = document.querySelectorAll(`.hl-match[data-match-id="${matchId}"]`);
    highlights.forEach(hl => {
        if (isHover) {
            hl.classList.add('hl-active-hover');
        } else {
            hl.classList.remove('hl-active-hover');
        }
    });
};

// Click on highlighted span -> select match in sidebar
window.jumpToMatchSidebar = function(matchId) {
    document.querySelectorAll('.match-item').forEach(el => el.classList.remove('active-match'));
    const sidebarItem = document.getElementById(`match-item-${matchId}`);
    if (sidebarItem) {
        sidebarItem.classList.add('active-match');
        sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

// =============================================
// Export Report as Plain Text Download
// =============================================
window.exportReport = function() {
    const titleA = document.getElementById('panel-title-a').innerText || 'Document A';
    const titleB = document.getElementById('panel-title-b').innerText || 'Document B';
    const cosine = document.getElementById('cosine-val').innerText;
    const plagA = document.getElementById('plag-a-val').innerText;
    const plagB = document.getElementById('plag-b-val').innerText;
    const matchCount = currentMatchData.length;

    let report = `ScribeGuard — Plagiarism Detection Report\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `${'='.repeat(60)}\n\n`;
    report += `DOCUMENTS COMPARED\n`;
    report += `  • Document A: ${titleA}\n`;
    report += `  • Document B: ${titleB}\n\n`;
    report += `SIMILARITY METRICS\n`;
    report += `  • Semantic Similarity (TF-IDF Cosine): ${cosine}\n`;
    report += `  • ${titleA} Overlap: ${plagA}\n`;
    report += `  • ${titleB} Overlap: ${plagB}\n`;
    report += `  • Matching Blocks Found: ${matchCount}\n\n`;
    report += `${'='.repeat(60)}\n\n`;

    if (currentMatchData.length > 0) {
        report += `MATCHED SEGMENTS (${currentMatchData.length} total)\n\n`;
        currentMatchData.forEach((m, i) => {
            const wordCount = m.text.trim().split(/\s+/).length;
            report += `Match #${i + 1} (${wordCount} words)\n`;
            report += `  Source chars: [${m.source_start}–${m.source_end}] | Target chars: [${m.target_start}–${m.target_end}]\n`;
            report += `  Text: "${m.text.replace(/\n/g, ' ').substring(0, 200)}${m.text.length > 200 ? '...' : ''}"\n\n`;
        });
    } else {
        report += `No significant matching segments were detected.\n`;
    }

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ScribeGuard_Report_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report downloaded!', 'success');
};

// =============================================
// Code Tab — Language Selection
// =============================================
let selectedLanguage = 'python';

window.selectLanguage = function(lang) {
    selectedLanguage = lang;
    // Update pill active states
    ['python', 'java', 'c'].forEach(l => {
        const btn = document.getElementById(`lang-${l}-btn`);
        if (btn) btn.classList.toggle('active', l === lang);
    });
    // Update placeholder based on language
    const ta = document.getElementById('code-text-a');
    const tb = document.getElementById('code-text-b');
    const placeholders = {
        python: `# Python Code A\ndef bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]`,
        java: `// Java Code A\npublic class Sort {\n    public static void bubbleSort(int[] arr) {\n        int n = arr.length;\n        for (int i = 0; i < n-1; i++)\n            for (int j = 0; j < n-i-1; j++)\n                if (arr[j] > arr[j+1]) {\n                    int temp = arr[j];\n                    arr[j] = arr[j+1];\n                    arr[j+1] = temp;\n                }\n    }\n}`,
        c: `// C Code A\nvoid bubble_sort(int arr[], int n) {\n    int i, j, temp;\n    for (i = 0; i < n-1; i++)\n        for (j = 0; j < n-i-1; j++)\n            if (arr[j] > arr[j+1]) {\n                temp = arr[j];\n                arr[j] = arr[j+1];\n                arr[j+1] = temp;\n            }\n}`
    };
    if (ta) ta.placeholder = placeholders[lang] || '';
    showToast(`Language set to ${lang.charAt(0).toUpperCase() + lang.slice(1)}`, 'info');
};

// =============================================
// Code Editor — Line Number Sync
// =============================================
window.updateLineNumbers = function(side) {
    const ta = document.getElementById(`code-text-${side}`);
    const lineNumEl = document.getElementById(`line-nums-${side}`);
    const lineCountEl = document.getElementById(`code-line-count-${side}`);
    const charCountEl = document.getElementById(`code-char-count-${side}`);
    if (!ta || !lineNumEl) return;

    const lines = ta.value.split('\n').length;
    lineNumEl.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
    if (lineCountEl) lineCountEl.innerText = `${lines} lines`;
    if (charCountEl) charCountEl.innerText = `${ta.value.length} chars`;
};

// =============================================
// Compare Code (Code Tab)
// =============================================
window.scanCode = async function() {
    const codeA = document.getElementById('code-text-a').value;
    const codeB = document.getElementById('code-text-b').value;
    const titleA = document.getElementById('code-title-a').value.trim() || 'Code A';
    const titleB = document.getElementById('code-title-b').value.trim() || 'Code B';
    const nGramVal = parseInt(document.getElementById('ngram-code-slider').value);

    if (!codeA.trim() || !codeB.trim()) {
        showToast('Please paste code in both Code A and Code B panes.', 'error');
        return;
    }

    toggleSpinner('scan-code-spinner', 'btn-scan-code', true);

    try {
        const response = await fetch(`${API_URL}/api/compare-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title_a: titleA,
                code_a: codeA,
                title_b: titleB,
                code_b: codeB,
                language: selectedLanguage,
                n_gram_size: nGramVal
            })
        });

        if (!response.ok) {
            const ct = response.headers.get('content-type') || '';
            let message = `Server error (HTTP ${response.status}).`;
            if (ct.includes('application/json')) {
                try {
                    const err = await response.json();
                    message = err?.detail || err?.message || message;
                } catch (_) {
                    // ignore JSON parse failure
                }
            }
            if (!ct.includes('application/json')) {
                try {
                    const t = await response.text();
                    if (t) message = t;
                } catch (_) {
                    // ignore
                }
            }
            throw new Error(message);
        }


        const result = await response.json();

        document.getElementById('bulk-matrix-container').classList.add('hidden');

        // Update gauge titles
        document.getElementById('plag-a-title').innerText = `${titleA} Overlap`;
        document.getElementById('plag-b-title').innerText = `${titleB} Overlap`;

        // Set gauge values
        setGaugeValue('cosine-gauge', result.cosine_similarity);
        setGaugeValue('plag-a-gauge', result.plagiarism_percentage_a);
        setGaugeValue('plag-b-gauge', result.plagiarism_percentage_b);

        // Render verdict
        renderVerdictBanner(
            result.cosine_similarity,
            result.plagiarism_percentage_a,
            result.plagiarism_percentage_b,
            titleA, titleB
        );

        // Render code-specific stats bar
        renderCodeStatsBar(codeA, codeB, result.matches.length, result.language);

        // Render side-by-side highlights using original char offsets
        renderComparison(titleA, codeA, titleB, codeB, result.matches);
        renderCodeMatchSidebar(result.matches);

        // Show results
        document.getElementById('results-section').classList.remove('hidden');
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
        showToast(`Code scan complete! (${result.language.toUpperCase()})`, 'success');

    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        toggleSpinner('scan-code-spinner', 'btn-scan-code', false);
    }
};

// =============================================
// Code Stats Bar
// =============================================
function renderCodeStatsBar(codeA, codeB, matchCount, language) {
    const container = document.getElementById('stats-bar-container');
    if (!container) return;
    const linesA = codeA.split('\n').length;
    const linesB = codeB.split('\n').length;
    const langLabel = language ? language.charAt(0).toUpperCase() + language.slice(1) : '';
    const langColors = { python: '#FFD43B', java: '#E76F00', c: '#659BD3' };
    const langColor = langColors[language] || 'var(--primary)';
    container.innerHTML = `
        <div class="stats-bar">
            <div class="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                Code A: <strong>${linesA.toLocaleString()} lines</strong>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                Code B: <strong>${linesB.toLocaleString()} lines</strong>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Matching Blocks: <strong>${matchCount}</strong>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <span class="lang-stat-badge" style="background:${langColor}20; color:${langColor}; border:1px solid ${langColor}40; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">${langLabel}</span>
            </div>
        </div>
    `;
}

// =============================================
// Code Match Sidebar (with line numbers)
// =============================================
function renderCodeMatchSidebar(matches) {
    currentMatchData = matches;
    const container = document.getElementById('match-sidebar-container');
    if (!container) return;

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="card match-sidebar">
                <div class="card-header"><h3>Matched Code Blocks</h3><span class="badge">0</span></div>
                <div class="no-matches-msg">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px; opacity:0.4"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    <p>No matching code blocks found at current sensitivity.</p>
                </div>
            </div>
        `;
        return;
    }

    const matchItems = matches.map((m, i) => {
        const preview = escapeHtml((m.text || '').substring(0, 100).replace(/\s+/g, ' ').trim());
        const srcLines = m.source_line_start && m.source_line_end
            ? `L${m.source_line_start}–${m.source_line_end}`
            : '';
        const tgtLines = m.target_line_start && m.target_line_end
            ? `L${m.target_line_start}–${m.target_line_end}`
            : '';
        return `
            <div class="match-item code-match-item" id="match-item-${i}" onclick="jumpToMatch(${i})">
                <button class="match-copy-btn" onclick="event.stopPropagation(); copyMatchText(${i})" title="Copy matched code">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <div class="match-item-header">
                    <span class="match-num">Block #${i + 1}</span>
                    <div class="match-lines-badge">
                        ${srcLines ? `<span class="line-badge line-badge-a">A: ${srcLines}</span>` : ''}
                        ${tgtLines ? `<span class="line-badge line-badge-b">B: ${tgtLines}</span>` : ''}
                    </div>
                </div>
                <div class="match-preview code-preview">${preview}${(m.text || '').length > 100 ? '...' : ''}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="card match-sidebar">
            <div class="card-header">
                <h3>Matched Code Blocks</h3>
                <span class="badge">${matches.length}</span>
            </div>
            <div class="match-list">${matchItems}</div>
        </div>
    `;
}

// =============================================
// Reset / New Scan
// =============================================
window.resetScan = function() {
    document.getElementById('results-section').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Ready for a new scan!', 'info');
};

// =============================================
// Toast Notification System
// =============================================
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    // Auto dismiss after 3.5 seconds
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

// =============================================
// UI Utilities
// =============================================
function toggleSpinner(spinnerId, buttonId, isLoading) {
    const spinner = document.getElementById(spinnerId);
    const button = document.getElementById(buttonId);
    if (!spinner || !button) return;
    if (isLoading) {
        spinner.classList.remove('hidden');
        button.disabled = true;
    } else {
        spinner.classList.add('hidden');
        button.disabled = false;
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeJsStr(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
