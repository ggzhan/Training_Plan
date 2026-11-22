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
            if (earlierUnpaired.has(p.name)) add('warn', `${p.name} war schon in ${label} ohne eigenen Partner.`);
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

    // "5. Dezember" stays on one line
    $('planTitle').textContent = plan.trainingDate ? `Training ${plan.trainingDate.replace(/ /g, '\u00a0')}` : 'Trainingsplan';
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
    $('focusBtn').hidden = false;

    renderNav();
    renderExercises();
    renderBar();
    if (focusOpen()) renderFocus();
}

function renderNav() {
    const nav = $('exnavInner');
    const now = nowIndex();
    nav.innerHTML = '<span class="exnav-indicator" aria-hidden="true"></span>' + plan.exercises.map((_, i) => {
        const state = i === now ? ' is-now' : isPlayed(i) ? ' is-played' : '';
        const note = i === now ? ', läuft jetzt' : isPlayed(i) ? ', gespielt' : '';
        const here = (i === currentIndex ? ' is-here' : '') + (i === editingIndex ? ' is-editing' : '');
        return `<a href="#ex-${i + 1}" class="${(state + here).trim()}" aria-label="${exerciseLabel(i + 1)}${note}"`
            + `${i === now ? ' aria-current="step"' : ''}>${i + 1}</a>`;
    }).join('');
    Motion.slideTo(nav.querySelector('.exnav-indicator'), nav.querySelectorAll('a')[currentIndex], true);
}

function renderExercises() {
    const container = $('exercises');
    container.innerHTML = '';
    plan.exercises.forEach((ex, index) => {
        const card = index === editingIndex ? renderEditCard(index) : renderViewCard(ex, index);
        // While one Übung is edited, the others wait: no stray taps or tab stops
        if (editingIndex !== null && index !== editingIndex) {
            card.inert = true;
            card.classList.add('is-locked');
        }
        container.appendChild(card);
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

// Index of the pair an unpaired kid joins, or -1
function joinOf(ex, unpairedIndex) {
    const join = (ex.joins || [])[unpairedIndex];
    return Number.isInteger(join) && join >= 0 && join < ex.pairs.length ? join : -1;
}

// Pairs and stations of one Übung, shared by the cards and the Jetzt-Ansicht
// Stations come first: "where do I go?" is what the coach calls out first
function cardBody(ex, index) {
    let body = '';
    let pairsHtml = '';
    if (ex.pairs.length > 0) {
        // A kid without a partner plays as the third with the pair the planner chose
        const thirds = (pairIndex) => ex.unpaired.filter((_, u) => joinOf(ex, u) === pairIndex)
            .map(k => `<span class="amp">+</span>${who(k.name, index)}<span class="third-note">als Dritter</span>`).join('');
        pairsHtml = `<h3 class="group-label">Paare</h3><ul class="rows">`
            + ex.pairs.map((p, i) => `<li class="row">${who(p.player1.name, index)}`
                + `<span class="amp">&amp;</span>${who(p.player2.name, index)}${thirds(i)}</li>`).join('')
            + '</ul>';
    }
    // Stations: label in its own column, names beside it
    const station = (cls, tag, people) => `<li class="row row-station ${cls}"><span class="tag">${tag}</span>`
        + `<span class="row-names">${people}</span></li>`;
    const stations = [];
    if (ex.mentalTrainer.length > 0) {
        const session = mentalSessionLabel(index);
        stations.push(station('row-mental', `<i class="bi bi-lightbulb" aria-hidden="true"></i> Mentaltrainer${session ? ` · ${session}` : ''}`,
            names(ex.mentalTrainer, index)));
    }
    ex.balleimer.forEach((bucket, b) => stations.push(station('row-bucket',
        `<i class="bi bi-basket" aria-hidden="true"></i> Balleimer ${b + 1}`, names(bucket, index))));
    ex.sparring.forEach(sp => stations.push(station('row-sparring',
        `<i class="bi bi-person-badge" aria-hidden="true"></i> ${escapeHtml(sp.partner)}`, who(sp.player.name, index))));
    const alone = ex.unpaired.filter((_, u) => joinOf(ex, u) < 0);
    if (alone.length > 0) {
        // Only when there is no pair to join (older plans, or no pairs at all)
        stations.push(station('row-pause', 'Ohne Partner',
            `${names(alone, index)} <span class="row-note">spielt als Dritter bei einem Paar mit</span>`));
    }
    if (stations.length > 0) {
        body += `<h3 class="group-label">Stationen</h3><ul class="rows">${stations.join('')}</ul>`;
    }
    return body + pairsHtml;
}

// Played Übungen fold to one line during the training; tap to look back
const openPlayed = new Set();

function renderViewCard(ex, index) {
    const section = document.createElement('section');
    const now = nowIndex();
    const played = isPlayed(index);
    const open = !played || openPlayed.has(index);
    section.className = 'exercise' + (index === now ? ' is-now' : played ? ' is-played' : '') + (open ? '' : ' is-collapsed');
    section.dataset.flipId = `card-${index}`;
    section.id = `ex-${index + 1}`;
    section.setAttribute('aria-labelledby', `ex-title-${index + 1}`);

    let body = cardBody(ex, index);
    body += hintsHtml(index, ex);

    // Editing sits at the bottom of the card, away from "Gross" in the header
    const editBtn = `<button type="button" class="btn btn-quiet btn-block edit-btn" aria-label="${exerciseLabel(index + 1)} bearbeiten">
                <i class="bi bi-pencil" aria-hidden="true"></i> Bearbeiten</button>`;
    if (played) {
        section.innerHTML = `
        <div class="exercise-head">
            <h2 id="ex-title-${index + 1}"><button type="button" class="played-toggle" aria-expanded="${open}" aria-controls="ex-body-${index + 1}">
                <i class="bi bi-check2" aria-hidden="true"></i> ${exerciseLabel(index + 1)} <span class="played-note">gespielt</span>
                <i class="bi bi-chevron-down" aria-hidden="true"></i></button></h2>
        </div>${open ? `<div id="ex-body-${index + 1}">${body}
            <button type="button" class="btn btn-quiet btn-block played-hide"><i class="bi bi-chevron-down" aria-hidden="true"></i> Ausblenden</button></div>` : ''}`;
        section.querySelector('.played-toggle').addEventListener('click', () => togglePlayed(index));
        const hide = section.querySelector('.played-hide');
        if (hide) hide.addEventListener('click', () => togglePlayed(index));
    } else {
        const badge = index === now ? '<span class="ex-badge is-now">Jetzt</span>'
            : changedCards.has(index) ? '<span class="ex-badge is-changed">Neu eingeteilt</span>' : '';
        const bigBtn = index === now ? `<button type="button" class="btn btn-quiet focus-open" aria-label="${exerciseLabel(index + 1)} gross anzeigen">
                <i class="bi bi-arrows-fullscreen" aria-hidden="true"></i> Gross</button>` : '';
        section.innerHTML = `
        <div class="exercise-head">
            <h2 id="ex-title-${index + 1}">${exerciseLabel(index + 1)} ${badge}</h2>
            ${bigBtn}
        </div>${body}${editBtn}`;
        const big = section.querySelector('.focus-open');
        if (big) big.addEventListener('click', openFocus);
    }
    const edit = section.querySelector('.edit-btn');
    if (edit) edit.addEventListener('click', () => startEdit(index));
    return section;
}

function togglePlayed(index) {
    if (openPlayed.has(index)) openPlayed.delete(index);
    else openPlayed.add(index);
    const card = renderViewCard(plan.exercises[index], index);
    $(`ex-${index + 1}`).replaceWith(card);
    card.querySelector('.played-toggle').focus({ preventScroll: true });
    if (openPlayed.has(index)) Motion.enter(card.querySelectorAll('.rows, .group-label'));
    observeExercises();
}

// Editing: every kid of the Übung is a button. Tap one, then the one to swap
// with; both change places. Every kid already has a place in each Übung, so
// swapping covers every change a select could make.
let pickedSlot = null;
let swappedSlots = new Set(); // places changed in this edit, marked until saving

function renderEditCard(index) {
    // Slot numbers follow slotsOf (pairs, Mentaltrainer, Balleimer, sparring,
    // unpaired); the layout follows the card (stations first, the third inside
    // its pair), so the coach finds every kid where it was
    const P = draft.pairs.length * 2;
    const M = P + draft.mentalTrainer.length;
    const bucketStart = [];
    let next = M;
    draft.balleimer.forEach(bucket => { bucketStart.push(next); next += bucket.length; });
    const S = next;
    const U = S + draft.sparring.length;
    const kid = (current, label, i, extra = '') => {
        const picked = i === pickedSlot;
        const moved = swappedSlots.has(i) ? ' is-swapped' : '';
        return `<button type="button" class="slot-btn${moved}${extra}" data-slot="${i}" aria-pressed="${picked}"`
            + ` aria-label="${escapeHtml(label)}: ${escapeHtml(current.name)}">`
            + `<span class="slot-name" data-flip-id="${escapeHtml(current.name)}">${escapeHtml(current.name)}</span>`
            + `<span class="slot-elo">Elo ${current.elo}</span></button>`;
    };

    const total = plan.exercises.length;
    const hint = pickedSlot === null
        ? 'Zwei Kinder nacheinander antippen – sie tauschen die Plätze.'
        : 'Jetzt das Kind antippen, mit dem getauscht wird.';
    let body = `<p class="info edit-hint" id="editHint">${hint}</p>`;
    let regenBlock = '';
    let group = 0;
    const tag = (html) => { group++; return `<span class="tag" id="grp-${index}-${group}">${html}</span>`; };
    const open = () => `role="group" aria-labelledby="grp-${index}-${group + 1}"`;
    const saved = plan.exercises[index].pairs;
    const wide = wideGap();

    if (draft.mentalTrainer.length > 0) {
        body += `<div class="slot-group row-mental" ${open()}>${tag('<i class="bi bi-lightbulb" aria-hidden="true"></i> Mentaltrainer')}
            ${draft.mentalTrainer.map((p, k) => kid(p, `Mentaltrainer, Kind ${k + 1}`, P + k)).join('')}</div>`;
    }
    draft.balleimer.forEach((bucket, b) => {
        body += `<div class="slot-group row-bucket" ${open()}>${tag(`<i class="bi bi-basket" aria-hidden="true"></i> Balleimer ${b + 1}`)}
            ${bucket.map((p, k) => kid(p, `Balleimer ${b + 1}, Kind ${k + 1}`, bucketStart[b] + k)).join('')}</div>`;
    });
    draft.sparring.forEach((sp, k) => {
        body += `<div class="slot-group row-sparring" ${open()}>${tag(`<i class="bi bi-person-badge" aria-hidden="true"></i> ${escapeHtml(sp.partner)}`)}
            ${kid(sp.player, `Sparring mit ${sp.partner}`, S + k)}</div>`;
    });
    draft.unpaired.forEach((p, k) => {
        if (joinOf(draft, k) >= 0) return;
        body += `<div class="slot-group" ${open()}>${tag('Ohne Partner')}${kid(p, 'Ohne Partner', U + k)}</div>`;
    });
    draft.pairs.forEach((p, n) => {
        const gap = Math.abs(p.player1.elo - p.player2.elo);
        const before = saved[n] ? Math.abs(saved[n].player1.elo - saved[n].player2.elo) : gap;
        const text = before === gap ? `Elo-Abstand ${gap}` : `Elo-Abstand ${before} → ${gap}`;
        const cls = gap > wide ? ' is-wide' : '';
        const verdict = gap > wide ? ' – gross' : '';
        const thirds = draft.unpaired.map((t, k) => joinOf(draft, k) === n
            ? kid(t, `Paar ${n + 1}, als Dritter`, U + k, ' is-third') : '').join('');
        body += `<div class="slot-group slot-pair" ${open()}>${tag(`Paar ${n + 1} <span class="tag-note${cls}">${text}${verdict}</span>`)}
            ${kid(p.player1, `Paar ${n + 1}, erstes Kind`, 2 * n)}${kid(p.player2, `Paar ${n + 1}, zweites Kind`, 2 * n + 1)}${thirds}</div>`;
    });
    body += hintsHtml(index, draft);
    if (index + 1 < total) {
        const rest = index + 2 === total ? `Übung ${total}` : `Übungen ${index + 2}–${total}`;
        regenBlock = `<div class="regen-block"><p class="info">Oder diese Übung behalten und den Rest neu planen:</p>
            <button type="button" class="btn btn-secondary btn-block btn-wrap regen-btn" id="regenerateBtn"${busy ? ' disabled' : ''}>
            <i class="bi bi-shuffle" aria-hidden="true"></i> Speichern und ${rest} neu einteilen</button></div>`;
    }

    const section = document.createElement('section');
    section.className = 'exercise is-editing';
    section.dataset.flipId = `card-${index}`;
    section.id = `ex-${index + 1}`;
    section.setAttribute('aria-labelledby', `ex-title-${index + 1}`);
    section.innerHTML = `
        <div class="exercise-head">
            <h2 id="ex-title-${index + 1}">${exerciseLabel(index + 1)}${index === nowIndex() ? ' <span class="ex-badge is-now">Jetzt</span>' : ''} <span class="visually-hidden">bearbeiten</span></h2>
        </div>${body}${regenBlock}`;
    section.querySelectorAll('.slot-btn').forEach(el =>
        el.addEventListener('click', () => tapSlot(parseInt(el.dataset.slot, 10))));
    const regen = section.querySelector('#regenerateBtn');
    if (regen) regen.addEventListener('click', regenerateFollowing);
    return section;
}

function tapSlot(slotIndex) {
    if (pickedSlot === null) {
        pickedSlot = slotIndex;
        rerenderEdit(slotIndex);
        return;
    }
    if (pickedSlot === slotIndex) {
        pickedSlot = null;
        rerenderEdit(slotIndex);
        return;
    }
    const slots = slotsOf(draft);
    const first = pickedSlot;
    const a = slots[first].get();
    const b = slots[slotIndex].get();
    slots[first].set(b);
    slots[slotIndex].set(a);
    pickedSlot = null;
    swappedSlots.add(first);
    swappedSlots.add(slotIndex);
    // Both names glide to their new place
    Motion.flip(`#ex-${editingIndex + 1} .slot-name`, () => rerenderEdit(slotIndex));
    Motion.flash(document.querySelector(`.slot-btn[data-slot="${first}"]`));
    Motion.flash(document.querySelector(`.slot-btn[data-slot="${slotIndex}"]`));
    announce(`${a.name} und ${b.name} getauscht`);
}

// Repeat and rule warnings of the edited Übung sit right above Speichern
function renderEditWarn() {
    const warn = $('editWarn');
    if (editingIndex === null) {
        warn.hidden = true;
        return;
    }
    const serious = hintsFor(editingIndex, draft).filter(h => h.level !== 'note');
    warn.hidden = serious.length === 0;
    warn.className = 'summary edit-warn' + (serious.some(h => h.level === 'rule') ? ' is-error' : ' is-warning');
    warn.innerHTML = serious.slice(0, 2).map(h => `<i class="bi bi-exclamation-triangle" aria-hidden="true"></i> ${escapeHtml(h.text)}`).join('<br>')
        + (serious.length > 2 ? ` <span>(+${serious.length - 2})</span>` : '');
}

function rerenderEdit(focusSlot) {
    const old = $(`ex-${editingIndex + 1}`);
    old.replaceWith(renderEditCard(editingIndex));
    renderEditWarn();
    const again = document.querySelector(`.slot-btn[data-slot="${focusSlot}"]`);
    if (again) again.focus({ preventScroll: true });
}

// A pair gap counts as "gross" well above what this plan usually has
function wideGap() {
    const gaps = plan.exercises.flatMap(ex => ex.pairs.map(p => Math.abs(p.player1.elo - p.player2.elo))).sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    return Math.max(150, median * 2);
}

// Quiet status for screen readers, without a toast on screen
function announce(message) {
    const el = $('srStatus');
    if (!el) return;
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = message; });
}

function renderBar() {
    const editing = editingIndex !== null;
    const switched = $('editBar').hidden === editing;
    $('viewBar').hidden = editing;
    $('editBar').hidden = !editing;
    renderEditWarn();
    renderNav();
    if (switched) Motion.enter([editing ? $('editBar') : $('viewBar')]);
    $('undoBtn').disabled = historyStack.length === 0 || busy;
    $('missingBtn').disabled = busy;
    $('addKidBtn').disabled = busy;

    const absent = (plan.absent || []).length;
    $('absentBadge').hidden = absent === 0;
    $('absentBadge').textContent = absent;
    $('missingBtn').setAttribute('aria-label', absent > 0 ? `Wer geht? (${absent} gegangen)` : 'Wer geht?');

    // Start → Weiter → Fertig
    const now = nowIndex();
    const total = plan.exercises.length;
    const next = $('nextBtn');
    const icon = next.querySelector('i');
    if (now === null) {
        $('nextLabel').textContent = `${exerciseLabel(1)} starten`;
        next.setAttribute('aria-label', `Training starten mit ${exerciseLabel(1)}`);
        icon.className = 'bi bi-play-fill';
    } else if (now < total - 1) {
        $('nextLabel').innerHTML = `Übung <span class="next-num">${now + 2}</span> starten`;
        next.setAttribute('aria-label', `${exerciseLabel(now + 1)} fertig, weiter mit ${exerciseLabel(now + 2)}`);
        icon.className = 'bi bi-skip-end-fill';
    } else if (now === total - 1) {
        $('nextLabel').textContent = 'Training beenden';
        next.setAttribute('aria-label', `${exerciseLabel(total)} fertig, Training beendet`);
        icon.className = 'bi bi-flag-fill';
    } else {
        $('nextLabel').textContent = 'Beendet';
        next.setAttribute('aria-label', 'Training beendet');
        icon.className = 'bi bi-check2-all';
    }
    next.disabled = busy || (now !== null && now >= total);

}

// One tap per Übung: the trainer always sees what is on now, and changes start after it
function advance() {
    if (busy) return;
    if (editingIndex !== null) saveEdit({ quiet: true });
    const total = plan.exercises.length;
    const now = nowIndex();
    if (now !== null && now >= total) return;
    pushHistory();
    const starting = now === null;
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
    // Starting on a phone goes straight into the Jetzt-Ansicht
    if (starting && !focusOpen() && phoneFocusDefault()) openFocus();
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
                // Scroll position is only a thin underline; the filled chip belongs to "Jetzt"
                a.classList.toggle('is-here', i === currentIndex);
                if (i === currentIndex) {
                    a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    Motion.slideTo(document.querySelector('#exnavInner .exnav-indicator'), a);
                }
            });
        }
    }, { rootMargin: '-80px 0px -45% 0px' });
    document.querySelectorAll('.exercise').forEach(el => exerciseObserver.observe(el));
}

// ===== EDITING =====
function startEdit(index) {
    if (editingIndex !== null) saveEdit();
    hideToast();
    editingIndex = index;
    pickedSlot = null;
    swappedSlots = new Set();
    draft = clone(plan.exercises[index]);
    renderExercises();
    renderBar();
    const card = $(`ex-${index + 1}`);
    Motion.scrollTo(card);
    Motion.enter(card.querySelectorAll('.slot-group'));
    const first = card.querySelector('.slot-btn');
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
            // The Jetzt-Ansicht drew while busy; enable its buttons again
            if (focusOpen()) renderFocus();
        });
}

// " · 1 ohne Partner" when the re-planned Übungen leave someone alone
function unpairedNote(fromIndex) {
    const alone = plan.exercises.slice(Math.max(0, fromIndex)).some(ex => ex.unpaired.length > 0);
    return alone ? ' · 1 Kind spielt als Dritter' : '';
}

function regenerateFollowing() {
    if (busy || editingIndex === null) return;
    const index = editingIndex;
    saveEdit({ quiet: true });
    replan(clone(plan), index)
        .then(() => toast(`Übungen ab ${index + 2} neu eingeteilt${unpairedNote(index + 1)}`, { label: 'Rückgängig', run: undo }))
        .catch(error => toast('Neu einteilen ging nicht. ' + friendlyError(error)));
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
    attendance = { present: new Set(plan.players.map(p => p.name)), added: [], sizes: [...(plan.settings.balleimerSizes || [])] };
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
    if (JSON.stringify(attendance.sizes) !== JSON.stringify(plan.settings.balleimerSizes || [])) return true;
    return [...before].some(name => !attendance.present.has(name));
}

function renderAttendance() {
    if (!attendance) return;
    const leaving = allKids().length - attendance.present.size;
    $('presentCount').textContent = `${attendance.present.size} bleiben · ${leaving} ${leaving === 1 ? 'geht' : 'gehen'}`;

    const chips = $('attendanceChips');
    chips.innerHTML = '';
    allKids().forEach(kid => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toggle-chip';
        // Pressed = fehlt, matching "Antippen = fehlt"
        const here = attendance.present.has(kid.name);
        button.setAttribute('aria-pressed', String(!here));
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
    $('applyHint').textContent = from === 1 ? 'Alle Übungen werden neu eingeteilt.'
        : `Übung 1${from > 2 ? `–${from - 1}` : ''} bleibt wie sie ist.`;

    // Say before applying when someone would be left without a partner, and offer the fix
    const atBuckets = attendance.sizes.reduce((sum, size) => sum + size, 0);
    const playing = attendance.present.size - atBuckets - plan.settings.sparringPartners.length
        - (plan.settings.mentalTrainerKids || 0);
    const odd = $('applyOdd');
    const fix = oddFix(attendance.sizes, playing);
    if (playing < 0) {
        odd.textContent = `Zu wenige Kinder für alle Stationen (${attendance.present.size} da, ${attendance.present.size - playing} Plätze).`;
        apply.disabled = true;
    } else if (playing % 2 === 1) {
        // Odd already before any change: a neutral note, not a warning about the tap just made
        const before = plan.players.length - (plan.settings.balleimerSizes || []).reduce((sum, size) => sum + size, 0)
            - plan.settings.sparringPartners.length - (plan.settings.mentalTrainerKids || 0);
        const already = before % 2 === 1;
        odd.textContent = already ? 'Schon jetzt spielt pro Übung 1 Kind als Dritter mit.' : 'Dann spielt pro Übung 1 Kind als Dritter mit.';
        odd.classList.toggle('is-warn', !already);
    }
    odd.hidden = playing >= 0 && playing % 2 === 0;
    const fixBtn = $('missingFix');
    fixBtn.hidden = !fix;
    if (fix) {
        fixBtn.textContent = fix.label;
        fixBtn.onclick = () => {
            fix.apply(attendance.sizes);
            renderAttendance();
            announce(fix.label);
        };
    }
}

function applyAttendance() {
    if (busy || !attendanceChanged()) return;
    const from = parseInt($('applyFrom').value, 10);
    const kids = allKids();
    const next = clone(plan);
    next.players = kids.filter(k => attendance.present.has(k.name));
    next.absent = kids.filter(k => !attendance.present.has(k.name));
    next.settings.balleimerSizes = [...attendance.sizes];
    if (next.players.length < 2) {
        $('applyHint').textContent = 'Mindestens zwei Kinder müssen da sein.';
        Motion.shake($('applyHint'));
        return;
    }

    $('applyAttendance').disabled = true;
    const before = new Set(plan.players.map(p => p.name));
    replan(next, from - 2)
        .then(() => {
            // Stay on the running card; the changed ones say "Neu eingeteilt"
            closeAttendance();
            // "Ab Übung 3 ohne Ved" says exactly what happened
            const gone = next.absent.filter(k => before.has(k.name)).map(k => k.name);
            const message = gone.length > 0 && gone.length <= 3
                ? `Ab ${exerciseLabel(from)} ohne ${gone.join(', ')}` : `Plan ab ${exerciseLabel(from)} angepasst`;
            toast(message + unpairedNote(from - 1), { label: 'Rückgängig', run: undo });
        })
        .catch(error => {
            $('applyHint').textContent = 'Anpassen ging nicht. ' + friendlyError(error);
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
    setAddKidStations(false);
    renderAddKid();
    Motion.openDialog($('addKidDialog'));
    $('addKidName').focus();
}

function setAddKidStations(open) {
    $('addKidStationsBlock').hidden = !open;
    $('addKidStationsToggle').setAttribute('aria-expanded', String(open));
    $('addKidStationsToggle').hidden = open;
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
        const item = (icon, value, label, cls = '') => `<span class="stat ${cls}">`
            + `<i class="bi ${icon}" aria-hidden="true"></i> ${value} <span class="stat-label">${label}</span></span>`;
        let html = item('bi-people', kids, 'Kinder') + item('bi-arrow-left-right', Math.floor(playing / 2), 'Paare');
        if (atBuckets > 0) html += item('bi-basket', atBuckets, 'Balleimer', 'is-bucket');
        if (sparring > 0) html += item('bi-person-badge', sparring, 'Sparring', 'is-sparring');
        if (mental > 0) html += item('bi-lightbulb', mental, 'Mental', 'is-mental');
        if (playing % 2 === 1) html += item('bi-exclamation-triangle-fill', 1, 'ohne Partner', 'is-warn');
        stats.className = 'stats';
        stats.innerHTML = html;
    }
    renderAddKidFix(playing);
    // Stations only come up when the count needs them, or on request
    if ((playing < 0 || playing % 2 === 1) && $('addKidStationsBlock').hidden && !addKidFixAction) {
        setAddKidStations(true);
    }
    const from = parseInt($('addKidFrom').value || '1', 10);
    $('confirmAddKid').textContent = from === 1 ? 'Hinzufügen' : `Ab ${exerciseLabel(from)} dabei`;
    $('confirmAddKid').disabled = playing < 0 || busy;
}

// With an odd number one kid would stand alone: the one-tap fix puts one more
// kid at a Balleimer. Returns {label, apply(sizes)} or null.
function oddFix(sizes, playing) {
    if (playing < 0 || playing % 2 === 0) return null;
    const open = sizes.map((size, i) => ({ size, i })).filter(b => b.size < MAX_PER_BALLEIMER)
        .sort((x, y) => x.size - y.size)[0];
    if (open) {
        return { label: `Balleimer ${open.i + 1}: 1 Kind mehr (${open.size} → ${open.size + 1})`, apply: list => { list[open.i] += 1; } };
    }
    if (sizes.length < MAX_BALLEIMER) return { label: 'Balleimer mit 1 Kind dazu', apply: list => { list.push(1); } };
    return null;
}

let addKidFixAction = null;
function renderAddKidFix(playing) {
    const fix = $('addKidFix');
    const found = oddFix(addKidSizes, playing);
    addKidFixAction = found ? () => found.apply(addKidSizes) : null;
    if (found) fix.textContent = found.label;
    fix.hidden = !found;
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
            toast(`${name} ab ${exerciseLabel(from)} dabei${unpairedNote(from - 1)}`, { label: 'Rückgängig', run: undo });
        })
        .catch(e => showError('Hinzufügen ging nicht. ' + friendlyError(e)))
        .finally(() => renderAddKid());
}

// ===== JETZT-ANSICHT =====
// Only one Übung, big: what the coach glances at between drills. Browsing
// (swipe, arrows) never changes which Übung is running; Weiter does.
let focusIndex = 0;

// On a phone, a running training opens straight in the Jetzt-Ansicht
function phoneFocusDefault() {
    const now = nowIndex();
    return window.matchMedia('(max-width: 640px)').matches && now !== null && now < plan.exercises.length;
}

function focusOpen() {
    return $('focusDialog').open;
}

function openFocus() {
    if (editingIndex !== null) saveEdit({ quiet: true });
    const now = nowIndex();
    focusIndex = now === null ? 0 : Math.min(now, plan.exercises.length - 1);
    renderFocus();
    // Toasts (with their Rückgängig) must show above the full-screen view
    $('focusDialog').appendChild($('toast'));
    Motion.openDialog($('focusDialog'));
}

function renderFocus(direction = 0) {
    const total = plan.exercises.length;
    const now = nowIndex();
    focusIndex = Math.max(0, Math.min(focusIndex, total - 1));
    const ex = plan.exercises[focusIndex];
    const state = focusIndex === now ? 'Jetzt' : isPlayed(focusIndex) ? 'gespielt'
        : now !== null && focusIndex === now + 1 ? 'als Nächstes' : '';
    $('focusTitle').innerHTML = `<span>${exerciseLabel(focusIndex + 1)}<span class="focus-of"> / ${total}</span></span>`
        + `${state ? ` <span class="ex-badge${focusIndex === now ? ' is-now' : ''}">${state}</span>` : ''}`;
    $('focusUndo').disabled = historyStack.length === 0 || busy;
    $('focusDialog').classList.toggle('is-now', focusIndex === now);
    const body = $('focusBody');
    body.innerHTML = cardBody(ex, focusIndex);
    $('focusPrev').disabled = focusIndex === 0;
    $('focusNext').disabled = focusIndex === total - 1;

    const label = $('focusAdvanceLabel');
    const button = $('focusAdvance');
    if (now === null) label.textContent = `${exerciseLabel(1)} starten`;
    else if (now < total - 1) label.textContent = `${exerciseLabel(now + 2)} starten`;
    else if (now === total - 1) label.textContent = 'Training beenden';
    else label.textContent = 'Beendet';
    button.disabled = busy || (now !== null && now >= total);
    if (direction && Motion.full() && window.gsap) {
        window.gsap.fromTo(body, { x: 40 * direction, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.25, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
    }
}

function browseFocus(step) {
    const next = focusIndex + step;
    if (next < 0 || next >= plan.exercises.length) return;
    focusIndex = next;
    renderFocus(step);
}

function advanceFromFocus() {
    advance();
    const now = nowIndex();
    focusIndex = Math.min(now, plan.exercises.length - 1);
    renderFocus(1);
    const num = $('focusAdvanceLabel');
    Motion.pop(num);
}

function wireFocus() {
    $('focusBtn').addEventListener('click', openFocus);
    $('focusClose').addEventListener('click', () => Motion.closeDialog($('focusDialog')));
    $('focusDialog').addEventListener('close', () => document.body.appendChild($('toast')));
    $('focusUndo').addEventListener('click', () => {
        undo();
        const now = nowIndex();
        focusIndex = now === null ? 0 : Math.min(now, plan.exercises.length - 1);
        renderFocus(-1);
    });
    $('focusPrev').addEventListener('click', () => browseFocus(-1));
    $('focusNext').addEventListener('click', () => browseFocus(1));
    $('focusAdvance').addEventListener('click', advanceFromFocus);
    $('focusLeave').addEventListener('click', openAttendance);
    $('focusJoin').addEventListener('click', openAddKid);
    $('focusDialog').addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') browseFocus(-1);
        else if (e.key === 'ArrowRight') browseFocus(1);
    });
    // Swipe sideways to look at the other Übungen
    let startX = null;
    let startY = null;
    const body = $('focusBody');
    body.addEventListener('pointerdown', (e) => { startX = e.clientX; startY = e.clientY; });
    body.addEventListener('pointerup', (e) => {
        if (startX === null) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        startX = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) browseFocus(dx < 0 ? 1 : -1);
    });
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
    if (phoneFocusDefault()) openFocus();
    Motion.enter(document.querySelectorAll('.exercise'));

    $('undoBtn').addEventListener('click', undo);
    $('nextBtn').addEventListener('click', advance);
    wireFocus();
    $('pdfBtn').addEventListener('click', exportPdf);
    $('saveEdit').addEventListener('click', () => saveEdit());
    $('cancelEdit').addEventListener('click', cancelEdit);

    $('missingBtn').addEventListener('click', openAttendance);
    $('closeMissing').addEventListener('click', closeAttendance);
    $('missingDialog').addEventListener('close', () => { attendance = null; });
    $('applyFrom').addEventListener('change', renderAttendance);
    $('addKidFrom').addEventListener('change', renderAddKid);
    $('addKidStationsToggle').addEventListener('click', () => {
        setAddKidStations(true);
        Motion.enter([$('addKidStationsBlock')]);
    });
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
