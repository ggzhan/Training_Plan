// Entry page: training date, player list, Balleimer and sparring settings.

let currentPlayers = [];
let sparringPartners = [];
let editingPlayerIndex = null;
let playerModal = null;

// Sorting State
let currentSort = {
    column: 'name', // 'name' or 'klassierung'
    direction: 'asc' // 'asc' or 'desc'
};

const SETTINGS_KEY = 'trainingsplaner.settings';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== DATA REFRESH =====
function refreshData() {
    const btn = document.getElementById('refreshBtn');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Wird aktualisiert…';

    const restore = (html) => {
        btn.innerHTML = html;
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }, 2000);
    };

    fetch('/api/refresh', { method: 'POST' })
        .then(response => {
            if (!response.ok) throw new Error(response.statusText);
            loadPlayers();
            restore('<i class="bi bi-check-circle"></i> Aktualisiert');
        })
        .catch(error => {
            console.error('Error refreshing data:', error);
            restore('<i class="bi bi-x-circle"></i> Fehler');
        });
}

// ===== SETTINGS (remembered per browser) =====
function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        if (!saved) return;
        if (saved.numberOfExercises) document.getElementById('numberOfExercises').value = saved.numberOfExercises;
        if (saved.balleimerCount != null) document.getElementById('balleimerCount').value = saved.balleimerCount;
        if (saved.playersPerBalleimer) document.getElementById('playersPerBalleimer').value = saved.playersPerBalleimer;
        if (Array.isArray(saved.sparringPartners)) sparringPartners = saved.sparringPartners;
    } catch (e) {
        // Storage blocked or corrupt: start from the form defaults
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            numberOfExercises: intValue('numberOfExercises'),
            balleimerCount: intValue('balleimerCount'),
            playersPerBalleimer: intValue('playersPerBalleimer'),
            sparringPartners
        }));
    } catch (e) {
        // Not remembering is fine
    }
}

function intValue(id) {
    const value = parseInt(document.getElementById(id).value, 10);
    return isNaN(value) ? 0 : value;
}

// ===== SPARRING PARTNERS =====
function addSparringPartner() {
    const input = document.getElementById('sparringName');
    const name = input.value.trim();
    if (!name) return;
    if (sparringPartners.includes(name)) {
        input.select();
        return;
    }
    sparringPartners.push(name);
    input.value = '';
    input.focus();
    renderSparringPartners();
    settingsChanged();
}

function removeSparringPartner(index) {
    sparringPartners.splice(index, 1);
    renderSparringPartners();
    settingsChanged();
}

function renderSparringPartners() {
    const list = document.getElementById('sparringList');
    list.innerHTML = '';
    sparringPartners.forEach((name, index) => {
        const badge = document.createElement('span');
        badge.className = 'badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-1 fs-6 fw-normal';
        badge.innerHTML = `<i class="bi bi-person-badge"></i> ${escapeHtml(name)}
            <button type="button" class="btn-close ms-1" style="font-size: 0.6rem;" aria-label="Entfernen"></button>`;
        badge.querySelector('button').addEventListener('click', () => removeSparringPartner(index));
        list.appendChild(badge);
    });
}

// ===== FEASIBILITY =====
// Mirrors the server's checks so the button is only active when the plan can be built
function checkStations() {
    const summary = document.getElementById('stationSummary');
    const button = document.getElementById('generateBtn');
    const kids = currentPlayers.length;
    const exercises = intValue('numberOfExercises');
    const buckets = intValue('balleimerCount');
    const perBucket = intValue('playersPerBalleimer');
    const atBuckets = buckets * perBucket;
    const sparring = sparringPartners.length;
    const playing = kids - atBuckets - sparring;
    const kidNames = new Set(currentPlayers.map(p => p.name));
    const clash = sparringPartners.find(name => kidNames.has(name));

    let error = null;
    if (kids === 0) {
        error = 'Keine Spieler für dieses Datum.';
    } else if (clash) {
        error = `${clash} steht in der Spielerliste und bei den Sparringpartnern – bitte nur an einer Stelle.`;
    } else if (playing < 0) {
        error = `Pro Übung braucht es ${atBuckets + sparring} Kinder für Balleimer und Sparring, es sind aber nur ${kids} da.`;
    } else if (exercises * atBuckets > kids) {
        error = `${exercises} Übungen × ${buckets} Balleimer × ${perBucket} Kinder = ${exercises * atBuckets} Balleimer-Plätze, `
            + `aber nur ${kids} Kinder – jedes Kind darf nur einmal an einen Balleimer.`;
    }

    if (error) {
        summary.className = 'form-text text-danger fw-bold';
        summary.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${escapeHtml(error)}`;
    } else {
        const parts = [];
        if (atBuckets > 0) parts.push(`${atBuckets} am Balleimer`);
        if (sparring > 0) parts.push(`${sparring} im Sparring`);
        const pairs = Math.floor(playing / 2);
        parts.push(`${pairs} ${pairs === 1 ? 'Paar' : 'Paare'}`);
        if (playing % 2 === 1) parts.push('1 ohne Partner');
        summary.className = 'form-text';
        summary.innerHTML = `<i class="bi bi-info-circle"></i> Pro Übung: ${escapeHtml(parts.join(' · '))}`;
    }
    button.disabled = !!error;
}

function settingsChanged() {
    saveSettings();
    checkStations();
}

// ===== PLAYER MANAGEMENT =====
document.addEventListener('DOMContentLoaded', function () {
    const modalElement = document.getElementById('playerModal');
    if (modalElement) {
        playerModal = new bootstrap.Modal(modalElement);
    }

    loadSettings();
    renderSparringPartners();
    ['numberOfExercises', 'balleimerCount', 'playersPerBalleimer'].forEach(id =>
        document.getElementById(id).addEventListener('input', settingsChanged));

    // Enter in the name field adds the partner instead of submitting the form
    document.getElementById('sparringName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSparringPartner();
        }
    });

    const dateSelect = document.getElementById('trainingDate');
    dateSelect.addEventListener('change', loadPlayers);
    if (RETURNED_PLAYERS_JSON) {
        // The server sent the form back: keep the list as the user left it
        currentPlayers = JSON.parse(RETURNED_PLAYERS_JSON);
        applySort();
        renderPlayerList();
    } else {
        loadPlayers();
    }

    document.getElementById('planForm').addEventListener('submit', function () {
        document.getElementById('playersJson').value = JSON.stringify(currentPlayers);
        document.getElementById('sparringPartnersJson').value = JSON.stringify(sparringPartners);
    });
});

function loadPlayers() {
    const dateSelect = document.getElementById('trainingDate');
    if (!dateSelect || !dateSelect.value) {
        checkStations();
        return;
    }

    fetch(`/api/players?date=${encodeURIComponent(dateSelect.value)}`)
        .then(response => response.json())
        .then(players => {
            currentPlayers = players;
            applySort();
            renderPlayerList();
        })
        .catch(error => console.error('Error loading players:', error));
}

function sortPlayers(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    applySort();
    renderPlayerList();
}

function applySort() {
    currentPlayers.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];

        // Case insensitive string comparison for names
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortIcons() {
    ['name', 'klassierung'].forEach(col => {
        const icon = document.getElementById(`sortIcon-${col}`);
        if (icon) {
            icon.className = 'bi bi-arrow-down-up opacity-50';
        }
    });

    const activeIcon = document.getElementById(`sortIcon-${currentSort.column}`);
    if (activeIcon) {
        activeIcon.className = currentSort.direction === 'asc' ? 'bi bi-sort-down' : 'bi bi-sort-up';
    }
}

function renderPlayerList() {
    const tbody = document.getElementById('playerListBody');
    const countSpan = document.getElementById('playerCount');
    if (!tbody) return;

    tbody.innerHTML = '';
    countSpan.textContent = currentPlayers.length;
    updateSortIcons();

    currentPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(player.name)}</td>
            <td class="text-center"><span class="badge bg-primary">${player.klassierung}</span></td>
            <td class="text-end">
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="editPlayer(${index})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="deletePlayer(${index})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    checkStations();
}

function openAddPlayerModal() {
    editingPlayerIndex = null;
    document.getElementById('modalTitle').textContent = 'Spieler hinzufügen';
    document.getElementById('playerName').value = '';
    document.getElementById('playerKlassierung').value = '1';
}

function editPlayer(index) {
    editingPlayerIndex = index;
    const player = currentPlayers[index];

    document.getElementById('modalTitle').textContent = 'Spieler bearbeiten';
    document.getElementById('playerName').value = player.name;
    document.getElementById('playerKlassierung').value = player.klassierung;

    playerModal.show();
}

function savePlayer() {
    const name = document.getElementById('playerName').value.trim();
    const klassierung = parseInt(document.getElementById('playerKlassierung').value, 10);

    if (!name) {
        alert('Bitte einen Namen eingeben.');
        return;
    }

    if (isNaN(klassierung) || klassierung < 1 || klassierung > 21) {
        alert('Klassierung muss zwischen 1 und 21 liegen.');
        return;
    }

    const duplicate = currentPlayers.findIndex(p => p.name === name);
    if (duplicate !== -1 && duplicate !== editingPlayerIndex) {
        alert(`${name} steht schon in der Liste.`);
        return;
    }

    if (editingPlayerIndex !== null) {
        currentPlayers[editingPlayerIndex] = { name, klassierung };
    } else {
        currentPlayers.push({ name, klassierung });
    }

    applySort();
    renderPlayerList();
    playerModal.hide();
}

function deletePlayer(index) {
    if (confirm(`${currentPlayers[index].name} entfernen?`)) {
        currentPlayers.splice(index, 1);
        renderPlayerList();
    }
}
