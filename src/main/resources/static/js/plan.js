// Plan page: shows the stored plan, edits one exercise at a time, adjusts the
// plan to who is actually there, undo/redo, PDF.
//
// Every kid has exactly one place per exercise (pair, Mentaltrainer, Balleimer,
// sparring or ohne Partner). Editing changes a place by swapping with whoever holds the chosen
// kid, so an exercise always stays complete. The plan is saved in the browser
// after every change, so reload and back never lose it.

let plan = readStored(STORAGE_KEYS.plan);
let editingIndex = null;
let draft = null; // copy of the exercise being edited
let historyStack = [];
let redoStack = [];
let busy = false;
let currentIndex = 0; // exercise nearest the top of the screen
let attendance = null; // {present: Set of names, added: [players]} while the panel is open

const $ = (id) => document.getElementById(id);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function savePlan() {
    if (!writeStored(STORAGE_KEYS.plan, plan)) {
        toast('Der Browser speichert nicht – beim Neuladen geht der Plan verloren.');
    }
}

function playerByName(name) {
    return plan.players.find(p => p.name === name);
}

function exerciseLabel(n) {
    return `Übung ${n}`;
}

function mentalLength() {
    return Math.max(1, (plan.settings && plan.settings.mentalTrainerLength) || 1);
}

// "Übung 3–4" for the Mentaltrainer session an exercise belongs to
function mentalSessionLabel(index) {
    const length = mentalLength();
    if (length === 1) return '';
    const first = index - (index % length) + 1;
    const last = Math.min(first + length - 1, plan.exercises.length);
    return first === last ? `Übung ${first}` : `Übung ${first}–${last}`;
}

// ===== HISTORY =====
// Snapshots include the kids, since adjusting attendance changes them
function snapshot() {
    return clone({ players: plan.players, absent: plan.absent || [], exercises: plan.exercises });
}

function restore(state) {
    plan.players = state.players;
    plan.absent = state.absent;
    plan.exercises = state.exercises;
}

function pushHistory() {
    historyStack.push(snapshot());
    redoStack = [];
}

function undo() {
    if (historyStack.length === 0 || busy) return;
    cancelEdit();
    redoStack.push(snapshot());
    restore(historyStack.pop());
    savePlan();
    render();
    toast('Rückgängig gemacht');
}

function redo() {
    if (redoStack.length === 0 || busy) return;
    cancelEdit();
    historyStack.push(snapshot());
    restore(redoStack.pop());
    savePlan();
    render();
    toast('Wiederhergestellt');
}

// ===== PLACES =====
// Every kid-holding position of an exercise, in display order
function slotsOf(ex) {
    const slots = [];
    ex.pairs.forEach(pair => {
        slots.push({ get: () => pair.player1, set: p => { pair.player1 = p; } });
        slots.push({ get: () => pair.player2, set: p => { pair.player2 = p; } });
    });
    ex.mentalTrainer.forEach((_, i) => {
        slots.push({ get: () => ex.mentalTrainer[i], set: p => { ex.mentalTrainer[i] = p; } });
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
    renderExercises();
    // Keep focus on the select that was just changed
    const again = document.querySelector(`select[data-slot="${slotIndex}"]`);
    if (again) again.focus();
    if (holder) toast(`${previous.name} und ${name} getauscht`);
}

// ===== RULE HINTS =====
// What this exercise repeats from earlier ones; recomputed after every change
function hintsFor(index, ex) {
    const hints = [];
    const length = mentalLength();
    if (length > 1 && index % length !== 0 && ex.mentalTrainer.length > 0) {
        const previous = plan.exercises[index - 1].mentalTrainer.map(p => p.name).sort().join('|');
        if (previous !== ex.mentalTrainer.map(p => p.name).sort().join('|')) {
            hints.push(`Die Mentaltrainer-Gruppe ist anders als in ${exerciseLabel(index)}, obwohl die Einheit weiterläuft.`);
        }
    }
    const pairKey = (a, b) => [a, b].sort().join('\u0000');
    for (let e = 0; e < index; e++) {
        const earlier = plan.exercises[e];
        const label = exerciseLabel(e + 1);
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

function hintsHtml(index, ex) {
    const hints = hintsFor(index, ex);
    if (hints.length === 0) return '';
    return `<div class="notice notice-danger hints"><ul>${hints.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul></div>`;
}

// ===== RENDERING =====
function render() {
    if (!plan || !Array.isArray(plan.exercises)) {
        $('emptyState').hidden = false;
        $('planMeta').textContent = '';
        return;
    }
    plan.absent = plan.absent || [];
    plan.exercises.forEach(ex => { ex.mentalTrainer = ex.mentalTrainer || []; });

    $('planTitle').textContent = plan.trainingDate ? `Training ${plan.trainingDate}` : 'Trainingsplan';
    document.title = plan.trainingDate ? `Trainingsplan ${plan.trainingDate}` : 'Trainingsplan';
    const s = plan.settings;
    const meta = [`${plan.players.length} Kinder`];
    const sizes = s.balleimerSizes || Array(s.balleimerCount || 0).fill(s.playersPerBalleimer);
    if (sizes.length === 1) meta.push(`1 Balleimer (${sizes[0]})`);
    else if (sizes.length > 1) meta.push(`${sizes.length} Balleimer (${sizes.join(' + ')})`);
    if (s.mentalTrainerKids > 0) {
        meta.push(`Mentaltrainer: ${s.mentalTrainerKids} ${s.mentalTrainerKids === 1 ? 'Kind' : 'Kinder'}`
            + (mentalLength() > 1 ? ` für ${mentalLength()} Übungen` : ''));
    }
    if (s.sparringPartners.length > 0) meta.push(`Sparring: ${s.sparringPartners.join(', ')}`);
    $('planMeta').textContent = meta.join(' · ');

    $('attendance').hidden = false;
    $('actionbar').hidden = false;
    $('exnav').hidden = false;

    renderNav();
    renderAttendance();
    renderExercises();
    renderBar();
}

function renderNav() {
    const nav = $('exnavInner');
    nav.innerHTML = plan.exercises.map((_, i) =>
        `<a href="#ex-${i + 1}" aria-label="${exerciseLabel(i + 1)}"${i === currentIndex ? ' aria-current="true"' : ''}>${i + 1}</a>`
    ).join('');
}

function renderExercises() {
    const container = $('exercises');
    container.innerHTML = '';
    plan.exercises.forEach((ex, index) => {
        container.appendChild(index === editingIndex ? renderEditCard(index) : renderViewCard(ex, index));
    });
    observeExercises();
}

function names(players) {
    return `<span class="who">${players.map(p => escapeHtml(p.name)).join(', ')}</span>`;
}

function renderViewCard(ex, index) {
    const section = document.createElement('section');
    section.className = 'exercise';
    section.id = `ex-${index + 1}`;
    section.setAttribute('aria-labelledby', `ex-title-${index + 1}`);

    let body = '';
    if (ex.pairs.length > 0) {
        body += `<h3 class="group-label">Paare</h3><ul class="rows">`
            + ex.pairs.map(p => `<li class="row"><span class="who">${escapeHtml(p.player1.name)}</span>`
                + `<span class="amp">&amp;</span><span class="who">${escapeHtml(p.player2.name)}</span></li>`).join('')
            + '</ul>';
    }
    const stations = [];
    if (ex.mentalTrainer.length > 0) {
        const session = mentalSessionLabel(index);
        stations.push(`<li class="row row-mental">
        <span class="tag"><i class="bi bi-lightbulb" aria-hidden="true"></i> Mentaltrainer${session ? ` · ${session}` : ''}</span>
        ${names(ex.mentalTrainer)}</li>`);
    }
    ex.balleimer.forEach((bucket, b) => stations.push(`<li class="row row-bucket">
        <span class="tag"><i class="bi bi-basket" aria-hidden="true"></i> Balleimer ${b + 1}</span> ${names(bucket)}</li>`));
    ex.sparring.forEach(sp => stations.push(`<li class="row row-sparring">
        <span class="tag"><i class="bi bi-person-badge" aria-hidden="true"></i> ${escapeHtml(sp.partner)}</span>
        <span class="who">${escapeHtml(sp.player.name)}</span></li>`));
    if (ex.unpaired.length > 0) stations.push(`<li class="row row-pause">
        <span class="tag">Ohne Partner</span> ${names(ex.unpaired)}</li>`);
    if (stations.length > 0) {
        body += `<h3 class="group-label">Stationen</h3><ul class="rows">${stations.join('')}</ul>`;
    }
    body += hintsHtml(index, ex);

    section.innerHTML = `
        <div class="exercise-head">
            <h2 id="ex-title-${index + 1}">${exerciseLabel(index + 1)}</h2>
            <button type="button" class="btn btn-quiet" aria-label="${exerciseLabel(index + 1)} bearbeiten">
                <i class="bi bi-pencil" aria-hidden="true"></i> Bearbeiten</button>
        </div>${body}`;
    section.querySelector('.exercise-head button').addEventListener('click', () => startEdit(index));
    return section;
}

function renderEditCard(index) {
    const players = [...plan.players].sort((a, b) => a.name.localeCompare(b.name));
    let slot = 0;
    const select = (current, label) => {
        const i = slot++;
        const options = players.map(p =>
            `<option value="${escapeHtml(p.name)}"${p.name === current.name ? ' selected' : ''}>`
            + `${escapeHtml(p.name)} (${p.klassierung})</option>`).join('');
        return `<select class="control" data-slot="${i}" aria-label="${escapeHtml(label)}">${options}</select>`;
    };

    let body = '';
    draft.pairs.forEach((p, n) => {
        body += `<div class="slot-group"><span class="tag">Paar ${n + 1}</span>
            ${select(p.player1, `Paar ${n + 1}, erstes Kind`)}${select(p.player2, `Paar ${n + 1}, zweites Kind`)}</div>`;
    });
    if (draft.mentalTrainer.length > 0) {
        body += `<div class="slot-group row-mental"><span class="tag"><i class="bi bi-lightbulb" aria-hidden="true"></i> Mentaltrainer</span>
            ${draft.mentalTrainer.map((p, k) => select(p, `Mentaltrainer, Kind ${k + 1}`)).join('')}</div>`;
    }
    draft.balleimer.forEach((bucket, b) => {
        body += `<div class="slot-group row-bucket"><span class="tag"><i class="bi bi-basket" aria-hidden="true"></i> Balleimer ${b + 1}</span>
            ${bucket.map((p, k) => select(p, `Balleimer ${b + 1}, Kind ${k + 1}`)).join('')}</div>`;
    });
    draft.sparring.forEach(sp => {
        body += `<div class="slot-group row-sparring"><span class="tag"><i class="bi bi-person-badge" aria-hidden="true"></i> ${escapeHtml(sp.partner)}</span>
            ${select(sp.player, `Sparring mit ${sp.partner}`)}</div>`;
    });
    if (draft.unpaired.length > 0) {
        body += `<div class="slot-group"><span class="tag">Ohne Partner</span>
            ${draft.unpaired.map((p, k) => select(p, `Ohne Partner, Kind ${k + 1}`)).join('')}</div>`;
    }
    body += hintsHtml(index, draft);

    const section = document.createElement('section');
    section.className = 'exercise is-editing';
    section.id = `ex-${index + 1}`;
    section.setAttribute('aria-labelledby', `ex-title-${index + 1}`);
    section.innerHTML = `
        <div class="exercise-head">
            <h2 id="ex-title-${index + 1}">${exerciseLabel(index + 1)} <span class="visually-hidden">bearbeiten</span></h2>
        </div>${body}`;
    section.querySelectorAll('select[data-slot]').forEach(el =>
        el.addEventListener('change', () => changeSlot(parseInt(el.dataset.slot, 10), el.value)));
    return section;
}

function renderBar() {
    const editing = editingIndex !== null;
    $('viewBar').hidden = editing;
    $('editBar').hidden = !editing;
    $('undoBtn').disabled = historyStack.length === 0 || busy;
    $('redoBtn').disabled = redoStack.length === 0 || busy;
    if (editing) {
        const n = editingIndex + 1;
        const total = plan.exercises.length;
        $('editHint').textContent = `${exerciseLabel(n)}: Kind auswählen – wer den Platz hatte, wird getauscht.`;
        const regen = $('regenerateBtn');
        regen.hidden = n === total;
        regen.querySelector('span').textContent = n + 1 === total
            ? `Speichern und Übung ${total} neu einteilen`
            : `Speichern und Übungen ${n + 1}–${total} neu einteilen`;
        regen.disabled = busy;
    }
}

// Highlight the exercise nearest the top in the number row
let exerciseObserver = null;
function observeExercises() {
    if (exerciseObserver) exerciseObserver.disconnect();
    const visible = new Map();
    exerciseObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const index = parseInt(entry.target.id.replace('ex-', ''), 10) - 1;
            if (entry.isIntersecting) visible.set(index, entry.boundingClientRect.top);
            else visible.delete(index);
        });
        if (visible.size === 0) return;
        const top = [...visible.entries()].sort((a, b) => a[0] - b[0])[0][0];
        if (top !== currentIndex) {
            currentIndex = top;
            document.querySelectorAll('#exnavInner a').forEach((a, i) => {
                if (i === currentIndex) {
                    a.setAttribute('aria-current', 'true');
                    a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } else {
                    a.removeAttribute('aria-current');
                }
            });
        }
    }, { rootMargin: '-80px 0px -45% 0px' });
    document.querySelectorAll('.exercise').forEach(el => exerciseObserver.observe(el));
}

// ===== EDITING =====
function startEdit(index) {
    if (editingIndex !== null) saveEdit();
    editingIndex = index;
    draft = clone(plan.exercises[index]);
    renderExercises();
    renderBar();
    const card = $(`ex-${index + 1}`);
    card.scrollIntoView({ block: 'start' });
    const first = card.querySelector('select');
    if (first) first.focus({ preventScroll: true });
}

function saveEdit({ quiet = false } = {}) {
    if (editingIndex === null) return;
    const index = editingIndex;
    const changed = JSON.stringify(draft) !== JSON.stringify(plan.exercises[index]);
    if (changed) {
        pushHistory();
        plan.exercises[index] = draft;
        savePlan();
    }
    editingIndex = null;
    draft = null;
    renderExercises();
    renderBar();
    if (!quiet) toast(changed ? `${exerciseLabel(index + 1)} gespeichert` : 'Keine Änderung');
}

function cancelEdit() {
    if (editingIndex === null) return;
    editingIndex = null;
    draft = null;
    renderExercises();
    renderBar();
}

// ===== SERVER: RE-PLAN =====
// Keeps exercises 1..keepThrough+1 and lets the server plan the rest
function replan(nextPlan, keepThrough) {
    busy = true;
    renderBar();
    return fetch('/api/regenerate-exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: nextPlan, keepThrough })
    })
        .then(readJsonResponse)
        .then(data => {
            pushHistory();
            plan.players = nextPlan.players;
            plan.absent = nextPlan.absent;
            plan.exercises = data.exercises;
            savePlan();
            render();
            return data;
        })
        .finally(() => {
            busy = false;
            renderBar();
        });
}

function regenerateFollowing() {
    if (busy || editingIndex === null) return;
    const index = editingIndex;
    saveEdit({ quiet: true });
    replan(clone(plan), index)
        .then(() => toast(`Übungen ab ${index + 2} neu eingeteilt`, { label: 'Rückgängig', run: undo }))
        .catch(error => toast('Neu einteilen ging nicht: ' + error.message));
}

// ===== ATTENDANCE =====
function allKids() {
    const kids = [...plan.players, ...(plan.absent || [])];
    if (attendance) kids.push(...attendance.added);
    return kids.sort((a, b) => a.name.localeCompare(b.name));
}

function openAttendance() {
    attendance = { present: new Set(plan.players.map(p => p.name)), added: [] };
    $('applyFrom').innerHTML = plan.exercises.map((_, i) =>
        `<option value="${i + 1}">${exerciseLabel(i + 1)}</option>`).join('');
    $('applyFrom').value = String(currentIndex + 1);
    renderAttendance();
}

function attendanceChanged() {
    if (!attendance) return false;
    const before = new Set(plan.players.map(p => p.name));
    if (attendance.added.length > 0) return true;
    if (before.size !== attendance.present.size) return true;
    return [...before].some(name => !attendance.present.has(name));
}

function renderAttendance() {
    const open = attendance !== null;
    $('attendanceBody').hidden = !open;
    $('toggleAttendance').setAttribute('aria-expanded', String(open));
    $('toggleAttendance').textContent = open ? 'Schliessen' : 'Anpassen';
    $('presentCount').textContent = open ? attendance.present.size : plan.players.length;
    if (!open) return;

    const chips = $('attendanceChips');
    chips.innerHTML = '';
    allKids().forEach(kid => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toggle-chip';
        const here = attendance.present.has(kid.name);
        button.setAttribute('aria-pressed', String(here));
        button.textContent = kid.name;
        button.addEventListener('click', () => {
            if (attendance.present.has(kid.name)) attendance.present.delete(kid.name);
            else attendance.present.add(kid.name);
            renderAttendance();
        });
        chips.appendChild(button);
    });

    const changed = attendanceChanged();
    $('applyAttendance').disabled = !changed || busy;
    const from = parseInt($('applyFrom').value || '1', 10);
    $('applyHint').textContent = from === 1
        ? 'Der ganze Plan wird neu eingeteilt.'
        : `Übung 1${from > 2 ? `–${from - 1}` : ''} bleibt, wie sie ist.`;
}

function addLateKid() {
    const name = $('lateName').value.trim();
    const klassierung = parseInt($('lateKlassierung').value, 10);
    if (!name) return;
    if (isNaN(klassierung) || klassierung < 1 || klassierung > 21) {
        toast('Die Klassierung liegt zwischen 1 und 21.');
        return;
    }
    if (plan.settings.sparringPartners.includes(name)) {
        toast(`${name} ist als Sparringpartner eingetragen.`);
        return;
    }
    const known = allKids().find(k => k.name === name);
    if (known) {
        attendance.present.add(name);
        toast(`${name} ist wieder dabei`);
    } else {
        attendance.added.push({ name, klassierung });
        attendance.present.add(name);
    }
    $('lateName').value = '';
    renderAttendance();
}

function applyAttendance() {
    if (busy || !attendanceChanged()) return;
    if (editingIndex !== null) saveEdit({ quiet: true });
    const from = parseInt($('applyFrom').value, 10);
    const kids = allKids();
    const next = clone(plan);
    next.players = kids.filter(k => attendance.present.has(k.name));
    next.absent = kids.filter(k => !attendance.present.has(k.name));

    replan(next, from - 2)
        .then(() => {
            attendance = null;
            renderAttendance();
            toast(`Plan ab ${exerciseLabel(from)} angepasst`, { label: 'Rückgängig', run: undo });
            const target = $(`ex-${from}`);
            if (target) target.scrollIntoView({ block: 'start' });
        })
        .catch(error => toast('Anpassen ging nicht: ' + error.message));
}

// ===== PDF =====
function exportPdf() {
    if (editingIndex !== null) saveEdit({ quiet: true });
    const button = $('pdfBtn');
    button.disabled = true;
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
            toast('PDF heruntergeladen');
        })
        .catch(() => toast('Das PDF konnte nicht erstellt werden. Bitte nochmals versuchen.'))
        .finally(() => { button.disabled = false; });
}

// ===== WIRING =====
document.addEventListener('DOMContentLoaded', () => {
    render();
    if (!plan) return;

    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('pdfBtn').addEventListener('click', exportPdf);
    $('saveEdit').addEventListener('click', () => saveEdit());
    $('cancelEdit').addEventListener('click', cancelEdit);
    $('regenerateBtn').addEventListener('click', regenerateFollowing);

    $('toggleAttendance').addEventListener('click', () => {
        if (attendance) {
            attendance = null;
            renderAttendance();
        } else {
            openAttendance();
        }
    });
    $('applyFrom').addEventListener('change', renderAttendance);
    $('applyAttendance').addEventListener('click', applyAttendance);
    $('addLateBtn').addEventListener('click', addLateKid);
    $('lateName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addLateKid();
        }
    });

    document.addEventListener('keydown', (e) => {
        // Leave Ctrl+Z inside form fields to the browser
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if (e.key === 'Escape' && editingIndex !== null) {
            cancelEdit();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            redo();
        }
    });
});
