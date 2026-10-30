// Entry page: training date, today's kids, Balleimer and sparring settings.

let currentPlayers = [];
let sparringPartners = [];
let balleimerSizes = []; // kids per Balleimer, one entry per Balleimer
let mentalPicks = []; // kid names chosen for the Mentaltrainer, in order
let neverTogether = []; // [name, name] pairs who must not play each other
let stationPriority = 'random'; // who gets a station first: weaker, stronger, random
let noBalleimer = []; // kid names who never go to a Balleimer
let noSparring = []; // kid names who never get a sparring partner
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
        .catch(error => showFormError('Die Anmeldungen konnten nicht geladen werden. ' + error.message));
}

function setPlayers(players, edited) {
    currentPlayers = players;
    rosterEdited = edited;
    renderPlayerList();
}

function rosterChanged() {
    rosterEdited = true;
    writeStored(STORAGE_KEYS.roster, { date: selectedDate(), players: currentPlayers });
    renderPlayerList();
}

function refreshFromSheet() {
    const btn = $('refreshBtn');
    btn.disabled = true;
    fetch('/api/refresh', { method: 'POST' })
        .then(readJsonResponse)
        .then(() => loadPlayers({ fromSheet: true }))
        .then(() => toast(`${currentPlayers.length} Kinder aus dem Sheet geladen`))
        .catch(error => showFormError('Das Sheet konnte nicht neu geladen werden. ' + error.message))
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
        item.innerHTML = `
            <span class="name">${escapeHtml(player.name)}${exceptionIcons(player.name)}</span>
            <span class="level" title="Elo">${player.elo}</span>
            <button type="button" class="btn btn-icon btn-quiet" aria-label="${escapeHtml(player.name)} bearbeiten">
                <i class="bi bi-pencil" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet" aria-label="${escapeHtml(player.name)} entfernen">
                <i class="bi bi-trash3" aria-hidden="true"></i></button>`;
        const [editBtn, deleteBtn] = item.querySelectorAll('button');
        editBtn.addEventListener('click', () => openPlayerDialog(index));
        deleteBtn.addEventListener('click', () => deletePlayer(index));
        list.appendChild(item);
    });

    renderRules();
    checkStations();
}

function togglePlayerList() {
    const list = $('playerList');
    list.hidden = !list.hidden;
    $('togglePlayers').setAttribute('aria-expanded', String(!list.hidden));
}

function openPlayerDialog(index) {
    editingPlayerIndex = index;
    const player = index == null ? null : currentPlayers[index];
    $('playerDialogTitle').textContent = player ? 'Kind bearbeiten' : 'Kind hinzufügen';
    $('playerName').value = player ? player.name : '';
    $('playerElo').value = player ? player.elo : defaultElo(currentPlayers);
    $('playerNoBalleimer').checked = !!player && noBalleimer.includes(player.name);
    $('playerNoSparring').checked = !!player && noSparring.includes(player.name);
    $('playerError').hidden = true;
    $('playerDialog').showModal();
    $('playerName').focus();
}

function savePlayer(event) {
    event.preventDefault();
    const name = $('playerName').value.trim();
    const elo = parseInt($('playerElo').value, 10);
    const error = $('playerError');

    let message = null;
    if (!name) {
        message = 'Bitte einen Namen eingeben.';
    } else if (isNaN(elo) || elo < ELO_MIN || elo > ELO_MAX) {
        message = `Bitte eine Elo zwischen ${ELO_MIN} und ${ELO_MAX} eingeben.`;
    } else {
        const duplicate = currentPlayers.findIndex(p => p.name === name);
        if (duplicate !== -1 && duplicate !== editingPlayerIndex) message = `${name} steht schon in der Liste.`;
    }
    if (message) {
        error.textContent = message;
        error.hidden = false;
        return;
    }

    if (editingPlayerIndex != null) {
        renameEverywhere(currentPlayers[editingPlayerIndex].name, name);
        currentPlayers[editingPlayerIndex] = { name, elo };
    } else {
        currentPlayers.push({ name, elo });
    }
    noBalleimer = noBalleimer.filter(n => n !== name);
    noSparring = noSparring.filter(n => n !== name);
    if ($('playerNoBalleimer').checked) noBalleimer.push(name);
    if ($('playerNoSparring').checked) noSparring.push(name);
    $('playerDialog').close();
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
        neverTogether
    };
}

function settingsChanged() {
    writeStored(STORAGE_KEYS.settings, currentSettings());
    checkStations();
}

function step(id, delta) {
    const input = $(id);
    const min = parseInt(input.min, 10);
    const max = parseInt(input.max, 10);
    input.value = Math.min(max, Math.max(min, intValue(id) + delta));
    settingsChanged();
}

// ===== MENTALTRAINER =====
// Whether the block is open is a per-browser convenience
const MENTAL_OPEN_KEY = 'trainingsplaner.mentalOpen';

function setMentalOpen(open) {
    $('mentalBody').hidden = !open;
    $('toggleMental').setAttribute('aria-expanded', String(open));
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
    $('mentalPickSelect').focus();
}

function moveMentalPick(index) {
    if (index === 0) return;
    [mentalPicks[index - 1], mentalPicks[index]] = [mentalPicks[index], mentalPicks[index - 1]];
    settingsChanged();
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
    $('addBucketBtn').disabled = balleimerSizes.length >= MAX_BALLEIMER;
}

function setBucketSize(index, size) {
    balleimerSizes[index] = Math.min(MAX_PER_BALLEIMER, Math.max(1, isNaN(size) ? 1 : size));
    renderBalleimer();
    settingsChanged();
    const input = $(`bucket-${index + 1}`);
    if (input) input.focus();
}

function addBucket() {
    if (balleimerSizes.length >= MAX_BALLEIMER) return;
    // A new Balleimer starts like the last one, or with 2 kids
    balleimerSizes.push(balleimerSizes.length > 0 ? balleimerSizes[balleimerSizes.length - 1] : 2);
    renderBalleimer();
    settingsChanged();
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
    const excepted = [...new Set([...noBalleimer, ...noSparring])].sort((a, b) => a.localeCompare(b));
    if (excepted.length === 0) exceptions.innerHTML = '<li class="info">Keine</li>';
    excepted.forEach(name => {
        const item = document.createElement('li');
        item.className = here.has(name) ? '' : 'is-away';
        const parts = [];
        if (noBalleimer.includes(name)) parts.push('kein Balleimer');
        if (noSparring.includes(name)) parts.push('kein Sparring');
        item.innerHTML = `<span>${escapeHtml(name)}</span>
            <span class="ex-text">${parts.join(', ')}</span>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet"
                aria-label="Ausnahmen für ${escapeHtml(name)} entfernen"><i class="bi bi-trash3" aria-hidden="true"></i></button>`;
        item.querySelector('button').addEventListener('click', () => {
            noBalleimer = noBalleimer.filter(n => n !== name);
            noSparring = noSparring.filter(n => n !== name);
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

    const count = (stationPriority !== 'random' ? 1 : 0)
        + excepted.filter(n => here.has(n)).length
        + neverTogether.filter(pair => pair.every(n => here.has(n))).length;
    $('rulesSummary').textContent = count === 0 ? 'Keine' : `${count} aktiv`;
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
}

function setOpen(buttonId, bodyId, open) {
    $(bodyId).hidden = !open;
    $(buttonId).setAttribute('aria-expanded', String(open));
}

// ===== FEASIBILITY =====
function stat(icon, value, label, extraClass = '') {
    return `<span class="stat ${extraClass}" title="${escapeHtml(label)}"><i class="bi ${icon}" aria-hidden="true"></i>`
        + ` ${escapeHtml(String(value))}<span class="visually-hidden"> ${escapeHtml(label)}</span></span>`;
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
    const warning = $('stationWarning');
    const { kids, atBuckets, sparring, mental, playing } = stationNumbers();
    const exercises = intValue('numberOfExercises');
    const kidNames = new Set(currentPlayers.map(p => p.name));
    const clash = sparringPartners.find(name => kidNames.has(name));
    const length = Math.max(1, intValue('mentalTrainerLength'));
    const picked = mentalPicks.filter(name => kidNames.has(name)).length;
    $('mentalSummary').textContent = mental === 0
        ? 'Aus'
        : `${mental} Kinder · ${length}×` + (picked > 0 ? ` · ${picked} gewählt` : '');
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
    renderStationResult(error ? 0 : exercises * (atBuckets + sparring), kids);
    warning.hidden = warnings.length === 0;
    warning.innerHTML = warnings.map(w => `<i class="bi bi-exclamation-circle" aria-hidden="true"></i> ${escapeHtml(w)}`).join('<br>');

    if (error) {
        summary.className = 'stats is-error';
        summary.textContent = error;
    } else {
        const pairs = Math.floor(playing / 2);
        let html = stat('bi-people', kids, 'Kinder') + stat('bi-arrow-left-right', pairs, pairs === 1 ? 'Paar' : 'Paare');
        if (atBuckets > 0) html += stat('bi-basket', atBuckets, 'am Balleimer', 'is-bucket');
        if (sparring > 0) html += stat('bi-person-badge', sparring, 'im Sparring', 'is-sparring');
        if (mental > 0) html += stat('bi-lightbulb', mental, 'beim Mentaltrainer', 'is-mental');
        if (playing % 2 === 1) html += stat('bi-exclamation-triangle-fill', 1, 'ohne Partner', 'is-warn');
        summary.className = 'stats';
        summary.innerHTML = html;
    }
    $('generateBtn').disabled = !!error;
}

// How the Balleimer and sparring turns spread over today's kids
function renderStationResult(places, kids) {
    const line = $('stationResult');
    line.hidden = places === 0 || kids === 0;
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
    line.innerHTML = `<i class="bi bi-arrow-repeat" aria-hidden="true"></i> Stationen: ${escapeHtml(text)}`;
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
    $('oddText').textContent = `In jeder Übung spielen ${playing - 1} Kinder in Paaren, 1 Kind bleibt allein.`;
    const fixButton = $('oddFix');
    fixButton.hidden = !fix;
    if (fix) {
        fixButton.innerHTML = `<i class="bi bi-basket" aria-hidden="true"></i> ${escapeHtml(fix.label)} – dann erstellen`;
        fixButton.onclick = () => {
            $('oddDialog').close();
            fix.run();
            createPlan();
        };
    }
    $('oddDialog').showModal();
    (fix ? fixButton : $('oddAnyway')).focus();
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
            showFormError(error.message);
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
        link.querySelector('span').textContent = `Plan ${lastPlan.trainingDate}`;
    }

    document.querySelectorAll('[data-step]').forEach(btn =>
        btn.addEventListener('click', () => step(btn.dataset.for, parseInt(btn.dataset.step, 10))));
    setMentalOpen(readStored(MENTAL_OPEN_KEY) === true);
    $('addMentalPick').addEventListener('click', addMentalPick);
    $('toggleMental').addEventListener('click', () => {
        const open = $('toggleMental').getAttribute('aria-expanded') !== 'true';
        setMentalOpen(open);
        writeStored(MENTAL_OPEN_KEY, open);
    });
    ['numberOfExercises', 'mentalTrainerKids', 'mentalTrainerLength'].forEach(id =>
        $(id).addEventListener('input', settingsChanged));
    $('addBucketBtn').addEventListener('click', addBucket);

    setOpen('toggleRules', 'rulesBody', readStored(RULES_OPEN_KEY) === true);
    $('toggleRules').addEventListener('click', () => {
        const open = $('toggleRules').getAttribute('aria-expanded') !== 'true';
        setOpen('toggleRules', 'rulesBody', open);
        writeStored(RULES_OPEN_KEY, open);
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
        info.hidden = !info.hidden;
        btn.setAttribute('aria-expanded', String(!info.hidden));
    }));

    $('oddAnyway').addEventListener('click', () => {
        $('oddDialog').close();
        createPlan();
    });
    $('closeOdd').addEventListener('click', () => $('oddDialog').close());

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
    $('cancelPlayer').addEventListener('click', () => $('playerDialog').close());
    $('closePlayerDialog').addEventListener('click', () => $('playerDialog').close());
    document.querySelectorAll('.sortbar [data-sort]').forEach(btn =>
        btn.addEventListener('click', () => {
            sortColumn = btn.dataset.sort;
            renderPlayerList();
        }));

    $('trainingDate').addEventListener('change', () => loadPlayers());
    $('refreshBtn').addEventListener('click', refreshFromSheet);
    $('resetRoster').addEventListener('click', () => loadPlayers({ fromSheet: true }));
    $('planForm').addEventListener('submit', generatePlan);

    loadPlayers();
});
