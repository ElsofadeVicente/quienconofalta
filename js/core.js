/* =============================================
   CORE.JS — Navegación global de la plataforma
   QUIÉN COÑO FALTA
   ============================================= */

// ── NAVEGACIÓN ──────────────────────────────

function hideAllScreens() {
    document.getElementById('hub').style.display               = 'none';
    document.getElementById('once-menu').style.display         = 'none';
    document.getElementById('loading').style.display           = 'none';
    document.getElementById('game').style.display              = 'none';
    document.getElementById('crucigrama-screen').style.display = 'none';
}

function goToHub() {
    hideAllScreens();
    document.getElementById('hub').style.display = 'flex';
}

function goToGame(game) {
    hideAllScreens();
    if (game === 'once') {
        document.getElementById('once-menu').style.display = 'flex';
    } else if (game === 'crucigrama') {
        document.getElementById('crucigrama-screen').style.display = 'flex';
    }
    // Futuros juegos se añaden aquí
}

// ── ONCE DIARIO ─────────────────────────────
// Usa la fecha actual como semilla para elegir
// un partido determinista (mismo para todos).

function getDailyMatchIndex(totalMatches) {
    const today = new Date();
    const seed  = today.getFullYear() * 10000
                + (today.getMonth() + 1) * 100
                + today.getDate();

    let hash = seed;
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
    hash = (hash >>> 16) ^ hash;

    return Math.abs(hash) % totalMatches;
}

// ── CONFIGURACIÓN ───────────────────────────

function toggleSettings() {
    document.getElementById('settings-modal').classList.toggle('active');
}

function toggleContrast() {
    document.body.classList.toggle('high-contrast');
    const toggle = document.getElementById('contrast-toggle');
    toggle.classList.toggle('active');
    localStorage.setItem('highContrast', toggle.classList.contains('active'));
}

function loadSettings() {
    if (localStorage.getItem('highContrast') === 'true') {
        document.body.classList.add('high-contrast');
        document.getElementById('contrast-toggle').classList.add('active');
    }
}

// ── ESTADÍSTICAS ────────────────────────────

let stats = {
    matchesCompleted: 0,
    playersGuessed:   0,
    totalAttempts:    0,
    currentStreak:    0,
    bestStreak:       0
};

function loadStats() {
    const saved = localStorage.getItem('footballStats');
    if (saved) stats = JSON.parse(saved);
    displayStats();
}

function saveStats() {
    localStorage.setItem('footballStats', JSON.stringify(stats));
    displayStats();
}

function displayStats() {
    document.getElementById('stat-matches').textContent     = stats.matchesCompleted;
    document.getElementById('stat-players').textContent     = stats.playersGuessed;
    const rate = stats.totalAttempts > 0
        ? Math.round((stats.playersGuessed / stats.totalAttempts) * 100) : 0;
    document.getElementById('stat-success').textContent     = rate + '%';
    document.getElementById('stat-streak').textContent      = stats.currentStreak;
    document.getElementById('stat-best-streak').textContent = stats.bestStreak;
}

function resetStats() {
    if (confirm('¿Seguro que quieres resetear todas las estadísticas?')) {
        stats = {
            matchesCompleted: 0,
            playersGuessed:   0,
            totalAttempts:    0,
            currentStreak:    0,
            bestStreak:       0
        };
        saveStats();
    }
}

// ── INIT ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadSettings();
    goToHub();
});
