// ESTADO DEL JUEGO
let currentMode = null;
let allMatches = [];
let currentMatchIndex = 0;
let currentMatch = null;
let currentPlayerIndex = null;
let revealedPlayers = new Set();
let failedPlayers = new Set(); // Jugadores revelados por agotar intentos
let currentGuess = [];
let playerAttempts = {}; // Contador de intentos por jugador
let playerGuessHistory = {}; // Historial de intentos del wordle por jugador

// Estadísticas
let stats = {
    matchesCompleted: 0,
    playersGuessed: 0,
    totalAttempts: 0,
    currentStreak: 0,
    bestStreak: 0
};

// PROGRESO DE CARGA
function updateLoadingProgress(loaded, total, label) {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    const bar = document.getElementById('loading-bar-fill');
    const status = document.getElementById('loading-status');
    if (bar) bar.style.width = pct + '%';
    if (status) status.textContent = label || `Cargando... ${pct}%`;
}

// Fetch individual con control de progreso
async function fetchJSON(url, onDone) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (onDone) onDone();
        return Array.isArray(data) ? data : null;
    } catch {
        return null;
    }
}

// CARGAR DATOS DESDE JSON (en paralelo con progreso)
async function loadMatchData(mode) {
    try {
        let folders = [];
        
        switch(mode) {
            case 'liga':      folders = ['data/liga']; break;
            case 'champions': folders = ['data/champions']; break;
            case 'historico': folders = ['data/historico']; break;
            case 'random':    folders = ['data/liga', 'data/champions', 'data/historico']; break;
        }
        
        // ── FASE 1: Recolectar todas las URLs a cargar ──────────────────
        updateLoadingProgress(0, 1, 'Leyendo índice de partidos...');
        
        const urlsToFetch = [];

        for (const folder of folders) {
            try {
                const manifestRes = await fetch(`${folder}/manifest.json`);
                
                if (manifestRes.ok) {
                    const manifest = await manifestRes.json();
                    
                    if (manifest.folders && Array.isArray(manifest.folders)) {
                        for (const subfolder of manifest.folders) {
                            const subfolderPath = `${folder}/${subfolder}`;
                            try {
                                const subManifestRes = await fetch(`${subfolderPath}/manifest.json`);
                                if (subManifestRes.ok) {
                                    const subManifest = await subManifestRes.json();
                                    if (subManifest.files && Array.isArray(subManifest.files)) {
                                        subManifest.files.forEach(f => urlsToFetch.push(`${subfolderPath}/${f}`));
                                    }
                                } else {
                                    const commonJsonFiles = [
                                        'partido1.json','partido2.json','partido3.json','partido4.json',
                                        'partido5.json','partido6.json','partido7.json','partido8.json',
                                        'partido9.json','partido10.json','partido11.json','partido12.json',
                                        'partido13.json','partido14.json','partido15.json','partido16.json',
                                        'partido17.json','partido18.json','partido19.json','partido20.json',
                                        'partidos.json','data.json','matches.json',
                                        `${subfolder}_2014-15.json`,`${subfolder}_2015-16.json`,`${subfolder}_2016-17.json`,
                                        `${subfolder}_2017-18.json`,`${subfolder}_2018-19.json`,`${subfolder}_2019-20.json`,
                                        `${subfolder}_2020-21.json`,`${subfolder}_2021-22.json`,`${subfolder}_2022-23.json`,
                                        `${subfolder}_2023-24.json`,`${subfolder}_2024-25.json`
                                    ];
                                    commonJsonFiles.forEach(f => urlsToFetch.push(`${subfolderPath}/${f}`));
                                }
                            } catch { /* ignorar */ }
                        }
                    } else if (manifest.files && Array.isArray(manifest.files)) {
                        manifest.files.forEach(f => urlsToFetch.push(`${folder}/${f}`));
                    }
                } else {
                    // Sin manifest: cargar archivos conocidos directamente
                    const commonFiles = [
                        'ALAVES.json','ALMERIA.json','ATHLETIC_CLUB.json','ATLETICO_MADRID.json',
                        'BARCELONA.json','CADIZ.json','CELTA_VIGO.json','CORDOBA.json',
                        'DEPORTIVO_LA_CORUNA.json','EIBAR.json','ELCHE.json','ESPANYOL.json',
                        'GETAFE.json','GIRONA.json','GRANADA.json','LAS_PALMAS.json',
                        'LEGANES.json','LEVANTE.json','MALAGA.json','MALLORCA.json',
                        'OSASUNA.json','RAYO_VALLECANO.json','REAL_BETIS.json','REAL_MADRID.json',
                        'REAL_SOCIEDAD.json','REAL_VALLADOLID.json','SD_HUESCA.json','SEVILLA.json',
                        'SPORTING_GIJON.json','VALENCIA.json','VILLARREAL.json',
                        'barcelona.json','real-madrid.json','atletico.json','sevilla.json',
                        'valencia.json','athletic.json','real-sociedad.json','betis.json',
                        'villarreal.json','celta.json','espanyol.json','getafe.json',
                        'finales.json','semifinales.json','remontadas.json','clasicos.json',
                        'mundiales.json','eurocopas.json','olimpiadas.json'
                    ];
                    commonFiles.forEach(f => urlsToFetch.push(`${folder}/${f}`));
                }
            } catch (err) {
                console.warn(`Error procesando carpeta ${folder}:`, err);
            }
        }

        // ── FASE 2: Descargar TODO en paralelo con progreso ─────────────
        const total = urlsToFetch.length;
        let loaded = 0;

        updateLoadingProgress(0, total, `0 / ${total} archivos cargados`);

        const onFileDone = () => {
            loaded++;
            updateLoadingProgress(loaded, total, `${loaded} / ${total} archivos cargados`);
        };

        const results = await Promise.all(
            urlsToFetch.map(url => fetchJSON(url, onFileDone))
        );

        // ── FASE 3: Juntar y mezclar ────────────────────────────────────
        const allLoadedMatches = results
            .filter(Boolean)
            .flat();
        
        if (allLoadedMatches.length === 0) {
            throw new Error('No se encontraron partidos en las carpetas especificadas');
        }
        
        allMatches = shuffleArray(allLoadedMatches);
        updateLoadingProgress(total, total, `¡${allMatches.length} partidos listos!`);
        
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
    document.getElementById('mode-selection').style.display = 'none';
    // Resetear barra antes de mostrar
    const bar = document.getElementById('loading-bar-fill');
    const status = document.getElementById('loading-status');
    if (bar) bar.style.width = '0%';
    if (status) status.textContent = 'Preparando datos...';
    document.getElementById('loading').style.display = 'flex';
    
    // Cargar datos desde JSON
    const loaded = await loadMatchData(mode);
    
    if (!loaded || allMatches.length === 0) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('mode-selection').style.display = 'flex';
        return;
    }
    
    currentMatchIndex = 0;
    // Pequeña pausa para que el usuario vea el 100%
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('loading').style.display = 'none';
    loadMatch();
}

function loadMatch() {
    if (currentMatchIndex >= allMatches.length) {
        alert('¡Has completado todos los partidos de este modo!');
        returnHome();
        return;
    }
    
    currentMatch = allMatches[currentMatchIndex];
    revealedPlayers = new Set();
    failedPlayers = new Set();
    playerAttempts = {};
    playerGuessHistory = {};
    
    // Mostrar información del partido
    document.getElementById('competition').textContent = currentMatch.competition;
    document.getElementById('home-team').textContent = currentMatch.homeTeam;
    document.getElementById('away-team').textContent = currentMatch.awayTeam;
    document.getElementById('score').textContent = currentMatch.score;
    document.getElementById('date').textContent = currentMatch.date;
    document.getElementById('playing-team').textContent = `ALINEACIÓN: ${currentMatch.playingTeam}`;
    
    // Actualizar badges si existen en el JSON
    if (currentMatch.homeBadge) {
        document.getElementById('home-badge').textContent = currentMatch.homeBadge;
    }
    if (currentMatch.awayBadge) {
        document.getElementById('away-badge').textContent = currentMatch.awayBadge;
    }
    
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
            
            // Player card container
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            if (isRevealed) {
                playerCard.classList.add('revealed');
            }
            
            // Jersey
            const jersey = document.createElement('div');
            jersey.className = `jersey ${player.position === 'GK' ? 'goalkeeper' : ''}`;
            jersey.textContent = player.number || '';
            jersey.onclick = () => openGuessModal(globalIndex);
            
            // Nombre del jugador
            const nameContainer = document.createElement('div');
            nameContainer.className = 'player-name-container';
            
            if (isRevealed) {
                // Mostrar nombre revelado (completo)
                const revealedName = document.createElement('div');
                revealedName.className = 'revealed-name';
                
                // Si fue revelado por fallo, aplicar clase especial para color rojo
                if (failedPlayers.has(globalIndex)) {
                    revealedName.classList.add('failed-reveal');
                }
                
                revealedName.textContent = getKnownName(player.name);
                nameContainer.appendChild(revealedName);
            } else {
                // Crear guiones negros individuales (usando solo apellido/nombre conocido)
                const displayName = getKnownName(player.name);
                for (let i = 0; i < displayName.length; i++) {
                    const char = displayName[i];
                    const slot = document.createElement('div');
                    
                    if (char === ' ') {
                        slot.className = 'name-slot space';
                    } else {
                        slot.className = 'name-slot';
                    }
                    
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
    // Si el jugador fue revelado correctamente (adivinado), no abrir modal
    if (revealedPlayers.has(playerIndex) && !failedPlayers.has(playerIndex)) return;
    
    currentPlayerIndex = playerIndex;
    currentGuess = [];
    
    // Determinar si es modo solo lectura (jugador fallido revelado)
    const isReadOnly = failedPlayers.has(playerIndex);
    
    // Inicializar contador de intentos si no existe
    if (!playerAttempts[playerIndex]) {
        playerAttempts[playerIndex] = 0;
    }
    
    // Inicializar historial si no existe
    if (!playerGuessHistory[playerIndex]) {
        playerGuessHistory[playerIndex] = [];
    }
    
    const player = getPlayerByIndex(playerIndex);
    const knownName = getKnownName(player.name).toUpperCase(); // Solo apellido/nombre conocido
    const originalName = knownName; // Usar nombre conocido en lugar del completo
    const cleanName = knownName; // Ya está limpio, sin necesidad de removeAbbreviations
    const normalizedName = normalizeText(knownName); // Sin tildes
    
    // Crear grid de letras (usando solo apellido/nombre conocido)
    const guessGrid = document.getElementById('guess-grid');
    guessGrid.innerHTML = '';
    
    for (let i = 0; i < 6; i++) {
        const row = document.createElement('div');
        row.className = 'guess-row';
        
        let cellIndex = 0;
        for (let j = 0; j < cleanName.length; j++) {
            const cell = document.createElement('div');
            const char = cleanName[j];
            
            if (char === ' ') {
                // Espacio real, no una casilla
                cell.className = 'wordle-space';
            } else if (char === "'" || char === '-' || char === '·' || char === '.') {
                // Crear celda de carácter especial (apóstrofe, guion, etc.)
                // Visible pero no editable
                cell.className = 'letter-cell special-char-cell';
                cell.textContent = char;
                cell.id = `cell-${i}-${j}-special`;
            } else {
                // Crear celda normal (letra a adivinar)
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
        
        // Rellenar las celdas con las letras (sin contar espacios ni caracteres especiales)
        let letterIndex = 0;
        for (let j = 0; j < cleanName.length; j++) {
            const char = cleanName[j];
            // Saltar espacios y caracteres especiales
            if (char === ' ' || char === "'" || char === '-' || char === '·' || char === '.') {
                continue;
            }
            
            const cell = document.getElementById(`cell-${i}-${letterIndex}`);
            if (cell && letterIndex < attempt.guess.length) {
                cell.textContent = attempt.guess[letterIndex];
                cell.classList.add(attempt.status[letterIndex]);
                cell.classList.add('flip');
            }
            letterIndex++;
        }
    }
    
    // Establecer currentRow basado en el historial
    currentRow = history.length;
    
    // Resetear teclado y aplicar estado previo
    resetKeyboard();
    
    // Restaurar estado del teclado
    for (const attempt of history) {
        updateKeyboard(attempt.guess.split(''), attempt.status);
    }
    
    document.getElementById('guess-modal').classList.add('active');
    
    // Si es modo solo lectura (jugador fallido), desactivar teclado y botón revelar
    if (isReadOnly) {
        const modal = document.getElementById('guess-modal');
        modal.classList.add('read-only');
        
        // Desactivar todas las teclas
        document.querySelectorAll('.key').forEach(key => {
            key.disabled = true;
            key.style.opacity = '0.5';
            key.style.cursor = 'not-allowed';
        });
        
        // Ocultar botón de revelar
        document.getElementById('reveal-btn-modal').style.display = 'none';
        
        // Cambiar título del modal
        document.querySelector('.modal-title').textContent = 'INTENTOS REALIZADOS';
    } else {
        // Modo normal, reactivar todo
        const modal = document.getElementById('guess-modal');
        modal.classList.remove('read-only');
        
        document.querySelectorAll('.key').forEach(key => {
            key.disabled = false;
            key.style.opacity = '1';
            key.style.cursor = 'pointer';
        });
        
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

// LÓGICA DEL WORDLE
let currentRow = 0;

// Función para normalizar texto (quitar tildes)
function normalizeText(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

// Función para eliminar abreviaciones del nombre (A., J., etc.)
function removeAbbreviations(name) {
    // Eliminar patrones como "A. ", "J. ", "CH. ", etc.
    // Patrón: una o más letras mayúsculas seguidas de punto y espacio
    return name.replace(/\b[A-Z]{1,2}\.\s+/g, '').trim();
}

// Función para limpiar caracteres no jugables (espacios, apóstrofes, guiones, etc.)
function removeSpecialChars(name) {
    // Eliminar espacios, apóstrofes, guiones y otros caracteres especiales
    return name.replace(/[\s'\-·.]/g, '');
}

// Función para obtener solo el apellido o nombre conocido del jugador
function getKnownName(fullName) {
    // Primero eliminar abreviaciones
    let name = removeAbbreviations(fullName);
    
    // EXCEPCIONES ESPECÍFICAS - nombres que deben mostrarse de forma particular
    const exceptions = {
        'JORDI ALBA': 'JORDI ALBA',
        'DANI CARVAJAL': 'CARVAJAL',
        'DANI ALVES': 'ALVES',
        'DANIEL ALVES': 'ALVES',
        'DANIEL CARVAJAL': 'CARVAJAL'
    };
    
    // Comprobar si el nombre está en las excepciones
    if (exceptions[name]) {
        return exceptions[name];
    }
    
    // Dividir el nombre en palabras
    const words = name.split(' ');
    
    // Si solo hay una palabra, devolverla
    if (words.length === 1) {
        return words[0];
    }
    
    // Lista de jugadores conocidos por un solo nombre (monónimos)
    // Estos se devuelven completos si coinciden con la primera palabra
    const monoNames = [
        'NEYMAR', 'RONALDINHO', 'RONALDO', 'RIVALDO', 'CAFU', 'ROBERTO',
        'CASEMIRO', 'FERNANDINHO', 'WILLIAN', 'FRED', 'PAULINHO',
        'HULK', 'OSCAR', 'RAMIRES', 'LUCAS', 'RAFAEL', 'FABINHO',
        'EDERSON', 'ALISSON', 'ADRIANO', 'ROBINHO', 'KAKÁ',
        'THIAGO', 'DIEGO', 'FIRMINO', 'RICHARLISON', 'RAPHINHA',
        'RODRYGO', 'VINÍCIUS', 'MILITÃO', 'MARQUINHOS', 'DANILO',
        'FELIPE', 'RENAN', 'EMERSON', 'ALEX', 'ANDERSON', 'PEPE'
    ];
    
    // Comprobar si es un jugador monónimo (primera palabra en la lista)
    if (monoNames.includes(words[0])) {
        // Si tiene sufijo (JR, SR, etc), ignorarlo y devolver solo el nombre
        return words[0];
    }
    
    // Sufijos que hay que ignorar (no son el nombre conocido)
    const suffixes = ['JR', 'JR.', 'SR', 'SR.', 'II', 'III', 'IV'];
    
    // Si la última palabra es un sufijo, eliminarla
    let cleanWords = [...words];
    if (suffixes.includes(cleanWords[cleanWords.length - 1])) {
        cleanWords.pop();
    }
    
    // Ahora trabajar con las palabras limpias (sin sufijos)
    if (cleanWords.length === 1) {
        return cleanWords[0];
    }
    
    // Partículas que van con el apellido (en mayúsculas como aparecen en los JSON)
    const particles = ['DE', 'VAN', 'DER', 'TER', 'VON', 'DA', 'DI', 'DEL', 'LA', 'LE', 'VAN DER', 'VAN DE', 'DOS', 'DAS'];
    
    // Si hay 2 palabras y la primera es una partícula, devolver ambas
    if (cleanWords.length === 2 && particles.includes(cleanWords[0])) {
        return cleanWords.join(' '); // "DE JONG", "VAN DIJK", etc.
    }
    
    // Si hay 3+ palabras, buscar partículas en las últimas palabras
    if (cleanWords.length >= 3) {
        // Comprobar si las últimas 2 palabras empiezan con partícula
        const lastTwo = cleanWords.slice(-2).join(' ');
        for (const particle of particles) {
            if (lastTwo.startsWith(particle + ' ')) {
                return lastTwo; // "TER STEGEN", "VAN DIJK", etc.
            }
        }
        
        // Comprobar si las últimas 3 palabras contienen partícula
        if (cleanWords.length >= 3) {
            const lastThree = cleanWords.slice(-3).join(' ');
            for (const particle of particles) {
                if (lastThree.includes(' ' + particle + ' ')) {
                    return lastThree; // "VAN DER SAR", etc.
                }
            }
        }
    }
    
    // Por defecto, devolver la última palabra (apellido simple)
    return cleanWords[cleanWords.length - 1];
}

function handleKeyPress(key) {
    // No permitir entrada si el jugador está revelado por fallo (modo solo lectura)
    if (failedPlayers.has(currentPlayerIndex)) {
        return;
    }
    
    const player = getPlayerByIndex(currentPlayerIndex);
    const targetName = normalizeText(removeSpecialChars(getKnownName(player.name)));
    
    if (key === 'Enter') {
        if (currentGuess.length === targetName.length) {
            checkGuess();
        }
        return;
    }
    
    if (key === 'Delete') {
        if (currentGuess.length > 0) {
            currentGuess.pop();
            updateCurrentRow();
        }
        return;
    }
    
    if (currentGuess.length < targetName.length) {
        currentGuess.push(key);
        updateCurrentRow();
    }
}

function updateCurrentRow() {
    const player = getPlayerByIndex(currentPlayerIndex);
    const targetLength = normalizeText(removeSpecialChars(getKnownName(player.name))).length;
    
    for (let i = 0; i < targetLength; i++) {
        const cell = document.getElementById(`cell-${currentRow}-${i}`);
        if (cell) {
            cell.textContent = currentGuess[i] || '';
            // Solo resetear la clase si la celda no tiene estado previo (correct, present, absent, flip)
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
    const player = getPlayerByIndex(currentPlayerIndex);
    const targetName = normalizeText(removeSpecialChars(getKnownName(player.name)));
    const guessWord = currentGuess.join('');
    
    if (guessWord === targetName) {
        // CORRECTO
        // Guardar el intento correcto en el historial
        const correctStatus = new Array(targetName.length).fill('correct');
        if (!playerGuessHistory[currentPlayerIndex]) {
            playerGuessHistory[currentPlayerIndex] = [];
        }
        playerGuessHistory[currentPlayerIndex].push({
            guess: guessWord,
            status: correctStatus
        });
        
        animateCorrectGuess();
        setTimeout(() => {
            revealPlayer(currentPlayerIndex);
            closeGuessModal();
            updateStats(true);
        }, 1500);
        return;
    }
    
    // Marcar letras
    const targetArray = targetName.split('');
    const guessArray = guessWord.split('');
    const letterStatus = new Array(targetName.length).fill('absent');
    const usedTargetIndices = new Set();
    
    // Primero marcar correctas
    for (let i = 0; i < guessArray.length; i++) {
        if (guessArray[i] === targetArray[i]) {
            letterStatus[i] = 'correct';
            usedTargetIndices.add(i);
        }
    }
    
    // Luego marcar presentes
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
    
    // Animar celdas
    for (let i = 0; i < guessArray.length; i++) {
        const cell = document.getElementById(`cell-${currentRow}-${i}`);
        setTimeout(() => {
            cell.classList.add('flip');
            cell.classList.add(letterStatus[i]);
        }, i * 100);
    }
    
    // Actualizar teclado
    setTimeout(() => {
        updateKeyboard(guessArray, letterStatus);
    }, guessArray.length * 100);
    
    // Guardar intento en el historial
    if (!playerGuessHistory[currentPlayerIndex]) {
        playerGuessHistory[currentPlayerIndex] = [];
    }
    playerGuessHistory[currentPlayerIndex].push({
        guess: guessWord,
        status: letterStatus
    });
    
    currentRow++;
    currentGuess = [];
    
    // Incrementar contador de intentos
    if (!playerAttempts[currentPlayerIndex]) {
        playerAttempts[currentPlayerIndex] = 0;
    }
    playerAttempts[currentPlayerIndex]++;
    
    // Si agotó los intentos
    if (currentRow >= 6) {
        setTimeout(() => {
            revealPlayer(currentPlayerIndex, true); // true = revelado por fallo
            closeGuessModal();
            updateStats(false);
        }, 1000);
    }
}

function animateCorrectGuess() {
    const player = getPlayerByIndex(currentPlayerIndex);
    const targetLength = normalizeText(removeSpecialChars(getKnownName(player.name))).length;
    
    for (let i = 0; i < targetLength; i++) {
        const cell = document.getElementById(`cell-${currentRow}-${i}`);
        setTimeout(() => {
            cell.classList.add('flip');
            cell.classList.add('correct');
        }, i * 100);
    }
    
    createConfetti();
}

function updateKeyboard(guessArray, letterStatus) {
    for (let i = 0; i < guessArray.length; i++) {
        const letter = guessArray[i];
        const status = letterStatus[i];
        const key = document.querySelector(`[data-key="${letter}"]`);
        
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
    const keys = document.querySelectorAll('.key');
    keys.forEach(key => {
        key.classList.remove('correct', 'present', 'absent');
    });
    currentRow = 0;
}

function revealPlayer(playerIndex, isFailed = false) {
    revealedPlayers.add(playerIndex);
    
    if (isFailed) {
        // Si fue revelado por fallo, marcarlo y MANTENER el historial
        failedPlayers.add(playerIndex);
    } else {
        // Si fue adivinado correctamente o revelado manualmente, limpiar historial
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
        updateStats(false);
    }
}

function updateRevealedCount() {
    const total = currentMatch.formation.reduce((sum, line) => sum + line.length, 0);
    document.getElementById('revealed-count').textContent = revealedPlayers.size;
}

function closeGuessModal() {
    document.getElementById('guess-modal').classList.remove('active');
    currentPlayerIndex = null;
}

// NAVEGACIÓN
function nextMatch() {
    if (revealedPlayers.size === 11) {
        stats.matchesCompleted++;
        saveStats();
    }
    
    currentMatchIndex++;
    loadMatch();
}

function giveUp() {
    if (confirm('¿Seguro que quieres revelar todos los jugadores?')) {
        const total = currentMatch.formation.reduce((sum, line) => sum + line.length, 0);
        for (let i = 0; i < total; i++) {
            revealedPlayers.add(i);
        }
        renderFormation();
        updateRevealedCount();
        
        stats.currentStreak = 0;
        saveStats();
    }
}

function returnHome() {
    document.getElementById('game').style.display = 'none';
    document.getElementById('mode-selection').style.display = 'flex';
    currentMode = null;
    allMatches = [];
}

// ESTADÍSTICAS
function updateStats(correct) {
    stats.totalAttempts++;
    if (correct) {
        stats.playersGuessed++;
        stats.currentStreak++;
        if (stats.currentStreak > stats.bestStreak) {
            stats.bestStreak = stats.currentStreak;
        }
    } else {
        stats.currentStreak = 0;
    }
    saveStats();
}

function loadStats() {
    const saved = localStorage.getItem('footballStats');
    if (saved) {
        stats = JSON.parse(saved);
    }
    displayStats();
}

function saveStats() {
    localStorage.setItem('footballStats', JSON.stringify(stats));
    displayStats();
}

function displayStats() {
    document.getElementById('stat-matches').textContent = stats.matchesCompleted;
    document.getElementById('stat-players').textContent = stats.playersGuessed;
    
    const successRate = stats.totalAttempts > 0 
        ? Math.round((stats.playersGuessed / stats.totalAttempts) * 100) 
        : 0;
    document.getElementById('stat-success').textContent = successRate + '%';
    
    document.getElementById('stat-streak').textContent = stats.currentStreak;
    document.getElementById('stat-best-streak').textContent = stats.bestStreak;
}

function resetStats() {
    if (confirm('¿Seguro que quieres resetear todas las estadísticas?')) {
        stats = {
            matchesCompleted: 0,
            playersGuessed: 0,
            totalAttempts: 0,
            currentStreak: 0,
            bestStreak: 0
        };
        saveStats();
    }
}

// CONFIGURACIÓN
function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('active');
}

function toggleContrast() {
    document.body.classList.toggle('high-contrast');
    const toggle = document.getElementById('contrast-toggle');
    toggle.classList.toggle('active');
    
    const isActive = toggle.classList.contains('active');
    localStorage.setItem('highContrast', isActive);
}

function loadSettings() {
    const highContrast = localStorage.getItem('highContrast') === 'true';
    if (highContrast) {
        document.body.classList.add('high-contrast');
        document.getElementById('contrast-toggle').classList.add('active');
    }
}

// CONFETI
function createConfetti() {
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.background = ['#4ade80', '#fbbf24', '#4a9eff'][Math.floor(Math.random() * 3)];
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 3000);
        }, i * 30);
    }
}

// EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadSettings();
    
    // Teclado
    document.querySelectorAll('.key').forEach(key => {
        key.addEventListener('click', () => {
            const keyValue = key.getAttribute('data-key');
            handleKeyPress(keyValue);
        });
    });
    
    // Teclado físico
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('guess-modal').classList.contains('active')) return;
        
        if (e.key === 'Enter') {
            handleKeyPress('Enter');
        } else if (e.key === 'Backspace') {
            handleKeyPress('Delete');
        } else if (/^[a-zA-ZñÑ]$/.test(e.key)) {
            handleKeyPress(e.key.toUpperCase());
        }
    });
    
    // Botones
    document.getElementById('next-match-btn').addEventListener('click', nextMatch);
    document.getElementById('give-up-btn').addEventListener('click', giveUp);
    document.getElementById('home-btn').addEventListener('click', returnHome);
    document.getElementById('back-btn').addEventListener('click', closeGuessModal);
    document.getElementById('reveal-btn-modal').addEventListener('click', revealPlayerFromModal);
});
