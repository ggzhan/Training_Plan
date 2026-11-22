// Entry page: training date, today's kids, Balleimer and sparring settings.

let currentPlayers = [];
let sparringPartners = [];
let balleimerSizes = []; // kids per Balleimer, one entry per Balleimer
let mentalPicks = []; // kid names chosen for the Mentaltrainer, in order
let neverTogether = []; // [name, name] pairs who must not play each other
let stationPriority = 'random'; // who gets a station first: weaker, stronger, random
let noBalleimer = []; // kid names who never go to a Balleimer
let noSparring = []; // kid names who never get a sparring partner
let extraStationKids = []; // kid names marked ⭐ for extra station turns
let strongAtStations = false; // kids far from the rest in Elo get extra station turns
const MAX_BALLEIMER = 6;
const MAX_PER_BALLEIMER = 8;
let editingPlayerIndex = null;
let rosterEdited = false;
let sortColumn = 'name';

const $ = (id) => document.getElementById(id);

function intValue(id) {
    const value = parseInt($(id).value, 10);
    return isNaN(value) ? 0 : value;
}

// ===== LOADING KIDS =====
function selectedDate() {
    return $('trainingDate').value;
}

// A hand-edited list for this date wins over the sheet until it is reset
function loadPlayers({ fromSheet = false } = {}) {
    const date = selectedDate();
    const saved = readStored(STORAGE_KEYS.roster);
    if (!fromSheet && saved && saved.date === date && Array.isArray(saved.players)) {
        setPlayers(saved.players.map(withElo), true);
        return Promise.resolve();
    }
    if (!date) {
        setPlayers([], false);
        return Promise.resolve();
    }
    return fetch(`/api/players?date=${encodeURIComponent(date)}`)
        .then(readJsonResponse)
        .then(players => {
            if (fromSheet) removeStored(STORAGE_KEYS.roster);
            setPlayers(players, false);
        })
        .catch(error => showFormError('Die Anmeldungen konnten nicht geladen werden. ' + friendlyError(error)));
}

function setPlayers(players, edited) {
    currentPlayers = players;
    rosterEdited = edited;
    renderPlayerList();
}

function rosterChanged() {
    rosterEdited = true;
    writeStored(STORAGE_KEYS.roster, { date: selectedDate(), players: currentPlayers });
    // Rows glide to their new place; an added kid fades in, a removed one fades out
    Motion.flip('#playerListBody li', renderPlayerList);
}

function refreshFromSheet() {
    const btn = $('refreshBtn');
    btn.disabled = true;
    fetch('/api/refresh', { method: 'POST' })
        .then(readJsonResponse)
        .then(() => loadPlayers({ fromSheet: true }))
        .then(() => toast(`${currentPlayers.length} Kinder aus dem Sheet geladen`))
        .catch(error => showFormError('Das Sheet konnte nicht neu geladen werden. ' + friendlyError(error)))
        .finally(() => { btn.disabled = false; });
}

// ===== PLAYER LIST =====
function sortPlayers() {
    currentPlayers.sort((a, b) => sortColumn === 'elo'
        ? b.elo - a.elo || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name));
}

function renderPlayerList() {
    sortPlayers();
    $('playerCount').textContent = currentPlayers.length;
    $('rosterNote').hidden = !rosterEdited;
    $('resetRoster').hidden = !rosterEdited;
    document.querySelectorAll('.sortbar [data-sort]').forEach(btn =>
        btn.setAttribute('aria-pressed', String(btn.dataset.sort === sortColumn)));

    const list = $('playerListBody');
    list.innerHTML = '';
    if (currentPlayers.length === 0) {
        list.innerHTML = '<li class="hint">Für dieses Datum ist niemand angemeldet.</li>';
    }
    currentPlayers.forEach((player, index) => {
        const item = document.createElement('li');
        item.dataset.flipId = player.name;
        const name = escapeHtml(player.name);
        const noBucket = noBalleimer.includes(player.name);
        const noSpar = noSparring.includes(player.name);
        const starred = extraStationKids.includes(player.name);
        item.innerHTML = `
            <span class="who-block">
                <span class="name">${name}</span>
                <span class="elo-line">Elo ${player.elo}${ruleTags(starred, noBucket, noSpar)}</span>
            </span>
            <button type="button" class="btn btn-icon star-toggle" aria-pressed="${starred}"
                aria-label="Mehr Stationen für ${name}" title="${starred ? 'Mehr Stationen' : 'Normal'}">
                <i class="bi ${starred ? 'bi-star-fill' : 'bi-star'}" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-icon station-toggle is-bucket" aria-pressed="${noBucket}"
                aria-label="Nie an den Balleimer: ${name}" title="${noBucket ? 'Nie an den Balleimer' : 'Balleimer erlaubt'}">
                <i class="bi bi-basket" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-icon station-toggle is-sparring" aria-pressed="${noSpar}"
                aria-label="Nie ins Sparring: ${name}" title="${noSpar ? 'Nie ins Sparring' : 'Sparring erlaubt'}">
                <i class="bi bi-person-badge" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-icon btn-quiet" aria-label="${name} bearbeiten oder entfernen">
                <i class="bi bi-pencil" aria-hidden="true"></i></button>`;
        const [starBtn, bucketBtn, sparBtn, editBtn] = item.querySelectorAll('button');
        starBtn.addEventListener('click', () => toggleException('extraStationKids', player.name));
        bucketBtn.addEventListener('click', () => toggleException('noBalleimer', player.name));
        sparBtn.addEventListener('click', () => toggleException('noSparring', player.name));
        editBtn.addEventListener('click', () => openPlayerDialog(index));
        list.appendChild(item);
    });

    renderRules();
    checkStations();
}

// Rules that are on show as words in the row, not only as icon states
function ruleTags(starred, noBucket, noSpar) {
    const tags = [];
    if (starred) tags.push('<span class="rule-tag is-star">⭐ öfter</span>');
    if (noBucket) tags.push('<span class="rule-tag is-off">nie Balleimer</span>');
    if (noSpar) tags.push('<span class="rule-tag is-off">nie Sparring</span>');
    return tags.join('');
}

function togglePlayerList() {
    const open = $('playerList').hidden;
    $('togglePlayers').setAttribute('aria-expanded', String(open));
    Motion.toggle($('playerList'), open);
}

function openPlayerDialog(index) {
    editingPlayerIndex = index;
    const player = index == null ? null : currentPlayers[index];
    $('playerDialogTitle').textContent = player ? 'Kind bearbeiten' : 'Kind hinzufügen';
    $('deletePlayerBtn').hidden = !player;
    $('playerName').value = player ? player.name : '';
    $('playerElo').value = player ? player.elo : defaultElo(currentPlayers);
    $('playerError').hidden = true;
    Motion.openDialog($('playerDialog'));
    $('playerName').focus();
}

function savePlayer(event) {
    event.preventDefault();
    const name = $('playerName').value.trim();
    const elo = parseInt($('playerElo').value, 10);
    const error = $('playerError');

    let message = null;
    let field = $('playerName');
    if (!name) {
        message = 'Bitte einen Namen eingeben.';
    } else if (isNaN(elo) || elo < ELO_MIN || elo > ELO_MAX) {
        message = `Bitte eine Elo zwischen ${ELO_MIN} und ${ELO_MAX} eingeben.`;
        field = $('playerElo');
    } else {
        const duplicate = currentPlayers.findIndex(p => p.name === name);
        if (duplicate !== -1 && duplicate !== editingPlayerIndex) message = `${name} steht schon in der Liste.`;
    }
    if (message) {
        error.textContent = message;
        error.hidden = false;
        Motion.shake(field);
        field.focus();
        return;
    }

    if (editingPlayerIndex != null) {
        renameEverywhere(currentPlayers[editingPlayerIndex].name, name);
        currentPlayers[editingPlayerIndex] = { name, elo };
    } else {
        currentPlayers.push({ name, elo });
    }
    Motion.closeDialog($('playerDialog'));
    writeStored(STORAGE_KEYS.settings, currentSettings());
    rosterChanged();
}

// Rules refer to kids by name, so a renamed kid keeps them
function renameEverywhere(oldName, newName) {
    if (oldName === newName) return;
    const swap = n => (n === oldName ? newName : n);
    mentalPicks = mentalPicks.map(swap);
    noBalleimer = noBalleimer.map(swap);
    noSparring = noSparring.map(swap);
    extraStationKids = extraStationKids.map(swap);
    neverTogether = neverTogether.map(pair => pair.map(swap));
}

function deletePlayer(index) {
    const [removed] = currentPlayers.splice(index, 1);
    rosterChanged();
    toast(`${removed.name} entfernt`, {
        label: 'Rückgängig',
        run: () => {
            currentPlayers.push(removed);
            rosterChanged();
        }
    });
}

// ===== SETTINGS (remembered per browser) =====
function loadSettings() {
    const saved = readStored(STORAGE_KEYS.settings);
    if (!saved) return;
    if (saved.numberOfExercises) $('numberOfExercises').value = saved.numberOfExercises;
    if (saved.mentalTrainerKids != null) $('mentalTrainerKids').value = saved.mentalTrainerKids;
    if (saved.mentalTrainerLength) $('mentalTrainerLength').value = saved.mentalTrainerLength;
    if (Array.isArray(saved.balleimerSizes)) {
        balleimerSizes = saved.balleimerSizes;
    } else if (saved.balleimerCount > 0) {
        // Saved before each Balleimer had its own size
        balleimerSizes = Array(saved.balleimerCount).fill(saved.playersPerBalleimer || 2);
    }
    if (Array.isArray(saved.sparringPartners)) sparringPartners = saved.sparringPartners;
    if (Array.isArray(saved.mentalTrainerPicks)) mentalPicks = saved.mentalTrainerPicks;
    if (Array.isArray(saved.neverTogether)) neverTogether = saved.neverTogether;
    if (['weaker', 'stronger', 'random'].includes(saved.stationPriority)) stationPriority = saved.stationPriority;
    if (Array.isArray(saved.noBalleimer)) noBalleimer = saved.noBalleimer;
    if (Array.isArray(saved.noSparring)) noSparring = saved.noSparring;
    if (Array.isArray(saved.extraStationKids)) extraStationKids = saved.extraStationKids;
    strongAtStations = saved.strongAtStations === true;
    $('strongAtStations').checked = strongAtStations;
    document.querySelectorAll('input[name=stationPriority]').forEach(r => { r.checked = r.value === stationPriority; });
}

function currentSettings() {
    return {
        numberOfExercises: intValue('numberOfExercises'),
        balleimerSizes,
        mentalTrainerKids: intValue('mentalTrainerKids'),
        mentalTrainerLength: Math.max(1, intValue('mentalTrainerLength')),
        mentalTrainerPicks: mentalPicks,
        sparringPartners,
        stationPriority,
        noBalleimer,
        noSparring,
        extraStationKids,
        strongAtStations,
        neverTogether
    };
}

let lastMental = 2;

function settingsChanged() {
    writeStored(STORAGE_KEYS.settings, currentSettings());
    checkStations();
}

function step(id, delta) {
    const input = $(id);
    const min = parseInt(input.min, 10);
    const max = parseInt(input.max, 10);
    const before = intValue(id);
    input.value = Math.min(max, Math.max(min, before + delta));
    if (intValue(id) !== before) Motion.tick(input, Math.sign(delta));
    settingsChanged();
}

// ===== MENTALTRAINER =====
// Whether the block is open is a per-browser convenience
const MENTAL_OPEN_KEY = 'trainingsplaner.mentalOpen';

function setMentalOpen(open, animate = true) {
    $('toggleMental').setAttribute('aria-expanded', String(open));
    if (animate) Motion.toggle($('mentalBody'), open);
    else $('mentalBody').hidden = !open;
}

// Which Einheit each pick lands in, given today's kids and the current settings
function renderMentalPicks() {
    const perSession = intValue('mentalTrainerKids');
    const length = Math.max(1, intValue('mentalTrainerLength'));
    const exercises = Math.max(1, intValue('numberOfExercises'));
    const sessions = Math.ceil(exercises / length);
    const present = new Map(currentPlayers.map(p => [p.name, p]));

    const select = $('mentalPickSelect');
    const options = currentPlayers.filter(p => !mentalPicks.includes(p.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    select.innerHTML = '<option value="">Kind…</option>' + options.map(p =>
        `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${p.elo})</option>`).join('');
    select.disabled = options.length === 0;
    $('addMentalPick').disabled = options.length === 0;

    const list = $('mentalPickList');
    list.innerHTML = '';
    let order = 0; // position among picks who are here today
    let notPlaced = 0;
    mentalPicks.forEach((name, index) => {
        const kid = present.get(name);
        let where;
        let off = false;
        if (!kid) {
            where = 'Heute nicht da';
            off = true;
        } else if (perSession === 0) {
            where = 'Mentaltrainer aus';
            off = true;
        } else {
            const session = Math.floor(order / perSession);
            order++;
            if (session >= sessions) {
                where = 'Kein Platz mehr';
                off = true;
                notPlaced++;
            } else {
                const first = session * length + 1;
                const last = Math.min(first + length - 1, exercises);
                where = first === last ? `Übung ${first}` : `Übung ${first}–${last}`;
            }
        }
        const item = document.createElement('li');
        item.dataset.flipId = name;
        item.innerHTML = `
            <span class="pick-pos" aria-hidden="true">${index + 1}</span>
            <span class="pick-text">
                <span class="name">${escapeHtml(name)}${kid ? ` (${kid.elo})` : ''}</span>
                <span class="where${off ? ' is-off' : ''}">${escapeHtml(where)}</span>
            </span>
            <button type="button" class="btn btn-icon btn-quiet" aria-label="${escapeHtml(name)} nach vorne"${index === 0 ? ' disabled' : ''}>
                <i class="bi bi-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet" aria-label="${escapeHtml(name)} entfernen">
                <i class="bi bi-x-lg" aria-hidden="true"></i></button>`;
        const [up, remove] = item.querySelectorAll('button');
        up.addEventListener('click', () => moveMentalPick(index));
        remove.addEventListener('click', () => removeMentalPick(index));
        list.appendChild(item);
    });

    const note = $('mentalPickNote');
    note.hidden = notPlaced === 0;
    note.textContent = `${notPlaced} ohne Platz (${sessions} × ${perSession} Plätze)`;
}

function addMentalPick() {
    const name = $('mentalPickSelect').value;
    if (!name || mentalPicks.includes(name)) return;
    mentalPicks.push(name);
    settingsChanged();
    Motion.enter([$('mentalPickList').lastElementChild]);
    $('mentalPickSelect').focus();
}

function moveMentalPick(index) {
    if (index === 0) return;
    [mentalPicks[index - 1], mentalPicks[index]] = [mentalPicks[index], mentalPicks[index - 1]];
    Motion.flip('#mentalPickList li', settingsChanged);
}

function removeMentalPick(index) {
    const [name] = mentalPicks.splice(index, 1);
    settingsChanged();
    toast(`${name} nicht mehr ausgewählt`, {
        label: 'Rückgängig',
        run: () => {
            mentalPicks.splice(index, 0, name);
            settingsChanged();
        }
    });
}

// ===== BALLEIMER =====
// One tap that makes the kids left for pairs even. One more kid at the smallest
// Balleimer, unless that makes kids go twice and one fewer at the largest works.
function balleimerFix() {
    const change = (index, delta) => () => {
        // Not setBucketSize: focusing the number field would open the phone keyboard
        balleimerSizes[index] += delta;
        renderBalleimer();
        settingsChanged();
        toast(`Balleimer ${index + 1} hat jetzt ${balleimerSizes[index]} ${balleimerSizes[index] === 1 ? 'Kind' : 'Kinder'}`);
    };
    if (balleimerSizes.length === 0) {
        return {
            label: 'Balleimer mit 1 Kind hinzufügen',
            run: () => {
                balleimerSizes.push(1);
                renderBalleimer();
                settingsChanged();
                toast('Balleimer mit 1 Kind hinzugefügt');
            }
        };
    }
    const label = (index, delta) =>
        `Balleimer ${index + 1}: ${balleimerSizes[index] + delta} statt ${balleimerSizes[index]} Kinder`;
    const places = balleimerSizes.reduce((sum, size) => sum + size, 0);
    const largest = balleimerSizes.indexOf(Math.max(...balleimerSizes));
    const smallest = balleimerSizes.indexOf(Math.min(...balleimerSizes));
    const moreCausesRepeats = intValue('numberOfExercises') * (places + 1) > currentPlayers.length;
    if ((moreCausesRepeats || balleimerSizes[smallest] >= MAX_PER_BALLEIMER) && balleimerSizes[largest] > 1) {
        return { label: label(largest, -1), run: change(largest, -1) };
    }
    if (balleimerSizes[smallest] >= MAX_PER_BALLEIMER) return null;
    return { label: label(smallest, 1), run: change(smallest, 1) };
}

function renderBalleimer() {
    const list = $('bucketList');
    list.innerHTML = '';
    balleimerSizes.forEach((size, index) => {
        const n = index + 1;
        const item = document.createElement('li');
        item.innerHTML = `
            <label for="bucket-${n}"><span class="bucket-no">${n}</span> <span class="visually-hidden">Balleimer ${n},</span>
                <i class="bi bi-people" aria-hidden="true"></i><span class="visually-hidden">Kinder</span></label>
            <div class="stepper">
                <button type="button" class="btn" aria-label="Balleimer ${n}: ein Kind weniger"${size <= 1 ? ' disabled' : ''}>−</button>
                <input type="number" id="bucket-${n}" inputmode="numeric" min="1" max="${MAX_PER_BALLEIMER}" value="${size}">
                <button type="button" class="btn" aria-label="Balleimer ${n}: ein Kind mehr"${size >= MAX_PER_BALLEIMER ? ' disabled' : ''}>+</button>
            </div>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet" aria-label="Balleimer ${n} entfernen">
                <i class="bi bi-trash3" aria-hidden="true"></i></button>`;
        const [minus, plus, remove] = item.querySelectorAll('button');
        minus.addEventListener('click', () => setBucketSize(index, size - 1));
        plus.addEventListener('click', () => setBucketSize(index, size + 1));
        remove.addEventListener('click', () => removeBucket(index));
        item.querySelector('input').addEventListener('change', (e) => setBucketSize(index, parseInt(e.target.value, 10)));
        list.appendChild(item);
    });
    // First run: say what happens without stations, and make adding one the obvious step
    const empty = balleimerSizes.length === 0;
    if (empty) list.innerHTML = '<li class="empty">Kein Balleimer – alle spielen in Paaren.</li>';
    $('addBucketBtn').className = empty ? 'btn btn-secondary' : 'btn btn-quiet';
    $('addBucketBtn').disabled = balleimerSizes.length >= MAX_BALLEIMER;
}

function setBucketSize(index, size) {
    const before = balleimerSizes[index];
    balleimerSizes[index] = Math.min(MAX_PER_BALLEIMER, Math.max(1, isNaN(size) ? 1 : size));
    renderBalleimer();
    settingsChanged();
    const input = $(`bucket-${index + 1}`);
    if (input) {
        input.focus();
        Motion.tick(input, Math.sign(balleimerSizes[index] - before));
    }
}

function addBucket() {
    if (balleimerSizes.length >= MAX_BALLEIMER) return;
    // A new Balleimer starts like the last one, or with 2 kids
    balleimerSizes.push(balleimerSizes.length > 0 ? balleimerSizes[balleimerSizes.length - 1] : 2);
    renderBalleimer();
    settingsChanged();
    Motion.enter([$('bucketList').lastElementChild]);
}

function removeBucket(index) {
    const [size] = balleimerSizes.splice(index, 1);
    renderBalleimer();
    settingsChanged();
    toast(`Balleimer ${index + 1} entfernt`, {
        label: 'Rückgängig',
        run: () => {
            balleimerSizes.splice(index, 0, size);
            renderBalleimer();
            settingsChanged();
        }
    });
}

// ===== SPARRING PARTNERS =====
function addSparringPartner() {
    const input = $('sparringName');
    const name = input.value.trim();
    if (!name) return;
    if (sparringPartners.includes(name)) {
        toast(`${name} ist schon eingetragen`);
        input.select();
        return;
    }
    sparringPartners.push(name);
    input.value = '';
    renderSparringPartners();
    settingsChanged();
    Motion.enter([$('sparringList').lastElementChild]);
}

function removeSparringPartner(index) {
    sparringPartners.splice(index, 1);
    renderSparringPartners();
    settingsChanged();
}

function renderSparringPartners() {
    const list = $('sparringList');
    list.innerHTML = '';
    sparringPartners.forEach((name, index) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `<span>${escapeHtml(name)}</span>
            <button type="button" class="btn" aria-label="${escapeHtml(name)} entfernen">
                <i class="bi bi-x-lg" aria-hidden="true"></i></button>`;
        chip.querySelector('button').addEventListener('click', () => removeSparringPartner(index));
        list.appendChild(chip);
    });
    $('sparringEmpty').hidden = sparringPartners.length > 0;
}

// ===== RULES =====
const RULES_OPEN_KEY = 'trainingsplaner.rulesOpen';

function kidOptions(exclude) {
    return currentPlayers.filter(p => !exclude.includes(p.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
}

function renderRules() {
    const here = new Set(currentPlayers.map(p => p.name));

    const exceptions = $('exceptionList');
    exceptions.innerHTML = '';
    const excepted = [...new Set([...extraStationKids, ...noBalleimer, ...noSparring])].sort((a, b) => a.localeCompare(b));
    if (excepted.length === 0) exceptions.innerHTML = '<li class="info">Keine</li>';
    excepted.forEach(name => {
        const item = document.createElement('li');
        item.className = here.has(name) ? '' : 'is-away';
        const parts = [];
        if (extraStationKids.includes(name)) parts.push('⭐ öfter an Stationen');
        if (noBalleimer.includes(name)) parts.push('nie Balleimer');
        if (noSparring.includes(name)) parts.push('nie Sparring');
        item.innerHTML = `<span>${escapeHtml(name)}</span>
            <span class="ex-text">${parts.join(', ')}</span>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet"
                aria-label="Ausnahmen für ${escapeHtml(name)} entfernen"><i class="bi bi-trash3" aria-hidden="true"></i></button>`;
        item.querySelector('button').addEventListener('click', () => {
            noBalleimer = noBalleimer.filter(n => n !== name);
            noSparring = noSparring.filter(n => n !== name);
            extraStationKids = extraStationKids.filter(n => n !== name);
            rulesChanged();
        });
        exceptions.appendChild(item);
    });

    const list = $('neverList');
    list.innerHTML = '';
    neverTogether.forEach((pair, index) => {
        const item = document.createElement('li');
        const away = pair.some(n => !here.has(n));
        item.className = away ? 'is-away' : '';
        item.innerHTML = `<span>${escapeHtml(pair[0])}</span><i class="bi bi-x-lg never-x" aria-hidden="true"></i>
            <span>${escapeHtml(pair[1])}</span>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet"
                aria-label="${escapeHtml(pair[0])} und ${escapeHtml(pair[1])}: Regel entfernen">
                <i class="bi bi-trash3" aria-hidden="true"></i></button>`;
        item.querySelector('button').addEventListener('click', () => {
            neverTogether.splice(index, 1);
            rulesChanged();
        });
        list.appendChild(item);
    });
    const options = '<option value="">Kind…</option>' + kidOptions([]);
    const a = $('neverA').value;
    const b = $('neverB').value;
    $('neverA').innerHTML = options;
    $('neverB').innerHTML = options;
    $('neverA').value = here.has(a) ? a : '';
    $('neverB').value = here.has(b) ? b : '';

    // Say what is set, not a bare count
    const exceptionCount = excepted.filter(n => here.has(n)).length;
    const pairCount = neverTogether.filter(pair => pair.every(n => here.has(n))).length;
    const parts = [];
    if (exceptionCount > 0) parts.push(`${exceptionCount} ${exceptionCount === 1 ? 'Ausnahme' : 'Ausnahmen'}`);
    if (pairCount > 0) parts.push(`${pairCount}× nie zusammen`);
    if (strongAtStations) parts.push('Starke öfter');
    if (stationPriority !== 'random') parts.push(stationPriority === 'weaker' ? 'Schwächere zuerst' : 'Stärkere zuerst');
    $('rulesSummary').textContent = parts.length === 0 ? 'Keine' : parts.join(' · ');
}

// Tapping the Balleimer or sparring icon in a kid's row switches that station off
// or back on for this kid
function toggleException(list, name) {
    const lists = { noBalleimer, noSparring, extraStationKids };
    const names = lists[list];
    const on = !names.includes(name);
    if (on) names.push(name);
    else names.splice(names.indexOf(name), 1);
    rulesChanged();
    // No toast: the row's tag shows the change, and aria-pressed announces it
    // Keep keyboard focus on the button that was tapped
    const selector = { noBalleimer: '.station-toggle.is-bucket', noSparring: '.station-toggle.is-sparring',
        extraStationKids: '.star-toggle' }[list];
    const row = [...document.querySelectorAll('#playerListBody li')]
        .find(li => li.querySelector('.name').textContent === name);
    if (row) {
        const button = row.querySelector(selector);
        button.focus();
        Motion.pop(button.querySelector('i'));
    }
}

// Small "no Balleimer" / "no sparring" marks next to a name
function exceptionIcons(name) {
    let html = '';
    if (noBalleimer.includes(name)) {
        html += ' <span class="ex-mark is-bucket" title="Kein Balleimer"><i class="bi bi-slash-circle" aria-hidden="true"></i><i class="bi bi-basket" aria-hidden="true"></i></span>';
    }
    if (noSparring.includes(name)) {
        html += ' <span class="ex-mark is-sparring" title="Kein Sparring"><i class="bi bi-slash-circle" aria-hidden="true"></i><i class="bi bi-person-badge" aria-hidden="true"></i></span>';
    }
    return html;
}

function rulesChanged() {
    renderRules();
    renderPlayerList();
    settingsChanged();
}

function addNeverTogether() {
    const a = $('neverA').value;
    const b = $('neverB').value;
    if (!a || !b) return;
    if (a === b) {
        toast('Zwei verschiedene Kinder wählen');
        return;
    }
    const key = [a, b].sort().join('\u0000');
    if (neverTogether.some(pair => [...pair].sort().join('\u0000') === key)) {
        toast('Diese Regel gibt es schon');
        return;
    }
    neverTogether.push([a, b]);
    $('neverA').value = '';
    $('neverB').value = '';
    rulesChanged();
    Motion.enter([$('neverList').lastElementChild]);
}

function setOpen(buttonId, bodyId, open, animate = true) {
    $(buttonId).setAttribute('aria-expanded', String(open));
    if (animate) Motion.toggle($(bodyId), open);
    else $(bodyId).hidden = !open;
}

// ===== FEASIBILITY =====
// Icon, number and a short word: readable without remembering what each icon means
function stat(icon, value, label, extraClass = '') {
    return `<span class="stat ${extraClass}" data-key="${icon}"><i class="bi ${icon}" aria-hidden="true"></i>`
        + ` <span class="stat-value">${escapeHtml(String(value))}</span> <span class="stat-label">${escapeHtml(label)}</span></span>`;
}

// After the stats re-render, numbers that changed tick up or down; new stats fade in
let lastStats = null;
function animateStats(summary) {
    const now = {};
    summary.querySelectorAll('.stat').forEach(el => {
        const key = el.dataset.key;
        const value = parseInt(el.querySelector('.stat-value').textContent, 10);
        now[key] = value;
        if (lastStats === null) return;
        if (!(key in lastStats)) Motion.enter([el]);
        else if (lastStats[key] !== value) Motion.tick(el.querySelector('.stat-value'), Math.sign(value - lastStats[key]));
    });
    lastStats = now;
}

// Mirrors the server's checks: errors block, warnings only inform
function stationNumbers() {
    const kids = currentPlayers.length;
    const atBuckets = balleimerSizes.reduce((sum, size) => sum + size, 0);
    const sparring = sparringPartners.length;
    const mental = intValue('mentalTrainerKids');
    return { kids, atBuckets, sparring, mental, playing: kids - atBuckets - sparring - mental };
}

function checkStations() {
    const summary = $('stationSummary');
    const { kids, atBuckets, sparring, mental, playing } = stationNumbers();
    const exercises = intValue('numberOfExercises');
    const kidNames = new Set(currentPlayers.map(p => p.name));
    const clash = sparringPartners.find(name => kidNames.has(name));
    const length = Math.max(1, intValue('mentalTrainerLength'));
    const picked = mentalPicks.filter(name => kidNames.has(name)).length;
    // The switch says on/off; the numbers only show while it is on
    $('mentalOn').checked = mental > 0;
    $('mentalSettings').hidden = mental === 0;
    if (mental > 0) lastMental = mental;
    // One short line: how many, and for how long
    $('mentalSummary').textContent = mental === 0
        ? 'Aus'
        : `${mental} ${mental === 1 ? 'Kind' : 'Kinder'}` + (length > 1 ? ` · ${length} Übungen` : '');
    $('toggleMental').setAttribute('aria-description', picked > 0 ? `${picked} Kinder gewählt` : '');
    renderMentalPicks();

    let error = null;
    if (kids === 0) {
        error = 'Für dieses Datum ist niemand angemeldet.';
    } else if (clash) {
        error = `${clash} ist Kind und Sparringpartner. Bitte nur einmal eintragen.`;
    } else if (playing < 0) {
        error = `Zu viele Plätze: ${kids - playing} pro Übung, aber nur ${kids} Kinder.`;
    }

    const warnings = [];
    if (!error) {
        const repeats = exercises * atBuckets - kids;
        if (repeats > 0) {
            warnings.push(repeats > kids ? 'Einige Kinder 2× am Balleimer.' : `${repeats} Kinder 2× am Balleimer.`);
        }
    }
    renderStationResult(error ? 0 : exercises * (atBuckets + sparring), kids, warnings);

    if (error) {
        summary.className = 'stats is-error';
        summary.textContent = error;
    } else {
        const pairs = Math.floor(playing / 2);
        let html = stat('bi-people', kids, 'Kinder') + stat('bi-arrow-left-right', pairs, pairs === 1 ? 'Paar' : 'Paare');
        if (atBuckets > 0) html += stat('bi-basket', atBuckets, 'Balleimer', 'is-bucket');
        if (sparring > 0) html += stat('bi-person-badge', sparring, 'Sparring', 'is-sparring');
        if (mental > 0) html += stat('bi-lightbulb', mental, 'Mental', 'is-mental');
        if (playing % 2 === 1) html += stat('bi-exclamation-triangle-fill', 1, 'ohne Partner', 'is-warn');
        summary.className = 'stats';
        summary.innerHTML = html;
        animateStats(summary);
    }
    $('generateBtn').disabled = !!error;
}

// How the Balleimer and sparring turns spread over today's kids
function renderStationResult(places, kids, warnings = []) {
    const line = $('stationResult');
    // The bar stays one line: the rotation detail only comes up with a warning
    line.hidden = places === 0 || kids === 0 || warnings.length === 0;
    if (line.hidden) return;
    const each = Math.floor(places / kids);
    const extra = places % kids;
    let text;
    if (each === 0) {
        text = `${extra} Kinder 1×, ${kids - extra} ohne Station`;
    } else if (extra === 0) {
        text = `jedes Kind ${each}×`;
    } else {
        text = `${extra} Kinder ${each + 1}×, ${kids - extra} Kinder ${each}×`;
    }
    const kidNames = new Set(currentPlayers.map(p => p.name));
    // Extra turns for strong or starred kids: the even split no longer holds exactly.
    // Name only what is actually switched on.
    const starred = extraStationKids.some(n => kidNames.has(n));
    if (strongAtStations || starred) {
        const who = strongAtStations && starred ? 'Starke und ⭐ Kinder' : strongAtStations ? 'Starke Kinder' : '⭐ Kinder';
        text = `${who} öfter, Rest gleichmässig`;
    }
    line.innerHTML = `<i class="bi bi-arrow-repeat" aria-hidden="true"></i> Stationen: ${escapeHtml(text)}`
        + warnings.map(w => ` <span class="summary-warn"><i class="bi bi-exclamation-circle" aria-hidden="true"></i> ${escapeHtml(w)}</span>`).join('');
}

// ===== GENERATE =====
function showFormError(message) {
    const box = $('formError');
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ block: 'center' });
}

function generatePlan(event) {
    event.preventDefault();
    if ($('generateBtn').disabled) return;
    // A training that is running would lose its progress: ask first
    const running = readStored(STORAGE_KEYS.plan);
    const now = running && Number.isInteger(running.now) ? running.now : null;
    if (now !== null && now < (running.exercises || []).length) {
        $('replaceText').textContent = `Übung ${now + 1} läuft gerade. Ein neuer Plan ersetzt dieses Training.`;
        Motion.openDialog($('replaceDialog'));
        $('replaceCancel').focus();
        return;
    }
    continueGenerate();
}

function continueGenerate() {
    if (stationNumbers().playing % 2 === 1) {
        openOddDialog();
        return;
    }
    createPlan();
}

// An odd number left for pairs leaves one kid alone: ask before creating
function openOddDialog() {
    const { playing } = stationNumbers();
    const fix = balleimerFix();
    $('oddText').textContent = `In jeder Übung spielen ${playing - 1} Kinder in Paaren, 1 Kind spielt als Dritter bei einem Paar mit.`;
    const fixButton = $('oddFix');
    fixButton.hidden = !fix;
    if (fix) {
        fixButton.innerHTML = `<i class="bi bi-basket" aria-hidden="true"></i> ${escapeHtml(fix.label)} – dann erstellen`;
        fixButton.onclick = () => {
            Motion.closeDialog($('oddDialog'));
            fix.run();
            createPlan();
        };
    }
    Motion.openDialog($('oddDialog'));
    oddVisual();
    (fix ? fixButton : $('oddAnyway')).focus();
}

// The two pairs settle first, then the kid left alone arrives with its question mark
function oddVisual() {
    const groups = document.querySelectorAll('#oddDialog .odd-visual > span');
    if (!Motion.full() || !window.gsap) return;
    gsap.fromTo(groups, { autoAlpha: 0, y: 6 }, {
        autoAlpha: 1, y: 0, duration: 0.25, ease: 'power3.out', stagger: 0.08, delay: 0.1,
        clearProps: 'transform,opacity,visibility'
    });
    gsap.fromTo('#oddDialog .odd-alone .bi-question-lg', { rotation: -20, scale: 0.6 },
        { rotation: 0, scale: 1, duration: 0.35, ease: 'power3.out', delay: 0.3, clearProps: 'transform' });
}

function createPlan() {
    const button = $('generateBtn');
    $('formError').hidden = true;
    button.disabled = true;
    button.textContent = 'Plan wird erstellt…';

    fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingDate: selectedDate(), players: currentPlayers, settings: currentSettings() })
    })
        .then(readJsonResponse)
        .then(plan => {
            if (!writeStored(STORAGE_KEYS.plan, plan)) {
                throw new Error('Der Browser erlaubt kein Speichern. Bitte den privaten Modus verlassen.');
            }
            window.location.href = '/plan';
        })
        .catch(error => {
            showFormError(friendlyError(error));
            button.textContent = 'Plan erstellen';
            checkStations();
        });
}

// ===== WIRING =====
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    renderBalleimer();
    renderSparringPartners();

    const lastPlan = readStored(STORAGE_KEYS.plan);
    if (lastPlan && lastPlan.trainingDate) {
        const link = $('lastPlanLink');
        link.hidden = false;
        // The date of that plan stays available on hover and for screen readers
        link.title = `Plan vom ${lastPlan.trainingDate}`;
        link.setAttribute('aria-label', `Zurück zum erstellten Plan vom ${lastPlan.trainingDate}`);
    }

    document.querySelectorAll('[data-step]').forEach(btn =>
        btn.addEventListener('click', () => step(btn.dataset.for, parseInt(btn.dataset.step, 10))));
    setMentalOpen(readStored(MENTAL_OPEN_KEY) === true, false);
    $('addMentalPick').addEventListener('click', addMentalPick);
    $('toggleMental').addEventListener('click', () => {
        const open = $('toggleMental').getAttribute('aria-expanded') !== 'true';
        setMentalOpen(open);
        writeStored(MENTAL_OPEN_KEY, open);
    });
    $('mentalOn').addEventListener('change', () => {
        $('mentalTrainerKids').value = $('mentalOn').checked ? lastMental : 0;
        settingsChanged();
        if ($('mentalOn').checked) Motion.enter([$('mentalSettings')]);
    });
    ['numberOfExercises', 'mentalTrainerKids', 'mentalTrainerLength'].forEach(id =>
        $(id).addEventListener('input', settingsChanged));
    $('addBucketBtn').addEventListener('click', addBucket);

    setOpen('toggleRules', 'rulesBody', readStored(RULES_OPEN_KEY) === true, false);
    $('toggleRules').addEventListener('click', () => {
        const open = $('toggleRules').getAttribute('aria-expanded') !== 'true';
        setOpen('toggleRules', 'rulesBody', open);
        writeStored(RULES_OPEN_KEY, open);
    });
    $('strongAtStations').addEventListener('change', (e) => {
        strongAtStations = e.target.checked;
        rulesChanged();
    });
    $('deletePlayerBtn').addEventListener('click', () => {
        Motion.closeDialog($('playerDialog'));
        deletePlayer(editingPlayerIndex);
    });
    document.querySelectorAll('input[name=stationPriority]').forEach(radio =>
        radio.addEventListener('change', () => {
            stationPriority = radio.value;
            rulesChanged();
        }));
    $('addNever').addEventListener('click', addNeverTogether);

    // ⓘ buttons show or hide the short explanation next to them
    document.querySelectorAll('.info-btn').forEach(btn => btn.addEventListener('click', () => {
        const info = $(btn.getAttribute('aria-controls'));
        const open = info.hidden;
        btn.setAttribute('aria-expanded', String(open));
        Motion.toggle(info, open);
    }));

    $('replaceConfirm').addEventListener('click', () => {
        Motion.closeDialog($('replaceDialog'));
        continueGenerate();
    });
    $('oddAnyway').addEventListener('click', () => {
        Motion.closeDialog($('oddDialog'));
        createPlan();
    });
    $('closeOdd').addEventListener('click', () => Motion.closeDialog($('oddDialog')));

    $('addSparringBtn').addEventListener('click', addSparringPartner);
    // Enter in the name field adds the partner instead of submitting the form
    $('sparringName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSparringPartner();
        }
    });

    $('togglePlayers').addEventListener('click', togglePlayerList);
    $('addPlayerBtn').addEventListener('click', () => openPlayerDialog(null));
    $('playerForm').addEventListener('submit', savePlayer);
    $('cancelPlayer').addEventListener('click', () => Motion.closeDialog($('playerDialog')));
    $('closePlayerDialog').addEventListener('click', () => Motion.closeDialog($('playerDialog')));
    document.querySelectorAll('.sortbar [data-sort]').forEach(btn =>
        btn.addEventListener('click', () => {
            sortColumn = btn.dataset.sort;
            // Re-sorting: every row glides to its new place
            Motion.flip('#playerListBody li', renderPlayerList);
        }));

    $('trainingDate').addEventListener('change', () => loadPlayers());
    $('refreshBtn').addEventListener('click', refreshFromSheet);
    $('resetRoster').addEventListener('click', () => loadPlayers({ fromSheet: true }));
    $('planForm').addEventListener('submit', generatePlan);

    loadPlayers();
});
