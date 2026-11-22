// Plan page: shows the stored plan, follows the training Übung by Übung
// ("Jetzt"), edits one exercise at a time, adjusts the plan to who is actually
// there, undo, PDF.
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
let changedCards = new Set(); // Übungen the last re-plan or undo changed, marked until the next change
let attendance = null; // {present: Set of names, added: [players]} while the sheet is open

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

// The Übung being played right now: null before the start, exercises.length once finished
function nowIndex() {
    return Number.isInteger(plan.now) ? plan.now : null;
}

// Changes made during the training start with the next Übung, never with one already played
function firstOpenExercise() {
    const now = nowIndex();
    if (now === null) return 1;
    return Math.min(now + 2, plan.exercises.length);
}

function isPlayed(index) {
    const now = nowIndex();
    return now !== null && index < now;
}

// "Übung 3 (jetzt)" options; played ones are shown but cannot be picked
function fromOptions(prefix) {
    const now = nowIndex();
    return plan.exercises.map((_, i) => {
        const played = isPlayed(i);
        const note = i === now ? ' (jetzt)' : played ? ' (gespielt)' : '';
        return `<option value="${i + 1}"${played ? ' disabled' : ''}>${prefix}${exerciseLabel(i + 1)}${note}</option>`;
    }).join('');
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
    return clone({
        players: plan.players, absent: plan.absent || [], exercises: plan.exercises,
        settings: plan.settings, now: nowIndex()
    });
}

function restore(state) {
    plan.players = state.players;
    plan.absent = state.absent;
    plan.exercises = state.exercises;
    if (state.settings) plan.settings = state.settings;
    plan.now = state.now;
}

function pushHistory() {
    historyStack.push(snapshot());
    redoStack = [];
    changedCards = new Set();
}

function undo() {
    if (historyStack.length === 0 || busy) return;
    cancelEdit();
    const before = plan.exercises;
    redoStack.push(snapshot());
    restore(historyStack.pop());
    savePlan();
    renderWithFlip(before);
    toast('Rückgängig gemacht', { label: 'Wiederholen', run: redo });
}

function redo() {
    if (redoStack.length === 0 || busy) return;
    cancelEdit();
    const before = plan.exercises;
    historyStack.push(snapshot());
    restore(redoStack.pop());
    savePlan();
    renderWithFlip(before);
    toast('Wiederhergestellt', { label: 'Rückgängig', run: undo });
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
    const holderIndex = slots.findIndex((s, i) => i !== slotIndex && s.get().name === name);
    const holder = holderIndex === -1 ? null : slots[holderIndex];
    target.set(chosen);
    if (holder) holder.set(previous);
    renderExercises();
    // Keep focus on the select that was just changed
    const again = document.querySelector(`select[data-slot="${slotIndex}"]`);
    if (again) again.focus();
    if (holder) {
        // Both places light up, so the swap is visible
        Motion.flash(again);
        Motion.flash(document.querySelector(`select[data-slot="${holderIndex}"]`));
        toast(`${previous.name} und ${name} getauscht`);
    }
}

// ===== RULE HINTS =====
// What this exercise breaks or repeats; recomputed after every change.
// "rule": a setting is broken (red). "warn": worth a look (amber).
// "note": expected and already announced on the entry page (quiet).
function hintsFor(index, ex) {
    const hints = [];
    const add = (level, text) => hints.push({ level, text });
    const never = new Set((plan.settings.neverTogether || []).map(pair => [...pair].sort().join('\u0000')));
    const noBalleimer = new Set(plan.settings.noBalleimer || []);
    const noSparring = new Set(plan.settings.noSparring || []);
    ex.balleimer.flat().forEach(p => {
        if (noBalleimer.has(p.name)) add('rule', `${p.name} soll nicht an den Balleimer.`);
    });
    ex.sparring.forEach(sp => {
        if (noSparring.has(sp.player.name)) add('rule', `${sp.player.name} soll kein Sparring spielen.`);
    });
    ex.pairs.forEach(p => {
        if (never.has([p.player1.name, p.player2.name].sort().join('\u0000'))) {
            add('rule', `${p.player1.name} & ${p.player2.name} sollen nie zusammen spielen.`);
        }
    });
    const length = mentalLength();
    if (length > 1 && index % length !== 0 && ex.mentalTrainer.length > 0) {
        const previous = plan.exercises[index - 1].mentalTrainer.map(p => p.name).sort().join('|');
        if (previous !== ex.mentalTrainer.map(p => p.name).sort().join('|')) {
            add('warn', `Mentaltrainer-Gruppe wechselt mitten in der Einheit (anders als ${exerciseLabel(index)}).`);
        }
    }
    const pairKey = (a, b) => [a, b].sort().join('\u0000');
    for (let e = 0; e < index; e++) {
        const earlier = plan.exercises[e];
        const label = exerciseLabel(e + 1);
        const earlierPairs = new Set(earlier.pairs.map(p => pairKey(p.player1.name, p.player2.name)));
        ex.pairs.forEach(p => {
            if (earlierPairs.has(pairKey(p.player1.name, p.player2.name))) {
                add('warn', `${p.player1.name} & ${p.player2.name} spielten schon in ${label} zusammen.`);
            }
        });
        const earlierBuckets = new Set(earlier.balleimer.flat().map(p => p.name));
        ex.balleimer.flat().forEach(p => {
            // Extra turns are intended for starred kids, and for everyone when strong kids go more often
            const intended = plan.settings.strongAtStations || (plan.settings.extraStationKids || []).includes(p.name);
            if (earlierBuckets.has(p.name) && !intended) add('note', `${p.name} war schon in ${label} am Balleimer.`);
        });
        ex.sparring.forEach(s => {
            if (earlier.sparring.some(o => o.partner === s.partner && o.player.name === s.player.name)) {
                add('note', `${s.player.name} spielte schon in ${label} mit ${s.partner}.`);
            }
        });
        const earlierUnpaired = new Set(earlier.unpaired.map(p => p.name));
        ex.unpaired.forEach(p => {
            if (earlierUnpaired.has(p.name)) add('warn', `${p.name} war schon in ${label} ohne Partner.`);
        });
    }
    return hints;
}

function hintsHtml(index, ex) {
    const hints = hintsFor(index, ex);
    if (hints.length === 0) return '';
    const list = (level, cls, icon) => {
        const items = hints.filter(h => h.level === level);
        if (items.length === 0) return '';
        return `<div class="hints ${cls}"><i class="bi ${icon}" aria-hidden="true"></i>`
            + `<ul>${items.map(h => `<li>${escapeHtml(h.text)}</li>`).join('')}</ul></div>`;
    };
    return list('rule', 'notice notice-danger', 'bi-x-octagon')
        + list('warn', 'notice notice-warn', 'bi-exclamation-triangle')
        + list('note', 'hints-note', 'bi-info-circle');
}

// ===== RENDERING =====
function render() {
    if (!plan || !Array.isArray(plan.exercises)) {
        $('emptyState').hidden = false;
        $('planMeta').textContent = '';
        return;
    }
    plan.players = plan.players.map(withElo);
    plan.absent = (plan.absent || []).map(withElo);
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

    $('actionbar').hidden = false;
    $('exnav').hidden = false;
    $('pdfBtn').hidden = false;

    renderNav();
    renderExercises();
    renderBar();
}

function renderNav() {
    const nav = $('exnavInner');
    const now = nowIndex();
    nav.innerHTML = '<span class="exnav-indicator" aria-hidden="true"></span>' + plan.exercises.map((_, i) => {
        const state = i === now ? ' is-now' : isPlayed(i) ? ' is-played' : '';
        const note = i === now ? ', läuft jetzt' : isPlayed(i) ? ', gespielt' : '';
        return `<a href="#ex-${i + 1}" class="${state.trim()}" aria-label="${exerciseLabel(i + 1)}${note}"`
            + `${i === currentIndex ? ' aria-current="true"' : ''}>${i + 1}</a>`;
    }).join('');
    Motion.slideTo(nav.querySelector('.exnav-indicator'), nav.querySelectorAll('a')[currentIndex], true);
}

function renderExercises() {
    const container = $('exercises');
    container.innerHTML = '';
    plan.exercises.forEach((ex, index) => {
        container.appendChild(index === editingIndex ? renderEditCard(index) : renderViewCard(ex, index));
    });
    observeExercises();
}

// One span per kid, keyed by exercise and name, so re-plans can glide names to their new places
function who(name, index, suffix = '') {
    return `<span class="who" data-flip-id="${index}|${escapeHtml(name)}">${escapeHtml(name)}${suffix}</span>`;
}

// The comma rides along inside the name, so the row's gap does not open up before it
function names(players, index) {
    return players.map((p, i) => who(p.name, index, i < players.length - 1 ? ',' : '')).join(' ');
}

function renderViewCard(ex, index) {
    const section = document.createElement('section');
    const now = nowIndex();
    section.className = 'exercise' + (index === now ? ' is-now' : isPlayed(index) ? ' is-played' : '');
    section.dataset.flipId = `card-${index}`;
    section.id = `ex-${index + 1}`;
    section.setAttribute('aria-labelledby', `ex-title-${index + 1}`);

    let body = '';
    if (ex.pairs.length > 0) {
        body += `<h3 class="group-label">Paare</h3><ul class="rows">`
            + ex.pairs.map(p => `<li class="row">${who(p.player1.name, index)}`
                + `<span class="amp">&amp;</span>${who(p.player2.name, index)}</li>`).join('')
            + '</ul>';
    }
    const stations = [];
    if (ex.mentalTrainer.length > 0) {
        const session = mentalSessionLabel(index);
        stations.push(`<li class="row row-mental">
        <span class="tag"><i class="bi bi-lightbulb" aria-hidden="true"></i> Mentaltrainer${session ? ` · ${session}` : ''}</span>
        ${names(ex.mentalTrainer, index)}</li>`);
    }
    ex.balleimer.forEach((bucket, b) => stations.push(`<li class="row row-bucket">
        <span class="tag"><i class="bi bi-basket" aria-hidden="true"></i> Balleimer ${b + 1}</span> ${names(bucket, index)}</li>`));
    ex.sparring.forEach(sp => stations.push(`<li class="row row-sparring">
        <span class="tag"><i class="bi bi-person-badge" aria-hidden="true"></i> ${escapeHtml(sp.partner)}</span>
        ${who(sp.player.name, index)}</li>`));
    if (ex.unpaired.length > 0) stations.push(`<li class="row row-pause">
        <span class="tag">Ohne Partner</span> ${names(ex.unpaired, index)}</li>`);
    if (stations.length > 0) {
        body += `<h3 class="group-label">Stationen</h3><ul class="rows">${stations.join('')}</ul>`;
    }
    body += hintsHtml(index, ex);

    const badge = index === now ? '<span class="ex-badge is-now">Jetzt</span>'
        : isPlayed(index) ? '<span class="ex-badge"><i class="bi bi-check2" aria-hidden="true"></i> Gespielt</span>'
            : changedCards.has(index) ? '<span class="ex-badge is-changed">Neu eingeteilt</span>' : '';
    section.innerHTML = `
        <div class="exercise-head">
            <h2 id="ex-title-${index + 1}">${exerciseLabel(index + 1)} ${badge}</h2>
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
            + `${escapeHtml(p.name)} (${p.elo})</option>`).join('');
        return `<select class="control" data-slot="${i}" aria-label="${escapeHtml(label)}">${options}</select>`;
    };

    let body = '<p class="info edit-hint">Kind wählen – wer den Platz hatte, tauscht mit.</p>';
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
    section.dataset.flipId = `card-${index}`;
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
    const switched = $('editBar').hidden === editing;
    $('viewBar').hidden = editing;
    $('editBar').hidden = !editing;
    if (switched) Motion.enter([editing ? $('editBar') : $('viewBar')]);
    $('undoBtn').disabled = historyStack.length === 0 || busy;
    $('missingBtn').disabled = busy;
    $('addKidBtn').disabled = busy;

    const absent = (plan.absent || []).length;
    $('absentBadge').hidden = absent === 0;
    $('absentBadge').textContent = absent;
    $('missingBtn').setAttribute('aria-label', absent > 0 ? `Fehlt (${absent} fehlen)` : 'Fehlt');

    // Start → Weiter → Fertig
    const now = nowIndex();
    const total = plan.exercises.length;
    const next = $('nextBtn');
    const icon = next.querySelector('i');
    if (now === null) {
        $('nextLabel').textContent = 'Start';
        next.setAttribute('aria-label', `Training starten mit ${exerciseLabel(1)}`);
        icon.className = 'bi bi-play-fill';
    } else if (now < total - 1) {
        $('nextLabel').innerHTML = `Weiter: <span class="next-num">${now + 2}</span>`;
        next.setAttribute('aria-label', `${exerciseLabel(now + 1)} fertig, weiter mit ${exerciseLabel(now + 2)}`);
        icon.className = 'bi bi-skip-end-fill';
    } else if (now === total - 1) {
        $('nextLabel').textContent = 'Fertig';
        next.setAttribute('aria-label', `${exerciseLabel(total)} fertig, Training beendet`);
        icon.className = 'bi bi-flag-fill';
    } else {
        $('nextLabel').textContent = 'Beendet';
        next.setAttribute('aria-label', 'Training beendet');
        icon.className = 'bi bi-check2-all';
    }
    next.disabled = busy || (now !== null && now >= total);

    if (editing) {
        const n = editingIndex + 1;
        const regen = $('regenerateBtn');
        regen.hidden = n === total;
        $('regenerateLabel').textContent = n + 1 === total ? `Übung ${total} neu` : `Ab ${n + 1} neu`;
        regen.setAttribute('aria-label', n + 1 === total
            ? `Speichern und Übung ${total} neu einteilen`
            : `Speichern und Übungen ${n + 1}–${total} neu einteilen`);
        regen.disabled = busy;
    }
}

// One tap per Übung: the trainer always sees what is on now, and changes start after it
function advance() {
    if (busy) return;
    if (editingIndex !== null) saveEdit({ quiet: true });
    const total = plan.exercises.length;
    const now = nowIndex();
    if (now !== null && now >= total) return;
    pushHistory();
    plan.now = now === null ? 0 : now + 1;
    savePlan();
    renderNav();
    renderExercises();
    renderBar();
    // No toast: the button itself shows the step, its number rolls up to the next Übung
    const num = $('nextLabel').querySelector('.next-num');
    if (num) Motion.tick(num, 1);
    else Motion.pop($('nextLabel'));
    if (plan.now < total) {
        const card = $(`ex-${plan.now + 1}`);
        Motion.scrollTo(card);
        Motion.pop(card.querySelector('.ex-badge'));
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
                    Motion.slideTo(document.querySelector('#exnavInner .exnav-indicator'), a);
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
    Motion.scrollTo(card);
    Motion.enter(card.querySelectorAll('.slot-group'));
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
    if (changed) Motion.flash($(`ex-${index + 1}`));
    if (!quiet) toast(changed ? `${exerciseLabel(index + 1)} gespeichert` : 'Keine Änderung');
}

function cancelEdit() {
    if (editingIndex === null) return;
    editingIndex = null;
    draft = null;
    renderExercises();
    renderBar();
}

// Re-render after a re-plan or undo. Only the Übungen that changed and are on
// screen animate: their names glide to the new places, so the trainer sees who
// moved. Everything else just re-renders (a full-page Flip froze phones).
function renderWithFlip(beforeExercises) {
    const before = beforeExercises || [];
    const changed = plan.exercises
        .map((ex, i) => JSON.stringify(ex) !== JSON.stringify(before[i]) ? i : -1)
        .filter(i => i >= 0);
    changedCards = new Set(changed);
    const inView = changed.filter(i => {
        const card = $(`ex-${i + 1}`);
        if (!card) return false;
        const box = card.getBoundingClientRect();
        return box.bottom > 0 && box.top < window.innerHeight;
    });
    if (inView.length === 0) render();
    else Motion.flip(inView.map(i => `#ex-${i + 1} [data-flip-id]`).join(','), render);
    inView.forEach(i => Motion.flash($(`ex-${i + 1}`)));
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
            const before = plan.exercises;
            pushHistory();
            plan.players = nextPlan.players;
            plan.absent = nextPlan.absent;
            plan.exercises = data.exercises;
            plan.settings = data.settings;
            savePlan();
            renderWithFlip(before);
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
    if (busy) return;
    if (editingIndex !== null) saveEdit({ quiet: true });
    attendance = { present: new Set(plan.players.map(p => p.name)), added: [] };
    $('applyFrom').innerHTML = fromOptions('ab ');
    $('applyFrom').value = String(firstOpenExercise());
    renderAttendance();
    Motion.openDialog($('missingDialog'));
    Motion.enter($('attendanceChips').children);
}

function closeAttendance() {
    Motion.closeDialog($('missingDialog'));
}

function attendanceChanged() {
    if (!attendance) return false;
    const before = new Set(plan.players.map(p => p.name));
    if (attendance.added.length > 0) return true;
    if (before.size !== attendance.present.size) return true;
    return [...before].some(name => !attendance.present.has(name));
}

function renderAttendance() {
    if (!attendance) return;
    $('presentCount').textContent = attendance.present.size;

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
            const again = [...$('attendanceChips').children].find(c => c.textContent === kid.name);
            if (again) again.focus();
        });
        chips.appendChild(button);
    });

    const changed = attendanceChanged();
    const from = parseInt($('applyFrom').value || '1', 10);
    const apply = $('applyAttendance');
    apply.disabled = !changed || busy;
    apply.textContent = from === 1 ? 'Ganzen Plan anpassen' : `Ab ${exerciseLabel(from)} anpassen`;
    const missing = allKids().length - attendance.present.size;
    $('applyHint').textContent = (missing === 0 ? 'Alle da. ' : `${missing} ${missing === 1 ? 'fehlt' : 'fehlen'}. `)
        + (from === 1 ? 'Alle Übungen werden neu eingeteilt.' : `Übung 1${from > 2 ? `–${from - 1}` : ''} bleibt wie sie ist.`);
}

function applyAttendance() {
    if (busy || !attendanceChanged()) return;
    const from = parseInt($('applyFrom').value, 10);
    const kids = allKids();
    const next = clone(plan);
    next.players = kids.filter(k => attendance.present.has(k.name));
    next.absent = kids.filter(k => !attendance.present.has(k.name));
    if (next.players.length < 2) {
        $('applyHint').textContent = 'Mindestens zwei Kinder müssen da sein.';
        Motion.shake($('applyHint'));
        return;
    }

    $('applyAttendance').disabled = true;
    replan(next, from - 2)
        .then(() => {
            closeAttendance();
            Motion.scrollTo($(`ex-${from}`));
            toast(`Plan ab ${exerciseLabel(from)} angepasst`, { label: 'Rückgängig', run: undo });
        })
        .catch(error => {
            $('applyHint').textContent = 'Anpassen ging nicht: ' + error.message;
            renderAttendance();
        });
}

// ===== KIND KOMMT DAZU =====
// A late kid joins from a chosen exercise; the stations for the rest can change too
const MAX_BALLEIMER = 6;
const MAX_PER_BALLEIMER = 8;
let addKidSizes = [];

function openAddKid() {
    if (editingIndex !== null) saveEdit({ quiet: true });
    addKidSizes = [...(plan.settings.balleimerSizes || [])];
    $('addKidName').value = '';
    // A newcomer is usually a beginner: start at the weakest Elo of the day
    $('addKidElo').value = defaultElo(plan.players);
    $('addKidMental').value = plan.settings.mentalTrainerKids || 0;
    $('addKidFrom').innerHTML = fromOptions('');
    $('addKidFrom').value = String(firstOpenExercise());
    // Absent kids can come back by name
    $('addKidKnown').innerHTML = (plan.absent || []).map(k => `<option value="${escapeHtml(k.name)}">`).join('');
    $('addKidError').hidden = true;
    renderAddKid();
    Motion.openDialog($('addKidDialog'));
    $('addKidName').focus();
}

function renderAddKid() {
    const list = $('addKidBuckets');
    list.innerHTML = '';
    addKidSizes.forEach((size, index) => {
        const n = index + 1;
        const item = document.createElement('li');
        item.innerHTML = `
            <label><span class="bucket-no">${n}</span> <i class="bi bi-basket" aria-hidden="true"></i>
                <span class="visually-hidden">Balleimer ${n}, Kinder</span></label>
            <div class="stepper">
                <button type="button" class="btn" aria-label="Balleimer ${n}: ein Kind weniger"${size <= 1 ? ' disabled' : ''}>−</button>
                <input type="number" readonly tabindex="-1" value="${size}" aria-label="Balleimer ${n}: Kinder">
                <button type="button" class="btn" aria-label="Balleimer ${n}: ein Kind mehr"${size >= MAX_PER_BALLEIMER ? ' disabled' : ''}>+</button>
            </div>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet" aria-label="Balleimer ${n} entfernen">
                <i class="bi bi-trash3" aria-hidden="true"></i></button>`;
        const [minus, plus, remove] = item.querySelectorAll('button');
        minus.addEventListener('click', () => { addKidSizes[index] -= 1; renderAddKid(); });
        plus.addEventListener('click', () => { addKidSizes[index] += 1; renderAddKid(); });
        remove.addEventListener('click', () => { addKidSizes.splice(index, 1); renderAddKid(); });
        list.appendChild(item);
    });
    $('addKidAddBucket').disabled = addKidSizes.length >= MAX_BALLEIMER;

    // What each exercise looks like with the new kid
    const kids = plan.players.length + 1;
    const atBuckets = addKidSizes.reduce((sum, size) => sum + size, 0);
    const sparring = plan.settings.sparringPartners.length;
    const mental = parseInt($('addKidMental').value, 10) || 0;
    const playing = kids - atBuckets - sparring - mental;
    const stats = $('addKidStats');
    if (playing < 0) {
        stats.className = 'stats is-error';
        stats.textContent = `Zu viele Plätze: ${kids - playing} pro Übung, aber nur ${kids} Kinder.`;
    } else {
        const item = (icon, value, label, cls = '') => `<span class="stat ${cls}" title="${label}">`
            + `<i class="bi ${icon}" aria-hidden="true"></i> ${value}<span class="visually-hidden"> ${label}</span></span>`;
        let html = item('bi-people', kids, 'Kinder') + item('bi-arrow-left-right', Math.floor(playing / 2), 'Paare');
        if (atBuckets > 0) html += item('bi-basket', atBuckets, 'am Balleimer', 'is-bucket');
        if (sparring > 0) html += item('bi-person-badge', sparring, 'im Sparring', 'is-sparring');
        if (mental > 0) html += item('bi-lightbulb', mental, 'beim Mentaltrainer', 'is-mental');
        if (playing % 2 === 1) html += item('bi-exclamation-triangle-fill', 1, 'ohne Partner', 'is-warn');
        stats.className = 'stats';
        stats.innerHTML = html;
    }
    renderAddKidFix(playing);
    const from = parseInt($('addKidFrom').value || '1', 10);
    $('confirmAddKid').textContent = from === 1 ? 'Hinzufügen' : `Ab ${exerciseLabel(from)} dabei`;
    $('confirmAddKid').disabled = playing < 0 || busy;
}

// With an odd number one kid would stand alone: offer the one-tap fix
let addKidFixAction = null;
function renderAddKidFix(playing) {
    const fix = $('addKidFix');
    addKidFixAction = null;
    if (playing >= 0 && playing % 2 === 1) {
        // Smallest Balleimer that can take one more
        const open = addKidSizes.map((size, i) => ({ size, i })).filter(b => b.size < MAX_PER_BALLEIMER)
            .sort((x, y) => x.size - y.size)[0];
        if (open) {
            fix.textContent = `Balleimer ${open.i + 1}: 1 Kind mehr (${open.size} → ${open.size + 1})`;
            addKidFixAction = () => { addKidSizes[open.i] += 1; };
        } else if (addKidSizes.length < MAX_BALLEIMER) {
            fix.textContent = 'Balleimer mit 1 Kind dazu';
            addKidFixAction = () => { addKidSizes.push(1); };
        }
    }
    fix.hidden = !addKidFixAction;
}

function confirmAddKid(event) {
    event.preventDefault();
    const name = $('addKidName').value.trim();
    const elo = parseInt($('addKidElo').value, 10);
    const error = $('addKidError');
    const showError = (message, field) => {
        error.textContent = message;
        error.hidden = false;
        Motion.shake(field || error);
        if (field) field.focus();
    };
    if (!name) return showError('Bitte einen Namen eingeben.', $('addKidName'));
    if (isNaN(elo) || elo < ELO_MIN || elo > ELO_MAX) return showError(`Elo zwischen ${ELO_MIN} und ${ELO_MAX}.`, $('addKidElo'));
    if (plan.players.some(p => p.name === name)) return showError(`${name} ist schon da.`, $('addKidName'));
    if (plan.settings.sparringPartners.includes(name)) return showError(`${name} ist Sparringpartner.`, $('addKidName'));

    const from = parseInt($('addKidFrom').value, 10);
    const next = clone(plan);
    next.absent = (next.absent || []).filter(k => k.name !== name);
    next.players.push({ name, elo });
    next.settings.balleimerSizes = [...addKidSizes];
    next.settings.mentalTrainerKids = parseInt($('addKidMental').value, 10) || 0;

    $('confirmAddKid').disabled = true;
    replan(next, from - 2)
        .then(() => {
            Motion.closeDialog($('addKidDialog'));
            toast(`${name} ab ${exerciseLabel(from)} dabei`, { label: 'Rückgängig', run: undo });
            const target = $(`ex-${from}`);
            Motion.scrollTo(target);
        })
        .catch(e => showError('Hinzufügen ging nicht: ' + e.message))
        .finally(() => renderAddKid());
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
    Motion.enter(document.querySelectorAll('.exercise'));

    $('undoBtn').addEventListener('click', undo);
    $('nextBtn').addEventListener('click', advance);
    $('pdfBtn').addEventListener('click', exportPdf);
    $('saveEdit').addEventListener('click', () => saveEdit());
    $('cancelEdit').addEventListener('click', cancelEdit);
    $('regenerateBtn').addEventListener('click', regenerateFollowing);

    $('missingBtn').addEventListener('click', openAttendance);
    $('closeMissing').addEventListener('click', closeAttendance);
    $('missingDialog').addEventListener('close', () => { attendance = null; });
    $('applyFrom').addEventListener('change', renderAttendance);
    $('addKidFrom').addEventListener('change', renderAddKid);
    $('addKidFix').addEventListener('click', () => {
        if (!addKidFixAction) return;
        addKidFixAction();
        renderAddKid();
        Motion.flash($('addKidBuckets'));
    });
    $('addKidBtn').addEventListener('click', openAddKid);
    $('addKidForm').addEventListener('submit', confirmAddKid);
    $('cancelAddKid').addEventListener('click', () => Motion.closeDialog($('addKidDialog')));
    $('closeAddKid').addEventListener('click', () => Motion.closeDialog($('addKidDialog')));
    $('addKidAddBucket').addEventListener('click', () => {
        addKidSizes.push(addKidSizes.length > 0 ? addKidSizes[addKidSizes.length - 1] : 2);
        renderAddKid();
    });
    document.querySelectorAll('[data-kid-step]').forEach(btn => btn.addEventListener('click', () => {
        const input = $('addKidMental');
        input.value = Math.min(8, Math.max(0, (parseInt(input.value, 10) || 0) + parseInt(btn.dataset.kidStep, 10)));
        renderAddKid();
    }));
    $('addKidMental').addEventListener('input', renderAddKid);
    // Picking an absent kid by name fills in their Elo
    $('addKidName').addEventListener('input', () => {
        const known = (plan.absent || []).find(k => k.name === $('addKidName').value.trim());
        if (known) $('addKidElo').value = known.elo;
    });
    $('applyAttendance').addEventListener('click', applyAttendance);

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
