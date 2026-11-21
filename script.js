const STORAGE_KEY = 'neurogrid50_save_v1';

const STAGE_TITLES = [
  'Warm-Up Circuit', 'Neural Spark', 'Memory Pulse', 'Twin Synapse', 'Logic Cross',
  'Prism Path', 'Echo Matrix', 'Focus Loop', 'Cipher Grid', 'Quantum Step',
  'Vortex Trace', 'Silent Node', 'Mirror Mind', 'Cobalt Maze', 'Nova Sequence',
  'Zenith Link', 'Binary Drift', 'Pulse Vector', 'Astral Lock', 'Deep Recall',
  'Omega Grid', 'Chrono Path', 'Flux Bridge', 'Nebula Core', 'Apex Focus',
  'Shadow Tile', 'Crystal Line', 'Titan Logic', 'Solaris Web', 'Gravity Shift',
  'Phantom Route', 'Hyper Node', 'Obsidian Key', 'Vertex Surge', 'Enigma Flow',
  'Aether Gate', 'Kinetic Grid', 'Infinity Loop', 'Oracle Mind', 'Fusion Core',
  'Mirage Step', 'Paradox Path', 'Eclipse Lock', 'Zen Master', 'Overdrive',
  'Diamond Grid', 'Cosmic Trace', 'Singularity', 'Grandmaster', 'Ultimate Brain'
];

function generate50Stages() {
  const list = [];
  for (let i = 0; i < 50; i++) {
    const stageNum = i + 1;
    let gridSize = 3;
    if (stageNum >= 8 && stageNum <= 20) gridSize = 4;
    else if (stageNum >= 21 && stageNum <= 36) gridSize = 5;
    else if (stageNum >= 37) gridSize = 6;

    const totalCells = gridSize * gridSize;
    const seqLen = Math.min(totalCells - 2, 3 + Math.floor(i * 0.24));
    const blockedCount = stageNum < 6 ? 0 : Math.min(Math.floor(totalCells * 0.22), 1 + Math.floor((stageNum - 6) / 6));
    const flashMs = Math.max(290, 620 - i * 6);
    const reverseMode = stageNum % 5 === 0;

    list.push({
      stageNum,
      title: STAGE_TITLES[i],
      gridSize,
      seqLen,
      blockedCount,
      flashMs,
      reverseMode,
      maxMistakes: stageNum <= 15 ? 3 : 2
    });
  }
  return list;
}

const STAGES = generate50Stages();
let saveData = loadSave();

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadSave() {
  const today = getTodayStr();
  const defaultState = {
    unlockedStage: 1,
    stars: {},
    streak: 1,
    lastPlayDate: today
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    const data = { ...defaultState, ...parsed };

    if (data.lastPlayDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (data.lastPlayDate === yesterday) {
        data.streak += 1;
      } else {
        data.streak = 1;
      }
      data.lastPlayDate = today;
    }
    return data;
  } catch (e) {
    return defaultState;
  }
}

function persistSave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  } catch (e) {}
}

let audioCtx = null;
let soundEnabled = true;

function playTone(freq, duration = 0.16, type = 'sine', vol = 0.18) {
  if (!soundEnabled) return;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function playWinChime() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
    setTimeout(() => playTone(f, 0.24, 'triangle', 0.2), idx * 90);
  });
}

let currentStageNum = saveData.unlockedStage;
let sequence = [];
let blockedSet = new Set();
let userStep = 0;
let mistakesLeft = 3;
let hintsLeft = 2;
let isShowingPattern = false;
let stageCompleted = false;

const gridContainer = document.getElementById('gridContainer');
const stageLabel = document.getElementById('stageLabel');
const stageSubtitle = document.getElementById('stageSubtitle');
const movesLeftEl = document.getElementById('movesLeft');
const instructionText = document.getElementById('instructionText');
const hintsLeftEl = document.getElementById('hintsLeft');
const streakCountEl = document.getElementById('streakCount');
const totalStarsEl = document.getElementById('totalStars');

const stagesModal = document.getElementById('stagesModal');
const stagesGrid = document.getElementById('stagesGrid');
const continueStageNumEl = document.getElementById('continueStageNum');
const winModal = document.getElementById('winModal');

function seededRandom(seed) {
  let x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function updateTopStats() {
  streakCountEl.innerText = saveData.streak;
  const sumStars = Object.values(saveData.stars).reduce((a, b) => a + b, 0);
  totalStarsEl.innerText = sumStars;
  continueStageNumEl.innerText = saveData.unlockedStage;
}

function renderStagesModal() {
  updateTopStats();
  stagesGrid.innerHTML = '';
  STAGES.forEach(st => {
    const isUnlocked = st.stageNum <= saveData.unlockedStage;
    const earned = saveData.stars[st.stageNum] || 0;

    const btn = document.createElement('button');
    btn.className = `stage-btn ${earned > 0 ? 'completed' : isUnlocked ? 'unlocked' : 'locked'}`;
    btn.innerHTML = `
      <span>${isUnlocked ? st.stageNum : '🔒'}</span>
      <span class="mini-stars">${earned > 0 ? '⭐'.repeat(earned) : isUnlocked ? 'PLAY' : ''}</span>
    `;
    if (isUnlocked) {
      btn.addEventListener('click', () => {
        stagesModal.classList.add('hidden');
        startStage(st.stageNum);
      });
    }
    stagesGrid.appendChild(btn);
  });
}

function startStage(stageNum) {
  if (stageNum > saveData.unlockedStage) return;

  currentStageNum = stageNum;
  const cfg = STAGES[stageNum - 1];
  userStep = 0;
  mistakesLeft = cfg.maxMistakes;
  hintsLeft = 2;
  stageCompleted = false;

  stageLabel.innerText = `STAGE ${cfg.stageNum} / 50`;
  stageSubtitle.innerText = cfg.reverseMode ? `${cfg.title} (REVERSE BOSS)` : cfg.title;
  movesLeftEl.innerText = mistakesLeft;
  hintsLeftEl.innerText = hintsLeft;

  const totalCells = cfg.gridSize * cfg.gridSize;
  const indices = Array.from({ length: totalCells }, (_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i--) {
    const r = Math.floor(seededRandom(stageNum * 100 + i) * (i + 1));
    [indices[i], indices[r]] = [indices[r], indices[i]];
  }

  blockedSet = new Set(indices.slice(0, cfg.blockedCount));
  sequence = indices.slice(cfg.blockedCount, cfg.blockedCount + cfg.seqLen);

  gridContainer.style.gridTemplateColumns = `repeat(${cfg.gridSize}, 1fr)`;
  gridContainer.innerHTML = '';

  for (let i = 0; i < totalCells; i++) {
    const tile = document.createElement('div');
    tile.className = 'tile' + (blockedSet.has(i) ? ' blocked' : '');
    tile.dataset.index = i;
    tile.addEventListener('click', () => handleTileTap(i, tile));
    gridContainer.appendChild(tile);
  }

  playPatternSequence();
}

async function playPatternSequence() {
  if (isShowingPattern) return;
  isShowingPattern = true;
  userStep = 0;

  const cfg = STAGES[currentStageNum - 1];
  const tiles = gridContainer.querySelectorAll('.tile');
  tiles.forEach(t => {
    t.classList.remove('lit', 'correct', 'wrong');
    t.innerText = '';
  });

  instructionText.innerText = cfg.reverseMode
    ? '👀 Watch carefully — you must tap in REVERSE order!'
    : '👀 Memorize the glowing sequence...';

  await sleep(450);

  for (let step = 0; step < sequence.length; step++) {
    const cellIdx = sequence[step];
    const tile = tiles[cellIdx];
    tile.classList.add('lit');
    playTone(320 + step * 55, 0.18, 'sine', 0.16);
    await sleep(cfg.flashMs);
    tile.classList.remove('lit');
    await sleep(160);
  }

  isShowingPattern = false;
  instructionText.innerText = cfg.reverseMode
    ? '🔁 Your turn: Tap the pattern in REVERSE order!'
    : '🎯 Your turn: Tap the tiles in exact order!';
}

function handleTileTap(cellIdx, tileEl) {
  if (isShowingPattern || stageCompleted || blockedSet.has(cellIdx)) return;

  const cfg = STAGES[currentStageNum - 1];
  const targetSequence = cfg.reverseMode ? [...sequence].reverse() : sequence;
  const expectedIdx = targetSequence[userStep];

  if (cellIdx === expectedIdx) {
    tileEl.classList.add('correct');
    tileEl.innerText = userStep + 1;
    playTone(440 + userStep * 65, 0.14, 'triangle', 0.18);
    userStep++;

    if (userStep === targetSequence.length) {
      handleStageWin();
    }
  } else {
    tileEl.classList.add('wrong');
    playTone(150, 0.28, 'sawtooth', 0.22);
    mistakesLeft--;
    movesLeftEl.innerText = Math.max(0, mistakesLeft);

    setTimeout(() => {
      tileEl.classList.remove('wrong');
      if (mistakesLeft <= 0) {
        instructionText.innerText = '⚠️ Out of tries! Replaying pattern...';
        mistakesLeft = cfg.maxMistakes;
        movesLeftEl.innerText = mistakesLeft;
        playPatternSequence();
      }
    }, 450);
  }
}

function handleStageWin() {
  stageCompleted = true;
  playWinChime();

  const cfg = STAGES[currentStageNum - 1];
  const earnedStars = mistakesLeft === cfg.maxMistakes ? 3 : mistakesLeft === cfg.maxMistakes - 1 ? 2 : 1;

  const prevBest = saveData.stars[currentStageNum] || 0;
  if (earnedStars > prevBest) {
    saveData.stars[currentStageNum] = earnedStars;
  }

  if (currentStageNum < 50 && saveData.unlockedStage === currentStageNum) {
    saveData.unlockedStage = currentStageNum + 1;
  }

  persistSave();
  updateTopStats();

  document.getElementById('winHeading').innerText = `Stage ${currentStageNum} Cleared!`;
  document.getElementById('earnedStarsRow').innerText = '⭐'.repeat(earnedStars) + '☆'.repeat(3 - earnedStars);
  document.getElementById('winSubtext').innerText =
    currentStageNum < 50
      ? `Stage ${currentStageNum + 1} (${STAGES[currentStageNum].title}) is now unlocked!`
      : '🏆 You mastered all 50 stages of NeuroGrid!';

  const nextBtn = document.getElementById('nextStageBtn');
  nextBtn.innerText = currentStageNum < 50 ? `STAGE ${currentStageNum + 1} ➡` : 'PLAY STAGE 1 🔄';

  setTimeout(() => {
    winModal.classList.remove('hidden');
  }, 450);
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

document.getElementById('replayPatternBtn').addEventListener('click', () => {
  if (isShowingPattern || stageCompleted || hintsLeft <= 0) return;
  hintsLeft--;
  hintsLeftEl.innerText = hintsLeft;
  playPatternSequence();
});

document.getElementById('restartStageBtn').addEventListener('click', () => {
  if (isShowingPattern) return;
  startStage(currentStageNum);
});

document.getElementById('stageMapBtn').addEventListener('click', () => {
  renderStagesModal();
  stagesModal.classList.remove('hidden');
});

document.getElementById('closeStagesBtn').addEventListener('click', () => {
  stagesModal.classList.add('hidden');
});

document.getElementById('continueBtn').addEventListener('click', () => {
  stagesModal.classList.add('hidden');
  startStage(saveData.unlockedStage);
});

document.getElementById('nextStageBtn').addEventListener('click', () => {
  winModal.classList.add('hidden');
  const next = currentStageNum < 50 ? currentStageNum + 1 : 1;
  startStage(next);
});

document.getElementById('allStagesFromWinBtn').addEventListener('click', () => {
  winModal.classList.add('hidden');
  renderStagesModal();
  stagesModal.classList.remove('hidden');
});

document.getElementById('soundBtn').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('soundBtn').innerText = soundEnabled ? '🔊' : '🔇';
});

renderStagesModal();
startStage(saveData.unlockedStage);