// Entry page: training date, today's kids, Balleimer and sparring settings.

let currentPlayers = [];
let sparringPartners = [];
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
        setPlayers(saved.players, true);
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
    currentPlayers.sort((a, b) => sortColumn === 'klassierung'
        ? b.klassierung - a.klassierung || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name));
}

function renderPlayerList() {
    sortPlayers();
    $('playerCount').textContent = currentPlayers.length;
    $('rosterNote').hidden = !rosterEdited;
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
            <span class="name">${escapeHtml(player.name)}</span>
            <span class="level" title="Klassierung">${player.klassierung}</span>
            <button type="button" class="btn btn-icon btn-quiet" aria-label="${escapeHtml(player.name)} bearbeiten">
                <i class="bi bi-pencil" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-icon btn-quiet btn-danger-quiet" aria-label="${escapeHtml(player.name)} entfernen">
                <i class="bi bi-trash3" aria-hidden="true"></i></button>`;
        const [editBtn, deleteBtn] = item.querySelectorAll('button');
        editBtn.addEventListener('click', () => openPlayerDialog(index));
        deleteBtn.addEventListener('click', () => deletePlayer(index));
        list.appendChild(item);
    });

    checkStations();
}

function togglePlayerList() {
    const list = $('playerList');
    const button = $('togglePlayers');
    list.hidden = !list.hidden;
    button.setAttribute('aria-expanded', String(!list.hidden));
    button.textContent = list.hidden ? 'Liste zeigen' : 'Liste ausblenden';
}

function openPlayerDialog(index) {
    editingPlayerIndex = index;
    const player = index == null ? null : currentPlayers[index];
    $('playerDialogTitle').textContent = player ? 'Kind bearbeiten' : 'Kind hinzufügen';
    $('playerName').value = player ? player.name : '';
    $('playerKlassierung').value = player ? player.klassierung : 1;
    $('playerError').hidden = true;
    $('playerDialog').showModal();
    $('playerName').focus();
}

function savePlayer(event) {
    event.preventDefault();
    const name = $('playerName').value.trim();
    const klassierung = parseInt($('playerKlassierung').value, 10);
    const error = $('playerError');

    let message = null;
    if (!name) {
        message = 'Bitte einen Namen eingeben.';
    } else if (isNaN(klassierung) || klassierung < 1 || klassierung > 21) {
        message = 'Die Klassierung liegt zwischen 1 und 21.';
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
        currentPlayers[editingPlayerIndex] = { name, klassierung };
    } else {
        currentPlayers.push({ name, klassierung });
    }
    $('playerDialog').close();
    rosterChanged();
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
    if (saved.balleimerCount != null) $('balleimerCount').value = saved.balleimerCount;
    if (saved.playersPerBalleimer) $('playersPerBalleimer').value = saved.playersPerBalleimer;
    if (Array.isArray(saved.sparringPartners)) sparringPartners = saved.sparringPartners;
}

function currentSettings() {
    return {
        numberOfExercises: intValue('numberOfExercises'),
        balleimerCount: intValue('balleimerCount'),
        playersPerBalleimer: intValue('playersPerBalleimer'),
        sparringPartners
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

// ===== FEASIBILITY =====
// Mirrors the server's checks; when the settings cannot work, says why and offers the fix
function checkStations() {
    const summary = $('stationSummary');
    const fix = $('fixSuggestion');
    const kids = currentPlayers.length;
    const { numberOfExercises: exercises, balleimerCount: buckets, playersPerBalleimer: perBucket } = currentSettings();
    const atBuckets = buckets * perBucket;
    const sparring = sparringPartners.length;
    const playing = kids - atBuckets - sparring;
    const kidNames = new Set(currentPlayers.map(p => p.name));
    const clash = sparringPartners.find(name => kidNames.has(name));

    let error = null;
    let fixAction = null;
    if (kids === 0) {
        error = 'Für dieses Datum ist niemand angemeldet.';
    } else if (clash) {
        error = `${clash} steht bei den Kindern und bei den Sparringpartnern. Bitte nur an einer Stelle eintragen.`;
    } else if (playing < 0) {
        error = `Balleimer und Sparring brauchen ${atBuckets + sparring} Kinder pro Übung, es sind aber nur ${kids} da.`;
    } else if (exercises * atBuckets > kids) {
        const maxExercises = Math.floor(kids / atBuckets);
        error = `Jedes Kind darf nur einmal an einen Balleimer. Mit ${buckets} × ${perBucket} Kindern `
            + `reicht es für höchstens ${maxExercises} ${maxExercises === 1 ? 'Übung' : 'Übungen'}.`;
        fixAction = {
            label: `Auf ${maxExercises} ${maxExercises === 1 ? 'Übung' : 'Übungen'} setzen`,
            run: () => {
                $('numberOfExercises').value = maxExercises;
                settingsChanged();
            }
        };
    }

    if (error) {
        summary.className = 'summary is-error';
        summary.textContent = error;
    } else {
        const parts = [];
        const pairs = Math.floor(playing / 2);
        parts.push(`${pairs} ${pairs === 1 ? 'Paar' : 'Paare'}`);
        if (atBuckets > 0) parts.push(`${atBuckets} am Balleimer`);
        if (sparring > 0) parts.push(`${sparring} im Sparring`);
        if (playing % 2 === 1) parts.push('1 ohne Partner');
        summary.className = 'summary';
        summary.textContent = `${kids} Kinder · pro Übung: ${parts.join(' · ')}`;
    }

    fix.hidden = !fixAction;
    fix.onclick = fixAction ? fixAction.run : null;
    fix.textContent = fixAction ? fixAction.label : '';
    $('generateBtn').disabled = !!error;
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
    const button = $('generateBtn');
    if (button.disabled) return;
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
    renderSparringPartners();

    const lastPlan = readStored(STORAGE_KEYS.plan);
    if (lastPlan && lastPlan.trainingDate) {
        const link = $('lastPlanLink');
        link.hidden = false;
        link.querySelector('span').textContent = `Plan ${lastPlan.trainingDate}`;
    }

    document.querySelectorAll('[data-step]').forEach(btn =>
        btn.addEventListener('click', () => step(btn.dataset.for, parseInt(btn.dataset.step, 10))));
    ['numberOfExercises', 'balleimerCount', 'playersPerBalleimer'].forEach(id =>
        $(id).addEventListener('input', settingsChanged));

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
