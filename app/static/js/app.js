/**
 * Word Shuffle Game — Frontend Application
 *
 * Responsibilities:
 *  - Slip CRUD (create, read, update, delete)
 *  - Finish/Unfinish toggling
 *  - Game session management (start, score, end)
 *  - All modal interactions
 *  - Celebratory star animations
 *  - Toast notifications
 *  - Game mode: "turns" (take turns) | "buzzin" (first to answer)
 *  - Correct answer sound (synthesised ding)
 */

"use strict";

// ---------------------------------------------------------------------------
// Constants & State
// ---------------------------------------------------------------------------

/**
 * Root prefix for all API calls.
 * Empty string when running at "/" (local dev).
 * Set to e.g. "/myapp" when deployed at a subpath on PythonAnywhere.
 */
const APP_ROOT = document.querySelector('meta[name="app-root"]')?.content.replace(/\/$/, "") || "";

const API = {
  slips:        `${APP_ROOT}/api/slips`,
  slip:         (id)        => `${APP_ROOT}/api/slips/${id}`,
  toggleFinish: (id)        => `${APP_ROOT}/api/slips/${id}/toggle-finish`,
  startSession: (id)        => `${APP_ROOT}/api/slips/${id}/start`,
  recordScore:  (sessionId) => `${APP_ROOT}/api/sessions/${sessionId}/score`,
  endSession:   (sessionId) => `${APP_ROOT}/api/sessions/${sessionId}/end`,
};

/** Live game state (populated when a session is started). */
const gameState = {
  sessionId:          null,
  words:              [],        // shuffled word list
  currentIndex:       0,
  players:            [],        // [{ id, name, position }]
  scores:             {},        // { playerId: points }
  currentPlayerIndex: 0,
  waitingForNext:     false,     // true after a WRONG answer
  slipId:             null,
  mode:               "turns",   // "turns" | "buzzin"
  selectedPlayerIds:  new Set(), // buzz-in mode: which players are tapped
};

/** Which slip is being edited (null = creating new). */
let editingSlipId = null;
/** Which slip is pending deletion. */
let pendingDeleteSlipId = null;
/** Which slip is pending a START action. */
let pendingStartSlipId = null;

// ---------------------------------------------------------------------------
// Correct Answer Sound (Web Audio API — no external file needed)
// ---------------------------------------------------------------------------

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

/**
 * Play the classic game-show "ding ding ding" correct-answer sound.
 * Three rising bell tones synthesised entirely in-browser.
 */
function playCorrectSound() {
  try {
    const ctx = getAudioCtx();

    // Resume in case browser suspended the context
    if (ctx.state === "suspended") ctx.resume();

    // Three notes: C6, E6, G6 — a quick rising arpeggio
    const notes = [
      { freq: 1046.50, startAt: 0.00 },  // C6
      { freq: 1318.51, startAt: 0.12 },  // E6
      { freq: 1567.98, startAt: 0.24 },  // G6
    ];

    notes.forEach(({ freq, startAt }) => {
      const oscillator = ctx.createOscillator();
      const gainNode   = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + startAt);

      // Amplitude: sharp attack, smooth decay (bell-like)
      const t = ctx.currentTime + startAt;
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(0.6, t + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      oscillator.start(t);
      oscillator.stop(t + 0.65);
    });
  } catch (e) {
    // Audio playback is non-critical — silently ignore errors
  }
}

// ---------------------------------------------------------------------------
// CSRF helpers
// ---------------------------------------------------------------------------

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : "";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-CSRFToken":  getCsrfToken(),
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  let data;
  try { data = await response.json(); } catch { data = {}; }

  if (!response.ok || data.ok === false) {
    const msg = data.error || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------

function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toast.style.setProperty("--toast-duration", `${duration - 300}ms`);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ---------------------------------------------------------------------------
// Flash message close buttons
// ---------------------------------------------------------------------------

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("flash-close")) {
    e.target.closest(".flash")?.remove();
  }
});

// ---------------------------------------------------------------------------
// DOM element references
// ---------------------------------------------------------------------------

// Slip modal
const slipModal        = document.getElementById("slipModal");
const slipModalTitle   = document.getElementById("slipModalTitle");
const slipModalClose   = document.getElementById("slipModalClose");
const slipModalCancel  = document.getElementById("slipModalCancel");
const slipModalSave    = document.getElementById("slipModalSave");
const slipTitle        = document.getElementById("slipTitle");
const wordsInput       = document.getElementById("wordsInput");
const wordCount        = document.getElementById("wordCount");
const playerList       = document.getElementById("playerList");
const btnAddPlayer     = document.getElementById("btnAddPlayer");
const btnNewSlip       = document.getElementById("btnNewSlip");

// Start / mode select modal
const startModal          = document.getElementById("startModal");
const startModalClose     = document.getElementById("startModalClose");
const startModalCancel    = document.getElementById("startModalCancel");
const startModalConfirm   = document.getElementById("startModalConfirm");
const playerChooseList    = document.getElementById("playerChooseList");
const firstPlayerSection  = document.getElementById("firstPlayerSection");
const modeTurnsBtn        = document.getElementById("modeTurns");
const modeBuzzInBtn       = document.getElementById("modeBuzzIn");

// Game modal
const gameModal        = document.getElementById("gameModal");
const gameWordIndex    = document.getElementById("gameWordIndex");
const gameWordTotal    = document.getElementById("gameWordTotal");
const scoreboard       = document.getElementById("scoreboard");
const wordDisplay      = document.getElementById("wordDisplay");
const feedbackCorrect  = document.getElementById("feedbackCorrect");
const feedbackWrong    = document.getElementById("feedbackWrong");
const feedbackWord     = document.getElementById("feedbackWord");
const starsCanvas      = document.getElementById("starsCanvas");
const btnCorrect       = document.getElementById("btnCorrect");
const btnWrong         = document.getElementById("btnWrong");
const btnNext          = document.getElementById("btnNext");
const btnEnd           = document.getElementById("btnEnd");

// Delete confirm modal
const deleteModal       = document.getElementById("deleteModal");
const deleteModalClose  = document.getElementById("deleteModalClose");
const deleteModalCancel = document.getElementById("deleteModalCancel");
const deleteModalConfirm= document.getElementById("deleteModalConfirm");
const deleteSlipName    = document.getElementById("deleteSlipName");

// Slips grid
const slipsGrid        = document.getElementById("slipsGrid");

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

function openModal(modal) {
  modal.hidden = false;
  modal.focus?.();
  document.body.style.overflow = "hidden";
  // Focus first focusable element
  const first = modal.querySelector('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
  first?.focus();
}

function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = "";
}

// Close modals on overlay click (but not game modal — requires END button)
[slipModal, startModal, deleteModal].forEach(modal => {
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

// Escape key closes non-game modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!slipModal.hidden)  closeModal(slipModal);
    if (!startModal.hidden) closeModal(startModal);
    if (!deleteModal.hidden) closeModal(deleteModal);
  }
});

// ---------------------------------------------------------------------------
// Word Count Live Update
// ---------------------------------------------------------------------------

wordsInput?.addEventListener("input", updateWordCount);

function updateWordCount() {
  const words = parseWords(wordsInput.value);
  wordCount.textContent = `${words.length} word${words.length !== 1 ? "s" : ""}`;
}

function parseWords(raw) {
  /**
   * Rules:
   *  - Each line is ONE complete entry (e.g. "1 PETER" stays as "1 PETER")
   *  - A comma inside a line also separates entries (paste-friendly)
   *  - Blank lines / entries are ignored
   *  - De-duplicate case-insensitively
   */
  const seen = new Set();
  const out  = [];

  // Split only on newlines and commas — NOT on spaces
  const entries = raw.split(/[\n,]+/);

  for (const entry of entries) {
    const clean = entry.trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      out.push(clean);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Player Rows (in slip modal)
// ---------------------------------------------------------------------------

function addPlayerRow(name = "") {
  const row = document.createElement("div");
  row.className = "player-row";
  row.innerHTML = `
    <input
      type="text"
      class="form-control player-name-input"
      placeholder="Player name"
      maxlength="80"
      value="${escapeHtml(name)}"
      autocomplete="off"
    />
    <button type="button" class="btn-remove-player" aria-label="Remove player">&times;</button>
  `;
  row.querySelector(".btn-remove-player").addEventListener("click", () => row.remove());
  playerList.appendChild(row);
  row.querySelector("input").focus();
}

btnAddPlayer?.addEventListener("click", () => addPlayerRow());

function getPlayerNames() {
  return Array.from(playerList.querySelectorAll(".player-name-input"))
    .map(input => input.value.trim())
    .filter(Boolean);
}

function clearPlayerRows() {
  playerList.innerHTML = "";
}

// ---------------------------------------------------------------------------
// Slip Modal — Open (New)
// ---------------------------------------------------------------------------

btnNewSlip?.addEventListener("click", () => {
  editingSlipId = null;
  slipModalTitle.textContent = "New Game Slip";
  slipTitle.value = "";
  wordsInput.value = "";
  clearPlayerRows();
  addPlayerRow(); // start with one blank player row
  updateWordCount();
  openModal(slipModal);
});

slipModalClose?.addEventListener("click",  () => closeModal(slipModal));
slipModalCancel?.addEventListener("click", () => closeModal(slipModal));

// ---------------------------------------------------------------------------
// Slip Modal — Save (Create / Update)
// ---------------------------------------------------------------------------

slipModalSave?.addEventListener("click", async () => {
  const title   = slipTitle.value.trim();
  const words   = parseWords(wordsInput.value);
  const players = getPlayerNames();

  if (!title) {
    showToast("Please enter a slip title.", "error");
    slipTitle.focus();
    return;
  }
  if (words.length === 0) {
    showToast("Please enter at least one word.", "error");
    wordsInput.focus();
    return;
  }

  setLoading(slipModalSave, true);

  try {
    let result;
    if (editingSlipId) {
      result = await apiFetch(API.slip(editingSlipId), {
        method: "PUT",
        body: JSON.stringify({ title, words, players }),
      });
      updateSlipCard(result.data);
      showToast("Slip updated successfully.", "success");
    } else {
      result = await apiFetch(API.slips, {
        method: "POST",
        body: JSON.stringify({ title, words, players }),
      });
      prependSlipCard(result.data);
      showToast("Game slip created!", "success");
      removeEmptyState();
    }
    closeModal(slipModal);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading(slipModalSave, false);
  }
});

// ---------------------------------------------------------------------------
// Slip Card — render helpers
// ---------------------------------------------------------------------------

function buildSlipCard(slip) {
  const el = document.createElement("article");
  el.className = `slip-card${slip.is_finished ? " slip-card--finished" : ""}`;
  el.dataset.slipId   = slip.id;
  el.dataset.finished = slip.is_finished ? "true" : "false";
  el.setAttribute("role", "listitem");
  el.innerHTML = slipCardHTML(slip);
  bindSlipCardEvents(el);
  return el;
}

function slipCardHTML(slip) {
  const wordCount    = slip.words.length;
  const playerCount  = slip.players.length;
  const createdDate  = new Date(slip.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const finishedBadge = slip.is_finished
    ? `<span class="slip-badge slip-badge--done">Finished</span>` : "";

  return `
    <div class="slip-card__body">
      <div class="slip-card__meta">
        <span class="slip-badge slip-badge--words">${wordCount} word${wordCount !== 1 ? "s" : ""}</span>
        <span class="slip-badge slip-badge--players">${playerCount} player${playerCount !== 1 ? "s" : ""}</span>
        ${finishedBadge}
      </div>
      <h2 class="slip-card__title">${escapeHtml(slip.title)}</h2>
      <p class="slip-card__date">Created ${createdDate}</p>
    </div>
    <div class="slip-card__actions">
      <button class="btn btn--ghost btn--sm btn-edit" aria-label="Edit ${escapeHtml(slip.title)}"${slip.is_finished ? " disabled" : ""}>Edit</button>
      <button class="btn btn--danger-ghost btn--sm btn-delete" aria-label="Delete ${escapeHtml(slip.title)}">Delete</button>
      <button class="btn btn--warning btn--sm btn-finish" aria-label="${slip.is_finished ? "Unfinish" : "Finish"} ${escapeHtml(slip.title)}">${slip.is_finished ? "Unfinish" : "Finish"}</button>
      <button class="btn btn--success btn--sm btn-start" aria-label="Start ${escapeHtml(slip.title)}"${slip.is_finished ? " disabled" : ""}>Start</button>
    </div>
  `;
}

function prependSlipCard(slip) {
  const card = buildSlipCard(slip);
  slipsGrid.prepend(card);
}

function updateSlipCard(slip) {
  const existing = slipsGrid.querySelector(`[data-slip-id="${slip.id}"]`);
  if (!existing) return;
  existing.className = `slip-card${slip.is_finished ? " slip-card--finished" : ""}`;
  existing.dataset.finished = slip.is_finished ? "true" : "false";
  existing.innerHTML = slipCardHTML(slip);
  bindSlipCardEvents(existing);
}

function removeSlipCard(slipId) {
  const card = slipsGrid.querySelector(`[data-slip-id="${slipId}"]`);
  card?.remove();
  if (!slipsGrid.querySelector(".slip-card")) showEmptyState();
}

function showEmptyState() {
  if (slipsGrid.querySelector(".empty-state")) return;
  slipsGrid.innerHTML = `
    <div class="empty-state" id="emptyState">
      <div class="empty-state__icon">📋</div>
      <h2 class="empty-state__title">No game slips yet</h2>
      <p class="empty-state__text">Click <strong>New Game Slip</strong> to create your first word collection.</p>
    </div>`;
}

function removeEmptyState() {
  document.getElementById("emptyState")?.remove();
}

// ---------------------------------------------------------------------------
// Slip Card — event delegation
// ---------------------------------------------------------------------------

/** Bind events on a single card element. */
function bindSlipCardEvents(card) {
  card.querySelector(".btn-edit")?.addEventListener("click",   () => openEditModal(card));
  card.querySelector(".btn-delete")?.addEventListener("click", () => openDeleteModal(card));
  card.querySelector(".btn-finish")?.addEventListener("click", () => handleToggleFinish(card));
  card.querySelector(".btn-start")?.addEventListener("click",  () => openStartModal(card));
}

/** Bind events for all cards already on the page (server-rendered). */
document.querySelectorAll(".slip-card").forEach(card => bindSlipCardEvents(card));

// ---------------------------------------------------------------------------
// Edit Slip
// ---------------------------------------------------------------------------

async function openEditModal(card) {
  const slipId = Number(card.dataset.slipId);
  setLoading(card.querySelector(".btn-edit"), true);
  try {
    const result = await apiFetch(API.slip(slipId));
    const slip   = result.data;

    editingSlipId = slipId;
    slipModalTitle.textContent = "Edit Game Slip";
    slipTitle.value = slip.title;

    // Populate words
    wordsInput.value = slip.words.map(w => w.text).join("\n");
    updateWordCount();

    // Populate players
    clearPlayerRows();
    if (slip.players.length > 0) {
      slip.players.forEach(p => addPlayerRow(p.name));
    } else {
      addPlayerRow();
    }

    openModal(slipModal);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading(card.querySelector(".btn-edit"), false);
  }
}

// ---------------------------------------------------------------------------
// Delete Slip
// ---------------------------------------------------------------------------

function openDeleteModal(card) {
  const slipId   = Number(card.dataset.slipId);
  const title    = card.querySelector(".slip-card__title")?.textContent || "this slip";
  pendingDeleteSlipId  = slipId;
  deleteSlipName.textContent = `"${title}"`;
  openModal(deleteModal);
}

deleteModalClose?.addEventListener("click",  () => closeModal(deleteModal));
deleteModalCancel?.addEventListener("click", () => closeModal(deleteModal));

deleteModalConfirm?.addEventListener("click", async () => {
  if (!pendingDeleteSlipId) return;
  setLoading(deleteModalConfirm, true);
  try {
    await apiFetch(API.slip(pendingDeleteSlipId), { method: "DELETE" });
    removeSlipCard(pendingDeleteSlipId);
    closeModal(deleteModal);
    showToast("Slip deleted.", "info");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading(deleteModalConfirm, false);
    pendingDeleteSlipId = null;
  }
});

// ---------------------------------------------------------------------------
// Finish / Unfinish Toggle
// ---------------------------------------------------------------------------

async function handleToggleFinish(card) {
  const slipId = Number(card.dataset.slipId);
  const btn    = card.querySelector(".btn-finish");
  setLoading(btn, true);
  try {
    const result = await apiFetch(API.toggleFinish(slipId), { method: "POST" });
    const { id, is_finished } = result.data;

    // Re-fetch full slip to rebuild card with fresh data
    const slipResult = await apiFetch(API.slip(id));
    updateSlipCard(slipResult.data);
    showToast(is_finished ? "Slip marked as finished." : "Slip unfinished.", "info");
  } catch (err) {
    showToast(err.message, "error");
    setLoading(btn, false);
  }
}

// ---------------------------------------------------------------------------
// Start Game — Mode Select + Choose First Player Modal
// ---------------------------------------------------------------------------

function openStartModal(card) {
  const slipId = Number(card.dataset.slipId);
  pendingStartSlipId = slipId;
  fetchAndShowStartModal(slipId);
}

async function fetchAndShowStartModal(slipId) {
  const card = slipsGrid.querySelector(`[data-slip-id="${slipId}"]`);
  const btn  = card?.querySelector(".btn-start");
  if (btn) setLoading(btn, true);

  try {
    const result  = await apiFetch(API.slip(slipId));
    const slip    = result.data;
    const players = slip.players;

    if (players.length === 0) {
      showToast("Add at least one player to this slip before starting.", "error");
      return;
    }
    if (slip.words.length === 0) {
      showToast("Add words to this slip before starting.", "error");
      return;
    }

    // Reset mode UI to default (turns)
    setActiveMode("turns");

    // Build player choose list (for turns mode)
    buildPlayerChooseList(players, null);

    openModal(startModal);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) setLoading(btn, false);
  }
}

/**
 * Set the active game mode in the UI.
 * Toggles visibility of the first-player section.
 */
function setActiveMode(mode) {
  const isTurns = mode === "turns";

  modeTurnsBtn.classList.toggle("mode-btn--selected", isTurns);
  modeBuzzInBtn.classList.toggle("mode-btn--selected", !isTurns);
  modeTurnsBtn.setAttribute("aria-pressed", isTurns ? "true" : "false");
  modeBuzzInBtn.setAttribute("aria-pressed", isTurns ? "false" : "true");

  firstPlayerSection.hidden = !isTurns;

  // In buzz-in mode, no first player required — enable Start immediately
  if (!isTurns) {
    startModalConfirm.disabled = false;
  } else {
    // Re-check whether a player is currently selected
    const anySelected = playerChooseList?.querySelector(".player-choose-btn.selected");
    startModalConfirm.disabled = !anySelected;
  }
}

// Mode button event listeners
modeTurnsBtn?.addEventListener("click", () => setActiveMode("turns"));
modeBuzzInBtn?.addEventListener("click", () => setActiveMode("buzzin"));

/**
 * Build the "choose first player" list inside the start modal.
 */
function buildPlayerChooseList(players, onSelectCallback) {
  playerChooseList.innerHTML = "";
  let selectedPlayerId = null;

  players.forEach(p => {
    const btn2 = document.createElement("button");
    btn2.type = "button";
    btn2.className = "player-choose-btn";
    btn2.dataset.playerId = p.id;
    btn2.innerHTML = `
      <span class="player-choose-avatar">${escapeHtml(p.name.charAt(0).toUpperCase())}</span>
      <span>${escapeHtml(p.name)}</span>
    `;
    btn2.addEventListener("click", () => {
      playerChooseList.querySelectorAll(".player-choose-btn").forEach(b => b.classList.remove("selected"));
      btn2.classList.add("selected");
      selectedPlayerId = p.id;
      startModalConfirm.disabled = false;
    });
    playerChooseList.appendChild(btn2);
  });

  // Wire confirm button — captures selectedPlayerId via closure
  startModalConfirm.onclick = () => {
    const mode = modeTurnsBtn.classList.contains("mode-btn--selected") ? "turns" : "buzzin";
    startGame(pendingStartSlipId, mode, selectedPlayerId);
  };
}

startModalClose?.addEventListener("click",  () => closeModal(startModal));
startModalCancel?.addEventListener("click", () => closeModal(startModal));

// ---------------------------------------------------------------------------
// Start Game — kick off the session
// ---------------------------------------------------------------------------

async function startGame(slipId, mode, firstPlayerId) {
  // In buzz-in mode, first_player_id is not required
  if (mode === "turns" && !firstPlayerId) {
    showToast("Please choose who goes first.", "error");
    return;
  }

  setLoading(startModalConfirm, true);
  try {
    const body = mode === "turns"
      ? { first_player_id: firstPlayerId }
      : { first_player_id: null };

    const result = await apiFetch(API.startSession(slipId), {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = result.data;

    // Populate game state
    gameState.sessionId         = data.session_id;
    gameState.words             = data.words;
    gameState.players           = data.players;
    gameState.scores            = data.scores;
    gameState.slipId            = slipId;
    gameState.waitingForNext    = false;
    gameState.mode              = mode;
    gameState.selectedPlayerIds = new Set();

    if (mode === "turns") {
      gameState.currentPlayerIndex = gameState.players.findIndex(
        p => p.id === data.first_player_id
      );
      if (gameState.currentPlayerIndex === -1) gameState.currentPlayerIndex = 0;
    } else {
      gameState.currentPlayerIndex = 0;
    }

    gameState.currentIndex = 0;

    closeModal(startModal);
    openGameModal();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading(startModalConfirm, false);
  }
}

// ---------------------------------------------------------------------------
// Game Modal
// ---------------------------------------------------------------------------

function openGameModal() {
  renderScoreboard();

  gameWordTotal.textContent = gameState.words.length;
  showCurrentWord();

  setGameControls({ correct: true, wrong: true, next: true, end: true });

  openModal(gameModal);
}

function renderScoreboard() {
  scoreboard.innerHTML = "";
  gameState.players.forEach((player, idx) => {
    const card = document.createElement("div");
    const isBuzzIn = gameState.mode === "buzzin";

    card.className = "score-card";
    if (!isBuzzIn && idx === gameState.currentPlayerIndex) {
      card.classList.add("active-player");
    }
    if (isBuzzIn) {
      card.classList.add("score-card--selectable");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-pressed", "false");
      card.title = "Tap to select this player as correct";
    }

    card.id = `scoreCard-${player.id}`;
    card.dataset.playerId = player.id;
    card.innerHTML = `
      <span class="score-card__name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span>
      <span class="score-card__points" id="scorePoints-${player.id}">${gameState.scores[player.id] ?? 0}</span>
    `;

    if (isBuzzIn) {
      // Click or Enter/Space to toggle selection
      const toggleCard = () => togglePlayerSelection(player.id, card);
      card.addEventListener("click", toggleCard);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCard(); }
      });
    }

    scoreboard.appendChild(card);
  });
}

/**
 * Toggle a player's selection in buzz-in mode.
 */
function togglePlayerSelection(playerId, cardEl) {
  if (gameState.selectedPlayerIds.has(playerId)) {
    gameState.selectedPlayerIds.delete(playerId);
    cardEl.classList.remove("score-card--selected");
    cardEl.setAttribute("aria-pressed", "false");
  } else {
    gameState.selectedPlayerIds.add(playerId);
    cardEl.classList.add("score-card--selected");
    cardEl.setAttribute("aria-pressed", "true");
  }

  // Enable CORRECT only when at least one player is selected
  btnCorrect.disabled = gameState.selectedPlayerIds.size === 0;
}

/**
 * Fisher-Yates shuffle on an array — mutates in place and returns it.
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Shuffle the characters of an entry (word or phrase like "1 PETER"),
 * guaranteeing the result differs from the original (up to 30 attempts).
 * Spaces are stripped before shuffling so only meaningful characters are
 * shown — each character is then separated by two spaces for readability.
 * e.g. "1 PETER" → "E  T  R  1  E  P"
 */
function shuffleWord(word) {
  const chars = word.toUpperCase().replace(/\s+/g, "").split("");

  const allSame = chars.every(c => c === chars[0]);
  if (chars.length <= 1 || allSame) {
    return chars.join("  ");
  }

  const original = chars.join("");
  let shuffled;
  let attempts = 0;
  do {
    shuffled = shuffleArray([...chars]).join("");
    attempts++;
  } while (shuffled === original && attempts < 30);

  return shuffled.split("").join("  ");
}

function showCurrentWord() {
  const word = gameState.words[gameState.currentIndex];
  gameWordIndex.textContent = gameState.currentIndex + 1;

  const displayed = shuffleWord(word);

  wordDisplay.style.animation = "none";
  wordDisplay.offsetHeight;
  wordDisplay.style.animation = "";
  wordDisplay.textContent = displayed;
}

function setGameControls({ correct, wrong, next, end }) {
  // In buzz-in mode, CORRECT requires a selection — handled separately
  if (gameState.mode === "buzzin" && correct) {
    btnCorrect.disabled = gameState.selectedPlayerIds.size === 0;
  } else {
    btnCorrect.disabled = !correct;
  }
  btnWrong.disabled = !wrong;
  btnNext.disabled  = !next;
  btnEnd.disabled   = !end;
}

function highlightCurrentPlayer() {
  if (gameState.mode === "buzzin") return; // no turn-highlighting in buzz-in mode
  scoreboard.querySelectorAll(".score-card").forEach(c => c.classList.remove("active-player"));
  const current = gameState.players[gameState.currentPlayerIndex];
  if (current) {
    document.getElementById(`scoreCard-${current.id}`)?.classList.add("active-player");
  }
}

function advancePlayer() {
  if (gameState.mode === "buzzin") return; // no player rotation in buzz-in mode
  gameState.currentPlayerIndex =
    (gameState.currentPlayerIndex + 1) % gameState.players.length;
  highlightCurrentPlayer();
}

// ── CORRECT ──
btnCorrect?.addEventListener("click", async () => {
  if (btnCorrect.disabled) return;

  // Determine which players get points
  let playerIdsToScore;
  if (gameState.mode === "buzzin") {
    playerIdsToScore = Array.from(gameState.selectedPlayerIds);
    if (playerIdsToScore.length === 0) return; // safety guard
  } else {
    playerIdsToScore = [gameState.players[gameState.currentPlayerIndex].id];
  }

  // Play the correct answer sound
  playCorrectSound();

  setGameControls({ correct: false, wrong: false, next: false, end: false });

  try {
    const body = playerIdsToScore.length === 1
      ? { player_id: playerIdsToScore[0] }
      : { player_ids: playerIdsToScore };

    const result = await apiFetch(API.recordScore(gameState.sessionId), {
      method: "POST",
      body: JSON.stringify(body),
    });
    gameState.scores = result.data;
    playerIdsToScore.forEach(pid => updateScoreDisplay(pid));
  } catch (err) {
    showToast("Could not record score: " + err.message, "error");
  }

  // Show CORRECT feedback + stars — reveal the actual word for 2 seconds
  const correctWord = gameState.words[gameState.currentIndex];
  showFeedback("correct", correctWord);
  spawnStars();

  setTimeout(() => {
    hideFeedback();

    // Clear selections in buzz-in mode
    if (gameState.mode === "buzzin") {
      gameState.selectedPlayerIds.clear();
      scoreboard.querySelectorAll(".score-card--selected").forEach(c => {
        c.classList.remove("score-card--selected");
        c.setAttribute("aria-pressed", "false");
      });
    } else {
      advancePlayer();
    }

    nextWord();
  }, 2000);
});

// ── WRONG ──
btnWrong?.addEventListener("click", () => {
  if (btnWrong.disabled) return;
  setGameControls({ correct: false, wrong: false, next: false, end: false });

  showFeedback("wrong");

  setTimeout(() => {
    hideFeedback();

    if (gameState.mode === "turns") {
      // Move to next player — same word stays
      advancePlayer();
    }
    // In buzz-in mode: just re-enable controls for another attempt
    setGameControls({ correct: true, wrong: true, next: true, end: true });
  }, 1000);
});

// ── NEXT ──
btnNext?.addEventListener("click", () => {
  if (btnNext.disabled) return;

  // Clear buzz-in selections on skip
  if (gameState.mode === "buzzin") {
    gameState.selectedPlayerIds.clear();
    scoreboard.querySelectorAll(".score-card--selected").forEach(c => {
      c.classList.remove("score-card--selected");
      c.setAttribute("aria-pressed", "false");
    });
  } else {
    advancePlayer();
  }

  nextWord();
});

// ── END ──
btnEnd?.addEventListener("click", async () => {
  if (btnEnd.disabled) return;
  setGameControls({ correct: false, wrong: false, next: false, end: false });
  try {
    await apiFetch(API.endSession(gameState.sessionId), { method: "POST" });
  } catch {
    // session end errors are non-critical
  }
  closeModal(gameModal);
  resetGameState();
  showToast("Game ended. Well played!", "success");
});

function nextWord() {
  gameState.currentIndex++;
  if (gameState.currentIndex >= gameState.words.length) {
    handleGameOver();
    return;
  }
  showCurrentWord();
  setGameControls({ correct: true, wrong: true, next: true, end: true });
}

async function handleGameOver() {
  wordDisplay.textContent = "🎉 All Done!";
  setGameControls({ correct: false, wrong: false, next: false, end: true });
  spawnStars();
  spawnStars(200);
  try {
    await apiFetch(API.endSession(gameState.sessionId), { method: "POST" });
  } catch { /* non-critical */ }
}

function updateScoreDisplay(playerId) {
  const el = document.getElementById(`scorePoints-${playerId}`);
  if (!el) return;
  el.textContent = gameState.scores[playerId] ?? 0;
  el.classList.remove("bump");
  el.offsetHeight;
  el.classList.add("bump");
}

function resetGameState() {
  Object.assign(gameState, {
    sessionId: null, words: [], currentIndex: 0,
    players: [], scores: {}, currentPlayerIndex: 0,
    waitingForNext: false, slipId: null,
    mode: "turns", selectedPlayerIds: new Set(),
  });
}

// ── Feedback ──

function showFeedback(type, word = null) {
  hideFeedback();
  if (type === "correct") {
    feedbackWord.textContent = word ? `THE WORD IS  ${word.toUpperCase()}` : "";
    feedbackCorrect.hidden = false;
  } else {
    feedbackWrong.hidden = false;
  }
}

function hideFeedback() {
  feedbackCorrect.hidden = true;
  feedbackWrong.hidden   = true;
}

// ---------------------------------------------------------------------------
// Star Particle Animation
// ---------------------------------------------------------------------------

function spawnStars(count = 60) {
  const colors = [
    "#6c63ff", "#22c55e", "#f59e0b", "#ef4444",
    "#a78bfa", "#34d399", "#fbbf24", "#f87171",
    "#60a5fa", "#fb7185",
  ];
  const cx = starsCanvas.offsetWidth  / 2;
  const cy = starsCanvas.offsetHeight / 2;

  for (let i = 0; i < count; i++) {
    const star = document.createElement("div");
    star.className = "star-particle";

    const angle   = Math.random() * 2 * Math.PI;
    const radius  = 150 + Math.random() * 300;
    const dx      = Math.cos(angle) * radius;
    const dy      = Math.sin(angle) * radius - 100;
    const size    = 8 + Math.random() * 16;
    const color   = colors[Math.floor(Math.random() * colors.length)];
    const delay   = Math.random() * 300;
    const duration= 600 + Math.random() * 600;

    star.style.cssText = `
      left: ${cx}px;
      top:  ${cy}px;
      width:  ${size}px;
      height: ${size}px;
      background: ${color};
      --dx: ${dx}px;
      --dy: ${dy}px;
      animation-delay:    ${delay}ms;
      animation-duration: ${duration}ms;
    `;

    starsCanvas.appendChild(star);
    star.addEventListener("animationend", () => star.remove());
  }
}

// ---------------------------------------------------------------------------
// Loading State Helper
// ---------------------------------------------------------------------------

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add("btn--loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("btn--loading");
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// XSS Prevention — escape HTML before injecting into innerHTML
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// Theme Toggle (Light / Dark Mode)
// ---------------------------------------------------------------------------

(function initTheme() {
  const html        = document.documentElement;
  const STORAGE_KEY = "wsg-theme";
  const DARK        = "dark";
  const LIGHT       = "light";

  /** Apply a theme to <html> and update the toggle button. */
  function applyTheme(theme) {
    html.setAttribute("data-theme", theme);

    const btn   = document.getElementById("themeToggle");
    if (!btn) return;

    const isDark = theme === DARK;
    const icon   = btn.querySelector(".theme-toggle__icon");
    const label  = btn.querySelector(".theme-toggle__label");

    icon.textContent  = isDark ? "☀️" : "🌙";
    label.textContent = isDark ? "Light mode" : "Dark mode";
    btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  }

  /** Toggle between light and dark and persist. */
  function toggleTheme() {
    const current = html.getAttribute("data-theme") || LIGHT;
    const next    = current === DARK ? LIGHT : DARK;
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  // On load: restore saved preference (default is light, already set in HTML)
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === DARK || saved === LIGHT) {
    applyTheme(saved);
  }
  // If no saved preference the HTML default ("light") stays — button label is set here
  else {
    applyTheme(LIGHT);
  }

  // Wire button after DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  });
})();

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Auto-dismiss flash messages after 5 s
  document.querySelectorAll(".flash").forEach(flash => {
    setTimeout(() => flash.remove(), 5000);
  });
});
