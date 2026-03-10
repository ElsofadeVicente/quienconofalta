/* =============================================
   HIGHER-OR-LOWER.JS
   Lógica del juego Higher or Lower
   QUIÉN COÑO FALTA
   ============================================= */

/* ── CONFIGURACIÓN ── */
const HOL_CONFIG = {
  // Modos de juego disponibles
  modes: [
    {
      key:        'top-players',
      folder:     'top-players/',        // Carpeta con un JSON por liga
      files:      ['laliga.json', 'premier-league.json', 'serie-a.json', 'bundesliga.json', 'ligue-1.json'],
      mvMin:      15000000,              // Filtro: solo jugadores con mv >= 15M
      name:       'Top Players',
      emoji:      '⭐',
      desc:       'Los mejores de las 5 grandes ligas',
      multiFile:  true,
    },
    {
      key:        'laliga',
      file:       'laliga.json',
      name:       'La Liga',
      emoji:      '🇪🇸',
      desc:       'Todos los jugadores de La Liga',
      multiFile:  false,
    },
    {
      key:        'premier-league',
      file:       'premier-league.json',
      name:       'Premier League',
      emoji:      '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      desc:       'Todos los jugadores de la Premier',
      multiFile:  false,
    },
    {
      key:        'serie-a',
      file:       'serie-a.json',
      name:       'Serie A',
      emoji:      '🇮🇹',
      desc:       'Todos los jugadores de la Serie A',
      multiFile:  false,
    },
    {
      key:        'bundesliga',
      file:       'bundesliga.json',
      name:       'Bundesliga',
      emoji:      '🇩🇪',
      desc:       'Todos los jugadores de la Bundesliga',
      multiFile:  false,
    },
    {
      key:        'ligue-1',
      file:       'ligue-1.json',
      name:       'Ligue 1',
      emoji:      '🇫🇷',
      desc:       'Todos los jugadores de la Ligue 1',
      multiFile:  false,
    },
  ],

  dataPath: '../data/higher-or-lower/',

  // Récord por modo: se guarda como 'hol_record_<modeKey>'
  storageKeyPrefix: 'hol_record_',

  // Categorías de comparación (preparado para expandir)
  categories: {
    mv: {
      label: 'VALOR DE MERCADO',
      format: (v) => {
        if (v == null) return '?';
        if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')} mill. €`;
        if (v >= 1000) return `${(v / 1000).toFixed(0)} mil €`;
        return `${v} €`;
      },
      field: 'mv',
    },
    /* ── Categorías futuras (descomentar cuando quieras añadir) ──
    h: {
      label: 'ALTURA',
      format: (v) => v ? `${v} cm` : '?',
      field: 'h',
    },
    apps: {
      label: 'PARTIDOS EN CARRERA',
      format: (v) => v != null ? v.toLocaleString('es-ES') : '?',
      field: 'apps',
    },
    goals: {
      label: 'GOLES EN CARRERA',
      format: (v) => v != null ? v.toLocaleString('es-ES') : '?',
      field: 'goals',
    },
    */
  },
};

/* ── ESTADO DEL JUEGO ── */
const HOL = {
  pool: [],           // Array de jugadores [{id, ...data}]
  usedIds: new Set(), // IDs ya usados en esta partida
  leftPlayer: null,
  rightPlayer: null,
  score: 0,
  record: 0,
  currentCategory: 'mv',
  currentMode: null,  // clave del modo activo
  isAnimating: false,
  gameOver: false,
};

/* ── ELEMENTOS DOM ── */
let DOM = {};

function cacheDom() {
  DOM = {
    loading:        document.getElementById('hol-loading'),
    game:           document.getElementById('hol-game'),
    modeMenu:       document.getElementById('hol-mode-menu'),
    modeGrid:       document.getElementById('hol-mode-grid'),
    modeName:       document.getElementById('hol-mode-name'),
    scoreValue:     document.getElementById('hol-score-value'),
    recordValue:    document.getElementById('hol-record-value'),
    // Left panel
    leftBg:         document.getElementById('hol-left-bg'),
    leftName:       document.getElementById('hol-left-name'),
    leftClub:       document.getElementById('hol-left-club'),
    leftStatLabel:  document.getElementById('hol-left-stat-label'),
    leftStatValue:  document.getElementById('hol-left-stat-value'),
    leftPanel:      document.getElementById('hol-left-panel'),
    // Right panel
    rightBg:        document.getElementById('hol-right-bg'),
    rightName:      document.getElementById('hol-right-name'),
    rightClub:      document.getElementById('hol-right-club'),
    rightPanel:     document.getElementById('hol-right-panel'),
    rightStatLabel: document.getElementById('hol-right-stat-label'),
    rightStatValue: document.getElementById('hol-right-stat-value'),
    rightReveal:    document.getElementById('hol-right-reveal'),
    // Choices
    btnHigher:      document.getElementById('hol-btn-higher'),
    btnEqual:       document.getElementById('hol-btn-equal'),
    btnLower:       document.getElementById('hol-btn-lower'),
    choices:        document.getElementById('hol-choices'),
    // Game over
    gameoverScreen: document.getElementById('hol-gameover'),
    goScore:        document.getElementById('hol-go-score'),
    goRecord:       document.getElementById('hol-go-record'),
    playAgainBtn:   document.getElementById('hol-play-again'),
    changeModeBtn:  document.getElementById('hol-change-mode'),
  };
}

/* ── MENÚ DE MODOS ── */

function buildModeMenu() {
  DOM.modeGrid.innerHTML = '';
  for (const mode of HOL_CONFIG.modes) {
    const record = parseInt(localStorage.getItem(HOL_CONFIG.storageKeyPrefix + mode.key) || '0', 10);
    const card = document.createElement('button');
    card.className = 'hol-mode-card';
    card.dataset.modeKey = mode.key;
    card.innerHTML = `
      <span class="hol-mode-emoji">${mode.emoji}</span>
      <span class="hol-mode-title">${mode.name}</span>
      <span class="hol-mode-desc">${mode.desc}</span>
      <span class="hol-mode-record">🏆 ${record}</span>
    `;
    card.addEventListener('click', () => selectMode(mode.key));
    DOM.modeGrid.appendChild(card);
  }
}

function showModeMenu() {
  buildModeMenu();
  DOM.modeMenu.classList.add('active');
}

function hideModeMenu() {
  DOM.modeMenu.classList.remove('active');
}

async function selectMode(modeKey) {
  hideModeMenu();
  HOL.currentMode = modeKey;

  const mode = HOL_CONFIG.modes.find(m => m.key === modeKey);

  // Mostrar loading
  DOM.loading.classList.remove('hidden');

  // Cargar datos del modo
  const rawData = await loadModeData(mode);

  // Filtrar jugadores válidos
  HOL.pool = Object.entries(rawData)
    .filter(([, p]) => p.mv != null && p.n)
    .map(([id, p]) => ({ id, ...p }));

  console.log(`🎮 [HOL] Modo "${mode.name}" — Pool: ${HOL.pool.length} jugadores`);

  if (HOL.pool.length < 2) {
    alert(`No hay suficientes jugadores para el modo "${mode.name}". Revisa los datos en data/higher-or-lower/`);
    DOM.loading.classList.add('hidden');
    showModeMenu();
    return;
  }

  // Cargar récord del modo
  HOL.record = parseInt(localStorage.getItem(HOL_CONFIG.storageKeyPrefix + modeKey) || '0', 10);
  DOM.recordValue.textContent = HOL.record;

  // Nombre del modo en topbar
  if (DOM.modeName) DOM.modeName.textContent = mode.name.toUpperCase();

  // Ocultar loading, iniciar partida
  DOM.loading.classList.add('hidden');
  startNewGame();
}

/* ── CARGA DE DATOS ── */

async function loadModeData(mode) {
  if (mode.multiFile) {
    // Modo con múltiples archivos en una subcarpeta (ej: top-players/)
    const allPlayers = {};
    let loaded = 0;
    for (const file of mode.files) {
      try {
        const url = `${HOL_CONFIG.dataPath}${mode.folder}${file}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        for (const [id, player] of Object.entries(data)) {
          // Aplicar filtro de mv mínimo si está definido
          if (mode.mvMin == null || (player.mv != null && player.mv >= mode.mvMin)) {
            allPlayers[id] = player;
          }
        }
        loaded++;
        console.log(`✅ [HOL] ${mode.name}/${file} cargado`);
      } catch (e) {
        console.warn(`⚠️ [HOL] No se pudo cargar ${mode.folder}${file}:`, e.message);
      }
    }
    if (loaded === 0) {
      console.error('❌ [HOL] Ningún archivo cargado. Revisa la ruta y el formato del JSON.');
      return {};
    }
    console.log(`🎮 [HOL] ${mode.name}: ${Object.keys(allPlayers).length} jugadores (mv >= ${(mode.mvMin/1e6).toFixed(0)}M)`);
    return allPlayers;
  }

  // Modo con un único archivo
  try {
    const url = `${HOL_CONFIG.dataPath}${mode.file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`✅ [HOL] ${mode.name}: ${Object.keys(data).length} jugadores`);
    return data;
  } catch (e) {
    console.error(`❌ [HOL] No se pudo cargar ${mode.file}:`, e.message);
    return {};
  }
}


/* ── INICIALIZACIÓN ── */
async function initGame() {
  cacheDom();

  // Setup botones
  DOM.btnHigher.addEventListener('click', () => handleChoice('higher'));
  DOM.btnEqual.addEventListener('click',  () => handleChoice('equal'));
  DOM.btnLower.addEventListener('click',  () => handleChoice('lower'));
  DOM.playAgainBtn.addEventListener('click', restartGame);
  if (DOM.changeModeBtn) DOM.changeModeBtn.addEventListener('click', () => {
    DOM.gameoverScreen.classList.remove('active');
    showModeMenu();
  });

  // Ocultar loading y mostrar menú de modos
  DOM.loading.classList.add('hidden');
  showModeMenu();
}

/* ── LÓGICA DEL JUEGO ── */

function startNewGame() {
  HOL.score = 0;
  HOL.usedIds.clear();
  HOL.gameOver = false;
  HOL.isAnimating = false;

  DOM.scoreValue.textContent = '0';
  DOM.gameoverScreen.classList.remove('active');

  HOL.currentCategory = 'mv';

  HOL.leftPlayer  = pickRandomPlayer(null);
  HOL.rightPlayer = pickRandomPlayer(HOL.leftPlayer);

  renderLeft();
  renderRight();
  enableChoices();
}

function restartGame() {
  startNewGame();
}

/** Escoge un jugador usando probabilidad ponderada para aumentar dificultad.
 *
 *  Cuando hay un jugador de referencia (el actual lado izquierdo), el siguiente
 *  se elige según estas probabilidades:
 *    15% → candidatos dentro de ±5 M del valor de referencia
 *    15% → candidatos dentro de ±10 M (incluye los de ±5 M)
 *    15% → candidatos dentro de ±15 M (incluye los de ±10 M)
 *    55% → cualquier jugador del pool (completamente random)
 *
 *  Si un bucket no tiene candidatos disponibles, cae al siguiente más amplio
 *  hasta llegar al pool completo.
 */
function pickRandomPlayer(referencePlayer) {
  // Reset de usedIds si el pool está casi agotado
  if (HOL.usedIds.size >= HOL.pool.length - 2) {
    HOL.usedIds.clear();
    if (HOL.leftPlayer)  HOL.usedIds.add(HOL.leftPlayer.id);
    if (HOL.rightPlayer) HOL.usedIds.add(HOL.rightPlayer.id);
  }

  // Candidatos disponibles (no usados)
  const available = HOL.pool.filter(p => !HOL.usedIds.has(p.id));
  if (available.length === 0) return HOL.pool[0]; // fallback extremo

  // Sin referencia (primera tirada) → completamente random
  if (!referencePlayer || referencePlayer.mv == null) {
    const pick = available[Math.floor(Math.random() * available.length)];
    HOL.usedIds.add(pick.id);
    return pick;
  }

  const refMv = referencePlayer.mv;

  // Bucket de igual valor exacto (para forzar respuesta "IGUAL")
  const bucketEqual = available.filter(p => p.mv != null && p.mv === refMv);

  // Primero: 10% de probabilidad de igual valor (se comprueba antes que el resto)
  if (bucketEqual.length > 0 && Math.random() < 0.10) {
    const pick = bucketEqual[Math.floor(Math.random() * bucketEqual.length)];
    HOL.usedIds.add(pick.id);
    return pick;
  }

  // Construir buckets por cercanía (excluyen el valor exacto para no solapar)
  const bucket5  = available.filter(p => p.mv != null && p.mv !== refMv && Math.abs(p.mv - refMv) <=  5_000_000);
  const bucket10 = available.filter(p => p.mv != null && p.mv !== refMv && Math.abs(p.mv - refMv) <= 10_000_000);
  const bucket15 = available.filter(p => p.mv != null && p.mv !== refMv && Math.abs(p.mv - refMv) <= 15_000_000);

  // Tirar dado para decidir qué bucket usar
  const roll = Math.random(); // [0, 1)

  let pool;
  if (roll < 0.15 && bucket5.length  > 0) {
    pool = bucket5;                          // 15% → ±5 M (sin igual exacto)
  } else if (roll < 0.30 && bucket10.length > 0) {
    pool = bucket10;                         // 15% → ±10 M
  } else if (roll < 0.45 && bucket15.length > 0) {
    pool = bucket15;                         // 15% → ±15 M
  } else {
    pool = available;                        // 55% → cualquiera
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  HOL.usedIds.add(pick.id);
  return pick;
}

/* ── RENDER ── */

function renderLeft() {
  const p = HOL.leftPlayer;
  const cat = HOL_CONFIG.categories[HOL.currentCategory];

  setPlayerBg(DOM.leftBg, p);

  DOM.leftName.textContent = p.n;
  DOM.leftClub.textContent = p.club || (p.teams && p.teams[0]) || '';
  DOM.leftStatLabel.textContent = cat.label;
  DOM.leftStatValue.textContent = cat.format(getStatValue(p));

  DOM.leftPanel.classList.remove('sliding-out', 'sliding-in', 'flash-correct', 'flash-wrong');
}

function renderRight() {
  const p = HOL.rightPlayer;
  const cat = HOL_CONFIG.categories[HOL.currentCategory];

  setPlayerBg(DOM.rightBg, p);

  DOM.rightName.textContent = p.n;
  DOM.rightClub.textContent = p.club || (p.teams && p.teams[0]) || '';

  DOM.rightStatLabel.textContent = cat.label;
  DOM.rightStatValue.textContent = cat.format(getStatValue(p));
  DOM.rightReveal.classList.remove('visible');

  DOM.rightPanel.classList.remove('sliding-out', 'sliding-in', 'flash-correct', 'flash-wrong');
}

function setPlayerBg(bgEl, player) {
  if (player.img) {
    bgEl.style.backgroundImage = `url(${player.img})`;
  } else {
    bgEl.style.backgroundImage = 'linear-gradient(135deg, #1a2a3a 0%, #0f1a28 100%)';
  }
}

function getStatValue(player) {
  const field = HOL_CONFIG.categories[HOL.currentCategory].field;
  const val = player[field];
  if (field === 'h' && val) return parseFloat(val);
  return val != null ? Number(val) : null;
}

/* ── MANEJO DE RESPUESTA ── */

function handleChoice(choice) {
  if (HOL.isAnimating || HOL.gameOver) return;
  HOL.isAnimating = true;

  const leftVal  = getStatValue(HOL.leftPlayer);
  const rightVal = getStatValue(HOL.rightPlayer);

  let correctChoice;
  if (rightVal > leftVal)        correctChoice = 'higher';
  else if (rightVal === leftVal) correctChoice = 'equal';
  else                           correctChoice = 'lower';

  const isCorrect = (choice === correctChoice);

  DOM.rightReveal.classList.add('visible');

  const btnMap = { higher: DOM.btnHigher, equal: DOM.btnEqual, lower: DOM.btnLower };
  disableChoices();
  btnMap[choice].classList.add(isCorrect ? 'correct-pick' : 'wrong-pick');

  DOM.rightPanel.classList.add(isCorrect ? 'flash-correct' : 'flash-wrong');

  if (isCorrect) {
    HOL.score++;
    DOM.scoreValue.textContent = HOL.score;
    setTimeout(() => chainTransition(), 1400);
  } else {
    setTimeout(() => triggerGameOver(), 1600);
  }
}

/** Transición de cadena: derecho → izquierdo, nuevo → derecho */
function chainTransition() {
  // Limpiar el reveal ANTES de animar para que nunca se vea el valor del siguiente
  DOM.rightReveal.classList.remove('visible');
  DOM.rightStatValue.textContent = '';
  DOM.rightStatLabel.textContent = '';

  DOM.leftPanel.classList.add('sliding-out');
  DOM.rightPanel.classList.add('sliding-out');

  setTimeout(() => {
    HOL.leftPlayer  = HOL.rightPlayer;
    HOL.rightPlayer = pickRandomPlayer(HOL.leftPlayer);

    renderLeft();
    renderRight();
    enableChoices();

    DOM.leftPanel.classList.add('sliding-in');
    DOM.rightPanel.classList.add('sliding-in');

    HOL.isAnimating = false;
  }, 450);
}

function triggerGameOver() {
  HOL.gameOver = true;
  HOL.isAnimating = false;

  let isNewRecord = false;
  if (HOL.score > HOL.record) {
    HOL.record = HOL.score;
    const key = HOL_CONFIG.storageKeyPrefix + HOL.currentMode;
    localStorage.setItem(key, String(HOL.record));
    isNewRecord = true;
  }
  DOM.recordValue.textContent = HOL.record;

  DOM.goScore.textContent = HOL.score;
  if (isNewRecord) {
    DOM.goRecord.innerHTML = `<span class="new-record">🏆 ¡NUEVO RÉCORD!</span>`;
  } else {
    DOM.goRecord.innerHTML = `Tu récord: <strong>${HOL.record}</strong>`;
  }

  DOM.gameoverScreen.classList.add('active');
}

/* ── UTILIDADES DE BOTONES ── */

function enableChoices() {
  [DOM.btnHigher, DOM.btnEqual, DOM.btnLower].forEach(btn => {
    btn.classList.remove('disabled', 'correct-pick', 'wrong-pick');
    btn.disabled = false;
  });
}

function disableChoices() {
  [DOM.btnHigher, DOM.btnEqual, DOM.btnLower].forEach(btn => {
    btn.classList.add('disabled');
    btn.disabled = true;
  });
}

/* ── ARRANQUE ── */
document.addEventListener('DOMContentLoaded', initGame);
