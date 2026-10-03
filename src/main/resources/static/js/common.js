// Shared by both pages: escaping, safe browser storage, toast messages.

const STORAGE_KEYS = {
    settings: 'trainingsplaner.settings',
    roster: 'trainingsplaner.roster',
    plan: 'trainingsplaner.plan'
};

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
    toastTimer = setTimeout(() => { host.innerHTML = ''; }, action ? 6000 : 3000);
}

// Keep page content clear of the fixed action bar, whatever its current height
function trackActionBar() {
    const bar = document.querySelector('.actionbar');
    if (!bar) return;
    const update = () => document.documentElement.style.setProperty('--actionbar-h', bar.offsetHeight + 'px');
    new ResizeObserver(update).observe(bar);
    update();
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
