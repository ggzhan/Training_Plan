// Plan page: renders PLAN, edits one exercise at a time, undo/redo, regenerate, PDF.
//
// Every kid has exactly one place per exercise (pair, Balleimer, sparring or
// ohne Partner). Editing changes a place by swapping with whoever holds the chosen
// kid, so an exercise always stays complete.

const plan = PLAN;
let editingIndex = null;
let draft = null; // copy of the exercise being edited
let historyStack = [];
let redoStack = [];
let regenerating = false;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function playerByName(name) {
    return plan.players.find(p => p.name === name);
}

// ===== PLACES =====
// Every kid-holding position of an exercise, in display order
function slotsOf(ex) {
    const slots = [];
    ex.pairs.forEach(pair => {
        slots.push({ get: () => pair.player1, set: p => { pair.player1 = p; } });
        slots.push({ get: () => pair.player2, set: p => { pair.player2 = p; } });
    });
    ex.balleimer.forEach(bucket => bucket.forEach((_, i) => {
        slots.push({ get: () => bucket[i], set: p => { bucket[i] = p; } });
    }));
    ex.sparring.forEach(s => {
        slots.push({ get: () => s.player, set: p => { s.player = p; } });
    });
    ex.unpaired.forEach((_, i) => {
        slots.push({ get: () => ex.unpaired[i], set: p => { ex.unpaired[i] = p; } });
    });
    return slots;
}

function changeSlot(slotIndex, name) {
    const slots = slotsOf(draft);
    const target = slots[slotIndex];
    const previous = target.get();
    const chosen = playerByName(name);
    const holder = slots.find((s, i) => i !== slotIndex && s.get().name === name);
    target.set(chosen);
    if (holder) holder.set(previous);
    render();
}

// ===== RULE HINTS =====
// What this exercise repeats from earlier ones; recomputed after every change
function hintsFor(index, ex) {
    const hints = [];
    const pairKey = (a, b) => [a, b].sort().join('\u0000');
    for (let e = 0; e < index; e++) {
        const earlier = plan.exercises[e];
        const label = `Übung ${e + 1}`;
        const earlierPairs = new Set(earlier.pairs.map(p => pairKey(p.player1.name, p.player2.name)));
        ex.pairs.forEach(p => {
            if (earlierPairs.has(pairKey(p.player1.name, p.player2.name))) {
                hints.push(`${p.player1.name} & ${p.player2.name} spielen schon in ${label} zusammen.`);
            }
        });
        const earlierBuckets = new Set(earlier.balleimer.flat().map(p => p.name));
        ex.balleimer.flat().forEach(p => {
            if (earlierBuckets.has(p.name)) hints.push(`${p.name} war schon in ${label} am Balleimer.`);
        });
        ex.sparring.forEach(s => {
            if (earlier.sparring.some(o => o.partner === s.partner && o.player.name === s.player.name)) {
                hints.push(`${s.player.name} spielte schon in ${label} mit ${s.partner}.`);
            }
        });
        const earlierUnpaired = new Set(earlier.unpaired.map(p => p.name));
        ex.unpaired.forEach(p => {
            if (earlierUnpaired.has(p.name)) hints.push(`${p.name} war schon in ${label} ohne Partner.`);
        });
    }
    return hints;
}

// ===== RENDERING =====
function render() {
    document.getElementById('planDate').textContent = plan.trainingDate ? `· ${plan.trainingDate}` : '';
    document.getElementById('playerCount').textContent = plan.players.length;
    document.getElementById('exerciseCount').textContent = plan.exercises.length;

    const s = plan.settings;
    const summary = [];
    if (s.balleimerCount > 0) summary.push(`Balleimer: ${s.balleimerCount} × ${s.playersPerBalleimer} Kinder`);
    if (s.sparringPartners.length > 0) summary.push(`Sparring: ${s.sparringPartners.join(', ')}`);
    document.getElementById('settingsSummary').textContent = summary.join(' · ');

    const container = document.getElementById('exercises');
    container.innerHTML = '';
    plan.exercises.forEach((ex, index) => {
        container.appendChild(index === editingIndex ? renderEditCard(index) : renderViewCard(ex, index));
    });

    document.getElementById('undoBtn').disabled = historyStack.length === 0;
    document.getElementById('redoBtn').disabled = redoStack.length === 0;
}

function cardShell(index, buttons, bodyHtml) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-xl-4';
    col.innerHTML = `
        <div class="card exercise-card h-100">
            <div class="card-header gradient-bg">
                <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                    <h6 class="mb-0 small" style="font-size: 0.9rem;">
                        <i class="bi bi-trophy"></i> Übung ${index + 1}
                    </h6>
                    <div class="d-flex gap-1">${buttons}</div>
                </div>
            </div>
            <div class="card-body">${bodyHtml}</div>
        </div>`;
    return col;
}

function hintsHtml(index, ex) {
    const hints = hintsFor(index, ex);
    if (hints.length === 0) return '';
    return `<div class="alert alert-danger py-2 mt-2 mb-0"><small><i class="bi bi-exclamation-circle"></i> `
        + hints.map(escapeHtml).join('<br>') + '</small></div>';
}

function renderViewCard(ex, index) {
    let body = '';
    if (ex.pairs.length > 0) {
        body += '<div class="row g-2">' + ex.pairs.map(p => `
            <div class="col-md-6">
                <div class="alert alert-info mb-0 d-flex align-items-center">
                    <i class="bi bi-person-fill me-2"></i>
                    <span><strong>${escapeHtml(p.player1.name)}</strong> & <strong>${escapeHtml(p.player2.name)}</strong></span>
                </div>
            </div>`).join('') + '</div>';
    }
    ex.balleimer.forEach((bucket, b) => {
        body += `<div class="alert alert-success mb-0 mt-2"><i class="bi bi-basket me-2"></i>
            <strong>Balleimer ${b + 1}:</strong> ${bucket.map(p => escapeHtml(p.name)).join(', ')}</div>`;
    });
    ex.sparring.forEach(s => {
        body += `<div class="alert alert-primary mb-0 mt-2"><i class="bi bi-person-badge me-2"></i>
            <strong>${escapeHtml(s.partner)}:</strong> ${escapeHtml(s.player.name)}</div>`;
    });
    if (ex.unpaired.length > 0) {
        body += `<div class="alert alert-warning mb-0 mt-2"><i class="bi bi-exclamation-triangle-fill me-2"></i>
            <strong>Ohne Partner:</strong> ${ex.unpaired.map(p => escapeHtml(p.name)).join(', ')}</div>`;
    }
    body += hintsHtml(index, ex);

    const buttons = `<button class="btn btn-outline-light btn-sm py-0 px-2" title="Bearbeiten"
        onclick="startEdit(${index})"><i class="bi bi-pencil"></i></button>`;
    return cardShell(index, buttons, body);
}

function renderEditCard(index) {
    const players = [...plan.players].sort((a, b) => a.name.localeCompare(b.name));
    let slot = 0;
    const select = (current) => {
        const i = slot++;
        const options = players.map(p =>
            `<option value="${escapeHtml(p.name)}"${p.name === current.name ? ' selected' : ''}>`
            + `${escapeHtml(p.name)} (${p.klassierung})</option>`).join('');
        return `<select class="form-select form-select-sm player-select" data-slot="${i}">${options}</select>`;
    };

    let body = '';
    if (draft.pairs.length > 0) {
        body += '<div class="slot-label text-muted"><i class="bi bi-people"></i> Paare</div><div class="row g-2">'
            + draft.pairs.map(p => `
                <div class="col-12">
                    <div class="input-group input-group-sm">
                        ${select(p.player1)}<span class="input-group-text">&</span>${select(p.player2)}
                    </div>
                </div>`).join('') + '</div>';
    }
    draft.balleimer.forEach((bucket, b) => {
        body += `<div class="slot-label text-success mt-3"><i class="bi bi-basket"></i> Balleimer ${b + 1}</div>
            <div class="d-flex flex-column gap-1">${bucket.map(p => select(p)).join('')}</div>`;
    });
    draft.sparring.forEach(s => {
        body += `<div class="slot-label text-primary mt-3"><i class="bi bi-person-badge"></i> ${escapeHtml(s.partner)}</div>
            ${select(s.player)}`;
    });
    if (draft.unpaired.length > 0) {
        body += `<div class="slot-label text-warning mt-3"><i class="bi bi-exclamation-triangle-fill"></i> Ohne Partner</div>
            <div class="d-flex flex-column gap-1">${draft.unpaired.map(p => select(p)).join('')}</div>`;
    }
    body += hintsHtml(index, draft);

    const isLast = index === plan.exercises.length - 1;
    const buttons = `
        <button class="btn btn-light btn-sm py-0 px-2" onclick="saveEdit()" title="Speichern">
            <i class="bi bi-check-lg"></i> Speichern</button>
        <button class="btn btn-outline-light btn-sm py-0 px-2" onclick="cancelEdit()" title="Abbrechen">
            <i class="bi bi-x-lg"></i></button>
        ${isLast ? '' : `<button class="btn btn-warning btn-sm py-0 px-2" id="regenerateBtn"
            onclick="regenerateRemaining(${index})" title="Speichern und alle folgenden Übungen neu einteilen">
            <i class="bi bi-arrow-clockwise"></i> Folgende neu</button>`}`;

    const card = cardShell(index, buttons, body);
    card.querySelectorAll('.player-select').forEach(el =>
        el.addEventListener('change', () => changeSlot(parseInt(el.dataset.slot, 10), el.value)));
    return card;
}

// ===== EDITING =====
function pushHistory() {
    historyStack.push(clone(plan.exercises));
    redoStack = [];
}

function startEdit(index) {
    if (editingIndex !== null) saveEdit();
    editingIndex = index;
    draft = clone(plan.exercises[index]);
    render();
}

function saveEdit() {
    if (editingIndex === null) return;
    if (JSON.stringify(draft) !== JSON.stringify(plan.exercises[editingIndex])) {
        pushHistory();
        plan.exercises[editingIndex] = draft;
    }
    editingIndex = null;
    draft = null;
    render();
}

function cancelEdit() {
    editingIndex = null;
    draft = null;
    render();
}

function regenerateRemaining(index) {
    if (regenerating) return;
    regenerating = true;
    saveEdit();

    fetch('/api/regenerate-exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, keepThrough: index })
    })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || response.statusText);
            return data;
        })
        .then(data => {
            pushHistory();
            plan.exercises = data.exercises;
            render();
        })
        .catch(error => {
            console.error('Error regenerating exercises:', error);
            alert('Neu einteilen fehlgeschlagen: ' + error.message);
        })
        .finally(() => { regenerating = false; });
}

// ===== UNDO / REDO =====
function undo() {
    if (historyStack.length === 0) return;
    cancelEdit();
    redoStack.push(clone(plan.exercises));
    plan.exercises = historyStack.pop();
    render();
}

function redo() {
    if (redoStack.length === 0) return;
    cancelEdit();
    historyStack.push(clone(plan.exercises));
    plan.exercises = redoStack.pop();
    render();
}

// ===== PDF =====
function exportPdf() {
    saveEdit();
    fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
    })
        .then(response => {
            if (!response.ok) throw new Error('PDF export failed');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = (plan.trainingDate || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
            a.download = date ? `trainingsplan-${date}.pdf` : 'trainingsplan.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        })
        .catch(error => {
            console.error('Export error:', error);
            alert('PDF Export fehlgeschlagen');
        });
}

document.addEventListener('DOMContentLoaded', () => {
    render();

    document.addEventListener('keydown', (e) => {
        // Leave Ctrl+Z inside form fields to the browser
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            redo();
        }
    });
});
