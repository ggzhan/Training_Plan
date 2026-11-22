// Shared by both pages: escaping, safe browser storage, toast messages.

const STORAGE_KEYS = {
    settings: 'trainingsplaner.settings',
    roster: 'trainingsplaner.roster',
    plan: 'trainingsplaner.plan'
};

// Lists and plans saved before the sheet switched to Elo call the value "klassierung"
function withElo(player) {
    const { klassierung, ...rest } = player;
    return { ...rest, elo: player.elo ?? klassierung ?? 0 };
}

// Default for a kid added by hand: the lowest Elo today, since new kids are usually beginners
function defaultElo(players) {
    const values = players.map(p => p.elo).filter(v => v > 0);
    return values.length > 0 ? Math.min(...values) : 700;
}

const ELO_MIN = 1;
const ELO_MAX = 3000;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

// Storage can be blocked (private mode, site data off); callers get null / false
function readStored(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function writeStored(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
}

function removeStored(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        // Nothing to clean up
    }
}

// One message at a time at the bottom, above the action bar. An action (e.g.
// "Rückgängig") keeps it up longer.
let toastTimer = null;
// Toasts get out of the way: short, and gone as soon as the trainer touches the page
function hideToast() {
    const host = document.getElementById('toast');
    if (!host || !host.firstChild) return;
    clearTimeout(toastTimer);
    const box = host.firstChild;
    if (typeof Motion !== 'undefined') Motion.toastOut(box, () => box.remove());
    else host.innerHTML = '';
}

document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('#toast')) hideToast();
}, true);

function toast(message, action) {
    const host = document.getElementById('toast');
    if (!host) return;
    clearTimeout(toastTimer);
    host.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'toast-msg';
    const text = document.createElement('span');
    text.textContent = message;
    box.appendChild(text);
    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-quiet';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            host.innerHTML = '';
            action.run();
        });
        box.appendChild(button);
    }
    host.appendChild(box);
    const hasMotion = typeof Motion !== 'undefined';
    if (hasMotion) Motion.toastIn(box);
    toastTimer = setTimeout(() => {
        if (hasMotion) Motion.toastOut(box, () => box.remove());
        else host.innerHTML = '';
    }, action ? 4500 : 2500);
}

// Keep page content clear of the fixed action bar, whatever its current height
function trackActionBar() {
    const bar = document.querySelector('.actionbar');
    if (!bar) return;
    const update = () => document.documentElement.style.setProperty('--actionbar-h', bar.offsetHeight + 'px');
    new ResizeObserver(update).observe(bar);
    update();
}

// What to tell the trainer when a request fails: no network, or the server's own message
function friendlyError(error) {
    if (error instanceof TypeError) return 'Keine Verbindung zum Server. Netz prüfen und nochmals versuchen.';
    return (error && error.message) || 'Bitte nochmals versuchen.';
}

// Server errors come back as {error: "..."}; anything else gets a generic message
async function readJsonResponse(response) {
    let data = null;
    try {
        data = await response.json();
    } catch (e) {
        // Not JSON
    }
    if (!response.ok) {
        throw new Error((data && data.error) || 'Der Server hat nicht geantwortet. Bitte nochmals versuchen.');
    }
    return data;
}

document.addEventListener('DOMContentLoaded', trackActionBar);
