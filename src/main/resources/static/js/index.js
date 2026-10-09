// Entry page: training date, today's kids, Balleimer and sparring settings.

let currentPlayers = [];
let sparringPartners = [];
let balleimerSizes = []; // kids per Balleimer, one entry per Balleimer
let mentalPicks = []; // kid names chosen for the Mentaltrainer, in order
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
    $('playerElo').value = player ? player.elo : defaultElo(currentPlayers);
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
        currentPlayers[editingPlayerIndex] = { name, elo };
    } else {
        currentPlayers.push({ name, elo });
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
}

function currentSettings() {
    return {
        numberOfExercises: intValue('numberOfExercises'),
        balleimerSizes,
        mentalTrainerKids: intValue('mentalTrainerKids'),
        mentalTrainerLength: Math.max(1, intValue('mentalTrainerLength')),
        mentalTrainerPicks: mentalPicks,
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
    select.innerHTML = '<option value="">Kind wählen…</option>' + options.map(p =>
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
            where = 'Heute nicht angemeldet';
            off = true;
        } else if (perSession === 0) {
            where = 'Kinder pro Einheit ist 0';
            off = true;
        } else {
            const session = Math.floor(order / perSession);
            order++;
            if (session >= sessions) {
                where = 'Kommt nicht dran – zu wenig Plätze';
                off = true;
                notPlaced++;
            } else {
                const first = session * length + 1;
                const last = Math.min(first + length - 1, exercises);
                where = `Einheit ${session + 1} · ${first === last ? `Übung ${first}` : `Übung ${first}–${last}`}`;
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
    note.textContent = `${notPlaced} ${notPlaced === 1 ? 'Kind kommt' : 'Kinder kommen'} nicht dran: `
        + `${sessions} ${sessions === 1 ? 'Einheit' : 'Einheiten'} × ${perSession} Kinder.`;
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
    if (balleimerSizes.length === 0) {
        list.innerHTML = '<li class="empty">Keine Balleimer – alle Kinder spielen in Paaren oder Sparring.</li>';
    }
    balleimerSizes.forEach((size, index) => {
        const n = index + 1;
        const item = document.createElement('li');
        item.innerHTML = `
            <label for="bucket-${n}">Balleimer ${n}</label>
            <div class="stepper">
                <button type="button" class="btn" aria-label="Balleimer ${n}: ein Kind weniger"${size <= 1 ? ' disabled' : ''}>−</button>
                <input type="number" id="bucket-${n}" inputmode="numeric" min="1" max="${MAX_PER_BALLEIMER}" value="${size}"
                    aria-describedby="bucket-${n}-unit">
                <button type="button" class="btn" aria-label="Balleimer ${n}: ein Kind mehr"${size >= MAX_PER_BALLEIMER ? ' disabled' : ''}>+</button>
            </div>
            <span id="bucket-${n}-unit" class="visually-hidden">Kinder</span>
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

// ===== FEASIBILITY =====
// Mirrors the server's checks; when the settings cannot work, says why and offers the fix
function checkStations() {
    const summary = $('stationSummary');
    const warning = $('stationWarning');
    const kids = currentPlayers.length;
    const exercises = intValue('numberOfExercises');
    const atBuckets = balleimerSizes.reduce((sum, size) => sum + size, 0);
    const sparring = sparringPartners.length;
    const mental = intValue('mentalTrainerKids');
    const playing = kids - atBuckets - sparring - mental;
    const kidNames = new Set(currentPlayers.map(p => p.name));
    const clash = sparringPartners.find(name => kidNames.has(name));
    const length = Math.max(1, intValue('mentalTrainerLength'));
    const picked = mentalPicks.filter(name => kidNames.has(name)).length;
    $('mentalSummary').textContent = mental === 0
        ? 'Aus'
        : `${mental} ${mental === 1 ? 'Kind' : 'Kinder'} · ${length} ${length === 1 ? 'Übung' : 'Übungen'}`
            + (picked > 0 ? ` · ${picked} ausgewählt` : '');
    renderMentalPicks();

    let error = null;
    if (kids === 0) {
        error = 'Für dieses Datum ist niemand angemeldet.';
    } else if (clash) {
        error = `${clash} steht bei den Kindern und bei den Sparringpartnern. Bitte nur an einer Stelle eintragen.`;
    } else if (playing < 0) {
        error = `Mentaltrainer, Balleimer und Sparring brauchen ${kids - playing} Kinder pro Übung, `
            + `es sind aber nur ${kids} da.`;
    }

    // Not blocking: warnings about kids without a station, and Balleimer repeats
    const warnings = [];
    let fix = null;
    if (!error && playing % 2 === 1) {
        warnings.push('1 Kind hat in jeder Übung keinen Partner und keine Station. '
            + 'Ein Kind mehr oder weniger am Balleimer geht auf.');
        fix = balleimerFix();
    }
    const repeats = exercises * atBuckets - kids;
    if (!error && repeats > 0) {
        warnings.push(repeats > kids
            ? 'Einige Kinder gehen mehrmals an einen Balleimer.'
            : `${repeats} ${repeats === 1 ? 'Kind geht' : 'Kinder gehen'} zweimal an einen Balleimer.`);
    }
    warning.hidden = warnings.length === 0;
    warning.innerHTML = warnings.map(escapeHtml).join('<br>');
    const fixButton = $('stationFix');
    fixButton.hidden = !fix;
    fixButton.textContent = fix ? fix.label : '';
    fixButton.onclick = fix ? fix.run : null;

    if (error) {
        summary.className = 'summary is-error';
        summary.textContent = error;
    } else {
        const parts = [];
        const pairs = Math.floor(playing / 2);
        parts.push(`${pairs} ${pairs === 1 ? 'Paar' : 'Paare'}`);
        if (mental > 0) parts.push(`${mental} beim Mentaltrainer`);
        if (atBuckets > 0) parts.push(`${atBuckets} am Balleimer`);
        if (sparring > 0) parts.push(`${sparring} im Sparring`);
        if (playing % 2 === 1) parts.push('1 ohne Partner');
        summary.className = 'summary';
        summary.textContent = `${kids} Kinder · pro Übung: ${parts.join(' · ')}`;
    }
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
