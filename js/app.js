// =============================================
// APP.JS — Lógica del juego "En el Once"
// La navegación global y stats están en core.js
// =============================================

// ESTADO DEL JUEGO
let currentMode = null;
let allMatches = [];
let currentMatchIndex = 0;
let currentMatch = null;
let currentPlayerIndex = null;
let revealedPlayers = new Set();
let failedPlayers = new Set();
let currentGuess = [];
let playerAttempts = {};
let playerGuessHistory = {};

let matchStats = {
    guessed: 0,
    failed: 0,
    revealed: 0
};

// CARGA DE DATOS
function updateLoadingProgress(loaded, total) {
    const pct = total === 0 ? 0 : Math.round((loaded / total) * 100);
    const fill = document.getElementById('loading-bar-fill');
    const ball = document.getElementById('loading-ball');
    const pctEl = document.getElementById('loading-percent');
    if (fill) fill.style.width = pct + '%';
    if (ball) ball.style.left = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
}

async function loadMatchData(mode) {
    try {
        let folders = [];
        switch(mode) {
            case 'diario':
            case 'random':    folders = ['data/liga', 'data/champions', 'data/historico']; break;
            case 'liga':      folders = ['data/liga'];      break;
            case 'champions': folders = ['data/champions']; break;
            case 'historico': folders = ['data/historico']; break;
        }

        const knownFiles = {
            'data/liga': [
                'ALAVES.json','ALMERIA.json','ATHLETIC_CLUB.json','ATLETICO_MADRID.json',
                'BARCELONA.json','CADIZ.json','CELTA_VIGO.json','CORDOBA.json',
                'DEPORTIVO_LA_CORUNA.json','EIBAR.json','ELCHE.json','ESPANYOL.json',
                'GETAFE.json','GIRONA.json','GRANADA.json','LAS_PALMAS.json',
                'LEGANES.json','LEVANTE.json','MALAGA.json','MALLORCA.json',
                'OSASUNA.json','RAYO_VALLECANO.json','REAL_BETIS.json','REAL_MADRID.json',
                'REAL_SOCIEDAD.json','REAL_VALLADOLID.json','SD_HUESCA.json','SEVILLA.json',
                'SPORTING_GIJON.json','VALENCIA.json','VILLARREAL.json'
            ],
            'data/champions': ['finales.json','semifinales.json','remontadas.json','clasicos.json'],
            'data/historico': ['mundiales.json','eurocopas.json','olimpiadas.json']
        };

        const allUrls = [];
        for (const folder of folders) {
            const files = knownFiles[folder] || [];
            for (const file of files) {
                allUrls.push(`${folder}/${file}`);
            }
        }

        // Intentar manifest.json por si existe
        const manifestUrls = folders.map(f => ({ folder: f, url: `${f}/manifest.json` }));
        const manifests = await Promise.allSettled(
            manifestUrls.map(({ url }) => fetch(url).then(r => r.ok ? r.json() : null))
        );
        const existingUrls = new Set(allUrls);
        manifests.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value?.files) {
                const folder = manifestUrls[i].folder;
                result.value.files.forEach(file => {
                    const url = `${folder}/${file}`;
                    if (!existingUrls.has(url)) {
                        allUrls.push(url);
                        existingUrls.add(url);
                    }
                });
            }
        });

        let loaded = 0;
        const total = allUrls.length;
        updateLoadingProgress(0, total);

        const results = await Promise.allSettled(
            allUrls.map(url =>
                fetch(url)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
                    .finally(() => {
                        loaded++;
                        updateLoadingProgress(loaded, total);
                    })
            )
        );

        const allLoadedMatches = [];
        results.forEach(result => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                allLoadedMatches.push(...result.value);
            }
        });

        if (allLoadedMatches.length === 0) {
            throw new Error('No se encontraron partidos');
        }

        // Modo diario: elegir un partido determinista por fecha
        if (mode === 'diario') {
            const dailyIndex = getDailyMatchIndex(allLoadedMatches.length);
            allMatches = [allLoadedMatches[dailyIndex]];
        } else {
            allMatches = shuffleArray(allLoadedMatches);
        }

        return allMatches.length > 0;

    } catch (error) {
        console.error('Error cargando datos:', error);
        alert('Error al cargar los datos. Asegúrate de que los archivos JSON estén en las carpetas correctas dentro de /data/');
        return false;
    }
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// INICIAR JUEGO
async function startGame(mode) {
    currentMode = mode;
    hideAllScreens();
    document.getElementById('loading').style.display = 'block';

    const loaded = await loadMatchData(mode);

    if (!loaded || allMatches.length === 0) {
        document.getElementById('loading').style.display = 'none';
        goToGame('once');
        return;
    }

    currentMatchIndex = 0;
    document.getElementById('loading').style.display = 'none';
    loadMatch();
}

function loadMatch() {
    if (currentMatchIndex >= allMatches.length) {
        alert('¡Has completado todos los partidos de este modo!');
        goToGame('once');
        return;
    }

    currentMatch = allMatches[currentMatchIndex];
    revealedPlayers = new Set();
    failedPlayers = new Set();
    playerAttempts = {};
    playerGuessHistory = {};
    matchStats = { guessed: 0, failed: 0, revealed: 0 };

    document.getElementById('competition').textContent  = currentMatch.competition;
    document.getElementById('home-team').textContent    = currentMatch.homeTeam;
    document.getElementById('away-team').textContent    = currentMatch.awayTeam;
    document.getElementById('score').textContent        = currentMatch.score;
    document.getElementById('date').textContent         = currentMatch.date;
    document.getElementById('playing-team').textContent = `ALINEACIÓN: ${currentMatch.playingTeam}`;

    if (currentMatch.homeBadge) document.getElementById('home-badge').textContent = currentMatch.homeBadge;
    if (currentMatch.awayBadge) document.getElementById('away-badge').textContent = currentMatch.awayBadge;

    renderFormation();
    updateRevealedCount();

    document.getElementById('game').style.display = 'block';
}

function renderFormation() {
    const formationContainer = document.getElementById('formation');
    formationContainer.innerHTML = '';

    const formation = currentMatch.formation;

    formation.forEach((line, lineIndex) => {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'line';

        line.forEach((player, playerIndex) => {
            const globalIndex = formation.slice(0, lineIndex).reduce((sum, l) => sum + l.length, 0) + playerIndex;
            const isRevealed = revealedPlayers.has(globalIndex);

            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            if (isRevealed) playerCard.classList.add('revealed');

            const jersey = document.createElement('div');
            jersey.className = `jersey ${player.position === 'GK' ? 'goalkeeper' : ''}`;
            jersey.textContent = player.number || '';
            jersey.onclick = () => openGuessModal(globalIndex);

            const nameContainer = document.createElement('div');
            nameContainer.className = 'player-name-container';

            if (isRevealed) {
                const revealedName = document.createElement('div');
                revealedName.className = 'revealed-name';
                if (failedPlayers.has(globalIndex)) revealedName.classList.add('failed-reveal');
                revealedName.textContent = getKnownName(player.name);
                nameContainer.appendChild(revealedName);
            } else {
                const displayName = getKnownName(player.name);
                for (let i = 0; i < displayName.length; i++) {
                    const char = displayName[i];
                    const slot = document.createElement('div');
                    slot.className = char === ' ' ? 'name-slot space' : 'name-slot';
                    nameContainer.appendChild(slot);
                }
            }

            playerCard.appendChild(jersey);
            playerCard.appendChild(nameContainer);
            lineDiv.appendChild(playerCard);
        });

        formationContainer.appendChild(lineDiv);
    });
}

function openGuessModal(playerIndex) {
    if (revealedPlayers.has(playerIndex) && !failedPlayers.has(playerIndex)) return;

    currentPlayerIndex = playerIndex;
    currentGuess = [];

    const isReadOnly = failedPlayers.has(playerIndex);

    if (!playerAttempts[playerIndex])     playerAttempts[playerIndex] = 0;
    if (!playerGuessHistory[playerIndex]) playerGuessHistory[playerIndex] = [];

    const player    = getPlayerByIndex(playerIndex);
    const knownName = getKnownName(player.name).toUpperCase();
    const cleanName = knownName;

    const guessGrid = document.getElementById('guess-grid');
    guessGrid.innerHTML = '';

    for (let i = 0; i < 6; i++) {
        const row = document.createElement('div');
        row.className = 'guess-row';

        let cellIndex = 0;
        for (let j = 0; j < cleanName.length; j++) {
            const char = cleanName[j];
            const cell = document.createElement('div');

            if (char === ' ') {
                cell.className = 'wordle-space';
            } else if (char === "'" || char === '-' || char === '·' || char === '.') {
                cell.className = 'letter-cell special-char-cell';
                cell.textContent = char;
                cell.id = `cell-${i}-${j}-special`;
            } else {
                cell.className = 'letter-cell';
                cell.id = `cell-${i}-${cellIndex}`;
                cellIndex++;
            }

            row.appendChild(cell);
        }
        guessGrid.appendChild(row);
    }

    // Restaurar intentos previos
    const history = playerGuessHistory[playerIndex];
    for (let i = 0; i < history.length; i++) {
        const attempt = history[i];
        let letterIndex = 0;
        for (let j = 0; j < cleanName.length; j++) {
            const char = cleanName[j];
            if (char === ' ' || char === "'" || char === '-' || char === '·' || char === '.') continue;
            const cell = document.getElementById(`cell-${i}-${letterIndex}`);
            if (cell && letterIndex < attempt.guess.length) {
                cell.textContent = attempt.guess[letterIndex];
                cell.classList.add(attempt.status[letterIndex]);
                cell.classList.add('flip');
            }
            letterIndex++;
        }
    }

    resetKeyboard();
    currentRow = history.length;

    for (const attempt of history) {
        updateKeyboard(attempt.guess.split(''), attempt.status);
    }

    document.getElementById('guess-modal').classList.add('active');

    if (isReadOnly) {
        document.getElementById('guess-modal').classList.add('read-only');
        document.querySelectorAll('.key').forEach(k => { k.disabled = true; k.style.opacity = '0.5'; k.style.cursor = 'not-allowed'; });
        document.getElementById('reveal-btn-modal').style.display = 'none';
        document.querySelector('.modal-title').textContent = 'INTENTOS REALIZADOS';
    } else {
        document.getElementById('guess-modal').classList.remove('read-only');
        document.querySelectorAll('.key').forEach(k => { k.disabled = false; k.style.opacity = '1'; k.style.cursor = 'pointer'; });
        document.getElementById('reveal-btn-modal').style.display = 'block';
        document.querySelector('.modal-title').textContent = 'ADIVINA EL JUGADOR';
    }
}

function getPlayerByIndex(index) {
    let count = 0;
    for (const line of currentMatch.formation) {
        for (const player of line) {
            if (count === index) return player;
            count++;
        }
    }
    return null;
}

// WORDLE
let currentRow = 0;

function normalizeText(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function removeAbbreviations(name) {
    return name.replace(/\b[A-Z]{1,2}\.\s+/g, '').trim();
}

function removeSpecialChars(name) {
    return name.replace(/[\s'\-·.]/g, '');
}

function getKnownName(fullName) {
    let name = removeAbbreviations(fullName);

    const exceptions = {
        'JORDI ALBA': 'JORDI ALBA',
        'DANI CARVAJAL': 'CARVAJAL',
        'DANI ALVES': 'ALVES',
        'DANIEL ALVES': 'ALVES',
        'DANIEL CARVAJAL': 'CARVAJAL',
        'DIEGO COSTA': 'DIEGO COSTA',
        'WISSAM BEN YEDDER': 'BEN YEDDER',
        'MUNIR EL HADDADI': 'MUNIR',
        'MOI GOMEZ': 'MOI GOMEZ',
        'CUCHO HERNANDEZ': 'CUCHO',
        'CUCHO HERNÁNDEZ': 'CUCHO'
    };

    if (exceptions[name]) return exceptions[name];

    const words = name.split(' ');
    if (words.length === 1) return words[0];

    const monoNames = [
        'NEYMAR','RONALDINHO','RONALDO','RIVALDO','CAFU','ROBERTO',
        'CASEMIRO','FERNANDINHO','WILLIAN','FRED','PAULINHO',
        'HULK','OSCAR','RAMIRES','LUCAS','RAFAEL','FABINHO',
        'EDERSON','ALISSON','ADRIANO','ROBINHO','KAKÁ',
        'THIAGO','FIRMINO','RICHARLISON','RAPHINHA',
        'RODRYGO','VINÍCIUS','MILITÃO','MARQUINHOS','DANILO',
        'FELIPE','RENAN','EMERSON','ALEX','ANDERSON','PEPE'
    ];

    if (monoNames.includes(words[0])) return words[0];

    const suffixes = ['JR','JR.','SR','SR.','II','III','IV'];
    let cleanWords = [...words];
    if (suffixes.includes(cleanWords[cleanWords.length - 1])) cleanWords.pop();
    if (cleanWords.length === 1) return cleanWords[0];

    const particles = ['DE','VAN','DER','TER','VON','DA','DI','DEL','LA','LE','VAN DER','VAN DE','DOS','DAS','SAN'];

    if (cleanWords.length === 2 && particles.includes(cleanWords[0])) {
        return cleanWords.join(' ');
    }

    if (cleanWords.length >= 3) {
        const lastTwo = cleanWords.slice(-2).join(' ');
        for (const particle of particles) {
            if (lastTwo.startsWith(particle + ' ')) return lastTwo;
        }
        if (cleanWords.length >= 3) {
            const lastThree = cleanWords.slice(-3).join(' ');
            for (const particle of particles) {
                if (lastThree.includes(' ' + particle + ' ')) return lastThree;
            }
        }
    }

    return cleanWords[cleanWords.length - 1];
}

function handleKeyPress(key) {
    if (failedPlayers.has(currentPlayerIndex)) return;

    const player     = getPlayerByIndex(currentPlayerIndex);
    const targetName = normalizeText(removeSpecialChars(getKnownName(player.name)));

    if (key === 'Enter') {
        if (currentGuess.length === targetName.length) checkGuess();
        return;
    }
    if (key === 'Delete') {
        if (currentGuess.length > 0) { currentGuess.pop(); updateCurrentRow(); }
        return;
    }
    if (currentGuess.length < targetName.length) {
        currentGuess.push(key);
        updateCurrentRow();
    }
}

function updateCurrentRow() {
    const player      = getPlayerByIndex(currentPlayerIndex);
    const targetLength = normalizeText(removeSpecialChars(getKnownName(player.name))).length;

    for (let i = 0; i < targetLength; i++) {
        const cell = document.getElementById(`cell-${currentRow}-${i}`);
        if (cell) {
            cell.textContent = currentGuess[i] || '';
            if (!cell.classList.contains('correct') &&
                !cell.classList.contains('present') &&
                !cell.classList.contains('absent') &&
                !cell.classList.contains('flip')) {
                cell.className = 'letter-cell';
            }
        }
    }
}

function checkGuess() {
    const player     = getPlayerByIndex(currentPlayerIndex);
    const targetName = normalizeText(removeSpecialChars(getKnownName(player.name)));
    const guessWord  = currentGuess.join('');

    if (guessWord === targetName) {
        const correctStatus = new Array(targetName.length).fill('correct');
        if (!playerGuessHistory[currentPlayerIndex]) playerGuessHistory[currentPlayerIndex] = [];
        playerGuessHistory[currentPlayerIndex].push({ guess: guessWord, status: correctStatus });

        animateCorrectGuess();
        setTimeout(() => {
            revealPlayer(currentPlayerIndex);
            closeGuessModal();
            updateStats('correct');
        }, 1500);
        return;
    }

    const targetArray  = targetName.split('');
    const guessArray   = guessWord.split('');
    const letterStatus = new Array(targetName.length).fill('absent');
    const usedTargetIndices = new Set();

    for (let i = 0; i < guessArray.length; i++) {
        if (guessArray[i] === targetArray[i]) {
            letterStatus[i] = 'correct';
            usedTargetIndices.add(i);
        }
    }
    for (let i = 0; i < guessArray.length; i++) {
        if (letterStatus[i] === 'correct') continue;
        for (let j = 0; j < targetArray.length; j++) {
            if (usedTargetIndices.has(j)) continue;
            if (guessArray[i] === targetArray[j]) {
                letterStatus[i] = 'present';
                usedTargetIndices.add(j);
                break;
            }
        }
    }

    for (let i = 0; i < guessArray.length; i++) {
        const cell = document.getElementById(`cell-${currentRow}-${i}`);
        setTimeout(() => {
            cell.classList.add('flip');
            cell.classList.add(letterStatus[i]);
        }, i * 100);
    }

    setTimeout(() => { updateKeyboard(guessArray, letterStatus); }, guessArray.length * 100);

    if (!playerGuessHistory[currentPlayerIndex]) playerGuessHistory[currentPlayerIndex] = [];
    playerGuessHistory[currentPlayerIndex].push({ guess: guessWord, status: letterStatus });

    currentRow++;
    currentGuess = [];

    if (!playerAttempts[currentPlayerIndex]) playerAttempts[currentPlayerIndex] = 0;
    playerAttempts[currentPlayerIndex]++;

    if (currentRow >= 6) {
        setTimeout(() => {
            revealPlayer(currentPlayerIndex, true);
            closeGuessModal();
            updateStats('failed');
        }, 1000);
    }
}

function animateCorrectGuess() {
    const player      = getPlayerByIndex(currentPlayerIndex);
    const targetLength = normalizeText(removeSpecialChars(getKnownName(player.name))).length;

    for (let i = 0; i < targetLength; i++) {
        const cell = document.getElementById(`cell-${currentRow}-${i}`);
        setTimeout(() => {
            cell.classList.add('flip');
            cell.classList.add('correct');
        }, i * 100);
    }
}

function updateKeyboard(guessArray, letterStatus) {
    for (let i = 0; i < guessArray.length; i++) {
        const letter = guessArray[i];
        const status = letterStatus[i];
        const key    = document.querySelector(`[data-key="${letter}"]`);
        if (!key) continue;

        if (status === 'correct') {
            key.classList.remove('present', 'absent');
            key.classList.add('correct');
        } else if (status === 'present' && !key.classList.contains('correct')) {
            key.classList.remove('absent');
            key.classList.add('present');
        } else if (status === 'absent' && !key.classList.contains('correct') && !key.classList.contains('present')) {
            key.classList.add('absent');
        }
    }
}

function resetKeyboard() {
    document.querySelectorAll('.key').forEach(key => key.classList.remove('correct', 'present', 'absent'));
    currentRow = 0;
}

function revealPlayer(playerIndex, isFailed = false) {
    revealedPlayers.add(playerIndex);
    if (isFailed) {
        failedPlayers.add(playerIndex);
    } else {
        delete playerGuessHistory[playerIndex];
        delete playerAttempts[playerIndex];
    }
    renderFormation();
    updateRevealedCount();
}

function revealPlayerFromModal() {
    if (currentPlayerIndex !== null) {
        revealPlayer(currentPlayerIndex);
        closeGuessModal();
        updateStats('voluntary');
    }
}

function updateRevealedCount() {
    const total = currentMatch.formation.reduce((sum, line) => sum + line.length, 0);
    document.getElementById('revealed-count').textContent = revealedPlayers.size;
    if (revealedPlayers.size === total) setTimeout(() => showCompletionModal(), 600);
}

function showCompletionModal() {
    document.getElementById('completion-match').textContent =
        `${currentMatch.homeTeam} ${currentMatch.score} ${currentMatch.awayTeam} • ${currentMatch.date}`;

    document.getElementById('comp-guessed').textContent  = matchStats.guessed;
    document.getElementById('comp-failed').textContent   = matchStats.failed;
    document.getElementById('comp-revealed').textContent = matchStats.revealed;

    const streakEl = document.getElementById('comp-streak');
    if (stats.currentStreak >= 3) {
        streakEl.textContent  = `🔥 Racha actual: ${stats.currentStreak}`;
        streakEl.style.display = 'block';
    } else {
        streakEl.style.display = 'none';
    }

    document.querySelector('.completion-title').textContent =
        matchStats.guessed === 11 ? '🏆 ¡ONCE PERFECTO!' : '✅ ALINEACIÓN COMPLETADA';

    document.getElementById('completion-modal').classList.add('active');

    stats.matchesCompleted++;
    saveStats();
}

function closeCompletionModal() {
    document.getElementById('completion-modal').classList.remove('active');
}

function closeGuessModal() {
    document.getElementById('guess-modal').classList.remove('active');
    currentPlayerIndex = null;
}

// NAVEGACIÓN
function nextMatch() {
    document.getElementById('completion-modal').classList.remove('active');
    currentMatchIndex++;
    loadMatch();
}

function giveUp() {
    if (confirm('¿Seguro que quieres revelar todos los jugadores?')) {
        const total = currentMatch.formation.reduce((sum, line) => sum + line.length, 0);
        for (let i = 0; i < total; i++) revealedPlayers.add(i);
        renderFormation();
        updateRevealedCount();
        stats.currentStreak = 0;
        saveStats();
    }
}

// ESTADÍSTICAS DEL ONCE
function updateStats(mode) {
    stats.totalAttempts++;

    if (mode === 'correct') {
        stats.playersGuessed++;
        matchStats.guessed++;
        stats.currentStreak++;
        if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
    } else if (mode === 'failed') {
        matchStats.failed++;
        stats.currentStreak = 0;
    } else if (mode === 'voluntary') {
        matchStats.revealed++;
        stats.totalAttempts--;
    }

    saveStats();
}

// MOBILE
function isMobile() {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) || window.innerWidth <= 600;
}

function focusMobileInput() {
    const mi = document.getElementById('mobile-hidden-input');
    if (mi) mi.focus();
}

// EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    // Input oculto para teclado nativo en móvil
    const mobileInput = document.createElement('input');
    mobileInput.id = 'mobile-hidden-input';
    mobileInput.setAttribute('type', 'text');
    mobileInput.setAttribute('autocomplete', 'off');
    mobileInput.setAttribute('autocorrect', 'off');
    mobileInput.setAttribute('autocapitalize', 'characters');
    mobileInput.setAttribute('spellcheck', 'false');
    mobileInput.style.cssText = `
        position:fixed; top:0; left:0; width:1px; height:1px;
        opacity:0; border:none; outline:none; background:transparent;
        color:transparent; font-size:16px; pointer-events:none; z-index:-1;
    `;
    document.body.appendChild(mobileInput);

    mobileInput.addEventListener('input', () => {
        const val = mobileInput.value;
        if (!val) return;
        for (const ch of val) {
            if (/^[a-zA-ZñÑ]$/.test(ch)) handleKeyPress(ch.toUpperCase());
        }
        mobileInput.value = '';
    });

    mobileInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleKeyPress('Enter'); mobileInput.value = ''; }
        else if (e.key === 'Backspace') { e.preventDefault(); handleKeyPress('Delete'); mobileInput.value = ''; }
    });

    // Teclado custom (escritorio)
    document.querySelectorAll('.key').forEach(key => {
        key.addEventListener('click', () => handleKeyPress(key.getAttribute('data-key')));
    });

    // Teclado físico (escritorio)
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('guess-modal').classList.contains('active')) return;
        if (isMobile()) return;
        if (e.key === 'Enter')          handleKeyPress('Enter');
        else if (e.key === 'Backspace') handleKeyPress('Delete');
        else if (/^[a-zA-ZñÑ]$/.test(e.key)) handleKeyPress(e.key.toUpperCase());
    });

    // Botones del juego
    document.getElementById('next-match-btn').addEventListener('click', nextMatch);
    document.getElementById('give-up-btn').addEventListener('click', giveUp);
    document.getElementById('home-btn').addEventListener('click', () => goToGame('once'));
    document.getElementById('back-btn').addEventListener('click', closeGuessModal);
    document.getElementById('reveal-btn-modal').addEventListener('click', revealPlayerFromModal);
});
