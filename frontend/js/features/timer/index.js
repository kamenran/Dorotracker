import { authenticatedFetch } from "../auth/index.js";

const TIMER_STATE_KEY = "dorotracker.timerState";
const SCHEDULER_DIRTY_KEY = "dorotracker.schedulerDirty";

let timerIntervalId = null;
let timerElements = null;
let timerState = createDefaultState();
 
let timerSummary = {
  focusSessionsCompleted: 0,
  focusMinutesCompleted: 0,
};

function isDatabaseConnectionIssue(message) {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("enotfound") || normalized.includes("econnrefused");
}

function createDefaultState() {
  return {
    mode: "focus",
    plannedMinutes: 25,
    remainingSeconds: 25 * 60,
    running: false,
    assignmentId: "",
    assignmentTitle: "",
    autoApplyProgress: true,
    customFocusMinutes: 25,
    customShortBreakMinutes: 5,
    customLongBreakMinutes: 15,
    lastTickAt: null,
  };
}

function loadPersistedState() {
  try {
    const raw = window.localStorage.getItem(TIMER_STATE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      ...createDefaultState(),
      ...parsed,
    };
  } catch {
    return createDefaultState();
  }
}

function persistState() {
  window.localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(timerState));
}

function markSchedulerDirty() {
  window.localStorage.setItem(SCHEDULER_DIRTY_KEY, "1");
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function formatSessionLabel(type) {
  if (type === "short_break") {
    return "Short break";
  }

  if (type === "long_break") {
    return "Long break";
  }

  return "Focus session";
}

function getFinishedSessionMessage(mode) {
  if (mode === "short_break") {
    return "Short break finished. Save it or reset when you're ready to focus again.";
  }

  if (mode === "long_break") {
    return "Long break finished. Save it or reset when you're ready to start again.";
  }

  return "Focus session finished. Save it to history or reset for the next round.";
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isAssignmentCompleted(assignment) {
  return Number(assignment.minutesCompleted || 0) >= Number(assignment.estimatedMinutes || 0);
}

function renderCloudCompanion() {
  return `
    <div class="cloud-mascot cloud-mascot-large" aria-label="Cute cloud study buddy" role="img">
      <div class="cloud-mascot-body">
        <span class="cloud-eye left"></span>
        <span class="cloud-eye right heart-eye"></span>
        <span class="cloud-blush left"></span>
        <span class="cloud-blush right"></span>
        <span class="cloud-smile"></span>
      </div>
      <div class="cloud-sparkle one"></div>
      <div class="cloud-sparkle two"></div>
      <div class="cloud-sparkle three"></div>
    </div>
  `;
}

function stopInterval() {
  if (timerIntervalId) {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function hydrateRunningTimer() {
  if (!timerState.running || !timerState.lastTickAt) {
    return;
  }

  const elapsedSeconds = Math.floor((Date.now() - Number(timerState.lastTickAt)) / 1000);
  if (elapsedSeconds <= 0) {
    return;
  }

  timerState.remainingSeconds = Math.max(0, timerState.remainingSeconds - elapsedSeconds);
  timerState.lastTickAt = Date.now();

  if (timerState.remainingSeconds === 0) {
    timerState.running = false;
    stopInterval();
  }

  persistState();
}

function syncModeButtons() {
  if (!timerElements) {
    return;
  }

  timerElements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === timerState.mode);
  });
}

function syncTimerView() {
  if (!timerElements) {
    return;
  }

  const totalSeconds = Math.max(1, timerState.plannedMinutes * 60);
  const progress = Math.max(0, Math.min(1, (totalSeconds - timerState.remainingSeconds) / totalSeconds));
  const accent = timerState.mode === "focus" ? "var(--accent)" : "#d28aa5";

  timerElements.clock.textContent = formatClock(timerState.remainingSeconds);
  timerElements.modeLabel.textContent = formatSessionLabel(timerState.mode);
  timerElements.status.textContent = timerState.running
    ? "Timer running. Stay with one small task at a time."
    : "Paused and ready whenever you are.";
  timerElements.assignmentHint.textContent =
    timerState.mode === "focus" && timerState.assignmentTitle
      ? `Tracking toward: ${timerState.assignmentTitle}`
      : timerState.mode === "focus"
        ? "Optional: attach this session to an assignment."
        : "Break sessions do not affect assignment progress.";
  timerElements.progressRing.style.background = `conic-gradient(${accent} ${Math.round(progress * 360)}deg, rgba(231, 127, 151, 0.12) 0deg)`;
  timerElements.startButton.textContent = timerState.running ? "Pause session" : "Start session";
  timerElements.startButton.classList.toggle("secondary", !timerState.running);
  timerElements.completeButton.disabled = timerState.mode !== "focus" && timerState.mode !== "short_break" && timerState.mode !== "long_break";

  timerElements.focusMinutes.value = String(timerState.customFocusMinutes);
  timerElements.shortBreakMinutes.value = String(timerState.customShortBreakMinutes);
  timerElements.longBreakMinutes.value = String(timerState.customLongBreakMinutes);
  timerElements.autoApply.checked = Boolean(timerState.autoApplyProgress);
  timerElements.assignmentSelect.value = timerState.assignmentId ? String(timerState.assignmentId) : "";

  const nextCycle = (Number(timerSummary.focusSessionsCompleted || 0) % 4) + 1;

timerElements.cycleNote.textContent =
  timerState.mode === "focus"
    ? `Focus cycle ${nextCycle} of 4`
    : "Break time helps the next focus block feel lighter.";

  syncModeButtons();
}

function setStatus(message, tone = "") {
  if (!timerElements) {
    return;
  }

  timerElements.flash.textContent = message;
  timerElements.flash.className = `timer-flash${tone ? ` ${tone}` : ""}`;
}

function updateMode(nextMode) {
  timerState.mode = nextMode;

  if (nextMode === "focus") {
    timerState.plannedMinutes = Number(timerState.customFocusMinutes || 25);
  } else if (nextMode === "short_break") {
    timerState.plannedMinutes = Number(timerState.customShortBreakMinutes || 5);
  } else {
    timerState.plannedMinutes = Number(timerState.customLongBreakMinutes || 15);
  }

  timerState.remainingSeconds = timerState.plannedMinutes * 60;
  timerState.running = false;
  timerState.lastTickAt = null;
  stopInterval();
  persistState();
  syncTimerView();
}

function tick() {
  timerState.remainingSeconds = Math.max(0, timerState.remainingSeconds - 1);
  timerState.lastTickAt = Date.now();

  if (timerState.remainingSeconds === 0) {
    timerState.running = false;
    stopInterval();
    persistState();
    syncTimerView();
    setStatus(getFinishedSessionMessage(timerState.mode), "success");
    return;
  }

  persistState();
  syncTimerView();
}

function startTimer() {
  if (timerState.running) {
    timerState.running = false;
    timerState.lastTickAt = null;
    stopInterval();
    persistState();
    syncTimerView();
    setStatus("Session paused. You can resume whenever you're ready.");
    return;
  }

  timerState.running = true;
  timerState.lastTickAt = Date.now();
  stopInterval();
  timerIntervalId = window.setInterval(tick, 1000);
  persistState();
  syncTimerView();
  setStatus("Timer started. Keep the tab open or come back later, it will stay in sync.", "success");
}

function resetTimer() {
  stopInterval();
  timerState.running = false;
  timerState.lastTickAt = null;
  timerState.remainingSeconds = timerState.plannedMinutes * 60;
  persistState();
  syncTimerView();
  setStatus("Session reset.");
}

function renderHistory(timer) {
  if (!timerElements) {
    return;
  }
  timerSummary = timer.summary || timerSummary;

  timerElements.summary.innerHTML = `
    <div class="timer-stat-card">
      <strong>${timersummary.focusSessionsCompleted}</strong>
      <span>completed focus sessions</span>
    </div>
    <div class="timer-stat-card">
      <strong>${timersummary.focusMinutesCompleted}</strong>
      <span>focus minutes logged</span>
    </div>
    <div class="timer-stat-card">
      <strong>${timer.sessions.length}</strong>
      <span>recent saved sessions</span>
    </div>
  `;

  timerElements.history.innerHTML = timer.sessions.length
    ? timer.sessions
        .map(
          (session) => `
            <article class="timer-history-card">
              <div class="timer-history-top">
                <strong>${formatSessionLabel(session.sessionType)}</strong>
                <span>${session.completed ? "Completed" : "Stopped early"}</span>
              </div>
              ${
                session.assignmentTitle
                  ? `<p>${session.assignmentTitle}</p>`
                  : session.sessionType === "focus"
                    ? `<p>No assignment linked</p>`
                    : ""
              }
              <div class="timer-history-meta">
                <span>${session.actualMinutes} min logged</span>
                <span>${formatTimestamp(session.createdAt)}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="scheduler-empty"><p>No saved study sessions yet. Finish one and save it here.</p></div>`;
}

async function loadAssignmentsAndHistory() {
  const [assignmentsResponse, timerResponse] = await Promise.all([
    authenticatedFetch("/api/assignments"),
    authenticatedFetch("/api/timer"),
  ]);

  if (assignmentsResponse.status === 401 || timerResponse.status === 401) {
    return { unauthorized: true };
  }

  const assignmentsData = await assignmentsResponse.json();
  const timerData = await timerResponse.json();

  if (!assignmentsResponse.ok) {
    throw new Error(assignmentsData.error || "Could not load assignments for the timer.");
  }

  if (!timerResponse.ok) {
    throw new Error(timerData.error || "Could not load timer history.");
  }

  return {
    unauthorized: false,
    assignments: assignmentsData.assignments || [],
    timer: timerData,
  };
}

function fillAssignmentOptions(assignments) {
  if (!timerElements) {
    return;
  }

  const activeAssignments = assignments.filter((assignment) => !isAssignmentCompleted(assignment));

  timerElements.assignmentSelect.innerHTML = `
    <option value="">No linked assignment</option>
    ${activeAssignments
      .map(
        (assignment) => `
          <option value="${assignment.id}">
            ${assignment.title} • Due ${assignment.dueDate}
          </option>
        `,
      )
      .join("")}
  `;

  if (timerState.assignmentId) {
    timerElements.assignmentSelect.value = String(timerState.assignmentId);
    if (timerElements.assignmentSelect.value !== String(timerState.assignmentId)) {
      timerState.assignmentId = "";
      timerState.assignmentTitle = "";
      persistState();
    }
  }
}

async function saveSession(forceCompleted) {
  if (!timerElements) {
    return;
  }

  const elapsedMinutes = Math.max(
    0,
    Math.round((timerState.plannedMinutes * 60 - timerState.remainingSeconds) / 60),
  );

  if (!forceCompleted && elapsedMinutes <= 0) {
    setStatus("Let the timer run a bit before saving a partial session.", "error");
    return;
  }

  const response = await authenticatedFetch("/api/timer/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assignmentId: timerState.mode === "focus" && timerState.assignmentId ? Number(timerState.assignmentId) : null,
      sessionType: timerState.mode,
      plannedMinutes: timerState.plannedMinutes,
      actualMinutes: forceCompleted ? timerState.plannedMinutes : elapsedMinutes,
      completed: Boolean(forceCompleted),
      applyToAssignment: Boolean(timerState.autoApplyProgress),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not save study session.");
  }

  renderHistory(data.timer);
  if (timerState.mode === "focus" && data.session?.assignmentId && timerState.autoApplyProgress) {
    markSchedulerDirty();
    setStatus("Session saved and assignment progress updated.", "success");
  } else {
    setStatus("Session saved to recent history.", "success");
  }
}

function renderSignedOut(container) {
  container.innerHTML = `
    <div class="scheduler-gate-card">
      <p class="feature-label">Sign in required</p>
      <h3>Open the Account page before using the study room.</h3>
      <p>This timer saves session history to your account and can update assignment progress when a focus session is completed.</p>
      <a class="hero-button" href="#auth">Go to Account</a>
    </div>
  `;
}

export function mountTimerFeature(container) {
  if (!container) {
    return;
  }

  stopInterval();
  timerState = loadPersistedState();
  hydrateRunningTimer();

  container.innerHTML = `
    <section class="timer-room">
      <div class="timer-hero-card">
        <div>
          <p class="feature-label">Cozy focus room</p>
          <h2>Study with the app instead of beside it.</h2>
          <p class="timer-hero-copy">
            Choose a focus block or break, attach it to an assignment if you want, and save completed sessions.
          </p>
          <p class="timer-cycle-note" id="timer-cycle-note"></p>
        </div>
        <div class="timer-hero-mascot">
          ${renderCloudCompanion()}
        </div>
        <div class="timer-mode-row">
          <button type="button" class="timer-mode-button active" data-mode="focus">Focus</button>
          <button type="button" class="timer-mode-button" data-mode="short_break">Short break</button>
          <button type="button" class="timer-mode-button" data-mode="long_break">Long break</button>
        </div>
      </div>

      <div class="timer-room-grid">
        <section class="timer-stage-card">
          <div class="timer-ring-wrap">
            <div class="timer-progress-ring" id="timer-progress-ring">
              <div class="timer-ring-core">
                <p id="timer-mode-label">Focus session</p>
                <strong id="timer-clock">25:00</strong>
                <span id="timer-status">Paused and ready whenever you are.</span>
              </div>
            </div>
          </div>
          <p class="timer-assignment-hint" id="timer-assignment-hint"></p>
          <div class="timer-action-row">
            <button type="button" id="timer-start-button">Start session</button>
            <button type="button" class="secondary" id="timer-reset-button">Reset</button>
            <button type="button" class="secondary" id="timer-save-button">Save partial session</button>
            <button type="button" class="secondary" id="timer-complete-button">Mark complete</button>
          </div>
          <p class="timer-flash" id="timer-flash">Pick a session style, then press start when you want to focus.</p>
        </section>

        <aside class="timer-side-card">
          <div class="timer-control-block">
            <p class="feature-label">Session setup</p>
            <label>
              <span>Linked assignment</span>
              <select id="timer-assignment-select"></select>
            </label>
            <label class="timer-checkbox">
              <input id="timer-auto-apply" type="checkbox" checked />
              <span>When a focus session is completed, add those minutes to the assignment automatically.</span>
            </label>
          </div>

          <div class="timer-control-block">
            <p class="feature-label">Custom lengths</p>
            <div class="timer-length-grid">
              <label>
                <span>Focus</span>
                <input id="timer-focus-minutes" type="number" min="5" max="180" step="5" value="25" />
              </label>
              <label>
                <span>Short break</span>
                <input id="timer-short-break-minutes" type="number" min="1" max="60" step="1" value="5" />
              </label>
              <label>
                <span>Long break</span>
                <input id="timer-long-break-minutes" type="number" min="5" max="90" step="5" value="15" />
              </label>
            </div>
          </div>

          <div class="timer-control-block">
            <div class="assignments-form-header">
              <div>
                <p class="feature-label">Recent history</p>
              </div>
              <button type="button" class="secondary" id="timer-clear-history">Clear</button>
            </div>
            <div class="timer-summary-grid" id="timer-summary"></div>
            <div class="timer-history-list" id="timer-history"></div>
          </div>
        </aside>
      </div>
    </section>
  `;

  timerElements = {
    progressRing: container.querySelector("#timer-progress-ring"),
    clock: container.querySelector("#timer-clock"),
    modeLabel: container.querySelector("#timer-mode-label"),
    status: container.querySelector("#timer-status"),
    assignmentHint: container.querySelector("#timer-assignment-hint"),
    startButton: container.querySelector("#timer-start-button"),
    resetButton: container.querySelector("#timer-reset-button"),
    saveButton: container.querySelector("#timer-save-button"),
    completeButton: container.querySelector("#timer-complete-button"),
    flash: container.querySelector("#timer-flash"),
    assignmentSelect: container.querySelector("#timer-assignment-select"),
    autoApply: container.querySelector("#timer-auto-apply"),
    focusMinutes: container.querySelector("#timer-focus-minutes"),
    shortBreakMinutes: container.querySelector("#timer-short-break-minutes"),
    longBreakMinutes: container.querySelector("#timer-long-break-minutes"),
    summary: container.querySelector("#timer-summary"),
    history: container.querySelector("#timer-history"),
    clearHistoryButton: container.querySelector("#timer-clear-history"),
    modeButtons: [...container.querySelectorAll(".timer-mode-button")],
    cycleNote: container.querySelector("#timer-cycle-note"),
  };

  loadAssignmentsAndHistory()
    .then((data) => {
      if (data.unauthorized) {
        stopInterval();
        renderSignedOut(container);
        return;
      }

      fillAssignmentOptions(data.assignments);
      if (timerState.assignmentId) {
        const selected = data.assignments.find(
          (assignment) =>
            String(assignment.id) === String(timerState.assignmentId) && !isAssignmentCompleted(assignment),
        );
        timerState.assignmentTitle = selected?.title || "";
      }
      renderHistory(data.timer);
      syncTimerView();
    })
    .catch((error) => {
      container.innerHTML = isDatabaseConnectionIssue(error.message)
        ? `
            <div class="scheduler-gate-card">
              <p class="feature-label">Study room temporarily unavailable</p>
              <h3>Your focus history will return once the database reconnects.</h3>
              <p>The app is having trouble reaching the database right now. Please refresh in a moment.</p>
            </div>
          `
        : `<div class="scheduler-empty"><p>${error.message}</p></div>`;
    });

  timerElements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      updateMode(button.dataset.mode);
      setStatus(`${formatSessionLabel(button.dataset.mode)} loaded.`);
    });
  });

  timerElements.startButton.addEventListener("click", startTimer);
  timerElements.resetButton.addEventListener("click", resetTimer);

  timerElements.saveButton.addEventListener("click", async () => {
    try {
      timerState.running = false;
      timerState.lastTickAt = null;
      stopInterval();
      await saveSession(false);
      syncTimerView();
    } catch (error) {
      setStatus(
        isDatabaseConnectionIssue(error.message)
          ? "The database is temporarily unavailable. Please refresh in a moment."
          : error.message,
        "error",
      );
    }
  });

  timerElements.completeButton.addEventListener("click", async () => {
    try {
      timerState.running = false;
      timerState.lastTickAt = null;
      timerState.remainingSeconds = 0;
      stopInterval();
      await saveSession(true);
      syncTimerView();
    } catch (error) {
      setStatus(
        isDatabaseConnectionIssue(error.message)
          ? "The database is temporarily unavailable. Please refresh in a moment."
          : error.message,
        "error",
      );
    }
  });

  timerElements.clearHistoryButton.addEventListener("click", async () => {
    if (!window.confirm("Clear your recent study history?")) {
      return;
    }

    try {
      const response = await authenticatedFetch("/api/timer/sessions", {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not clear study history.");
      }

      renderHistory(data.timer);
      setStatus("Study history cleared.", "success");
    } catch (error) {
      setStatus(
        isDatabaseConnectionIssue(error.message)
          ? "The database is temporarily unavailable. Please refresh in a moment."
          : error.message,
        "error",
      );
    }
  });

  timerElements.assignmentSelect.addEventListener("change", (event) => {
    const option = event.target.selectedOptions[0];
    timerState.assignmentId = event.target.value;
    timerState.assignmentTitle = event.target.value ? option.textContent.split(" • ")[0] : "";
    persistState();
    syncTimerView();
  });

  timerElements.autoApply.addEventListener("change", (event) => {
    timerState.autoApplyProgress = event.target.checked;
    persistState();
  });

  timerElements.focusMinutes.addEventListener("change", (event) => {
    timerState.customFocusMinutes = Number(event.target.value || 25);
    if (timerState.mode === "focus") {
      updateMode("focus");
    } else {
      persistState();
    }
  });

  timerElements.shortBreakMinutes.addEventListener("change", (event) => {
    timerState.customShortBreakMinutes = Number(event.target.value || 5);
    if (timerState.mode === "short_break") {
      updateMode("short_break");
    } else {
      persistState();
    }
  });

  timerElements.longBreakMinutes.addEventListener("change", (event) => {
    timerState.customLongBreakMinutes = Number(event.target.value || 15);
    if (timerState.mode === "long_break") {
      updateMode("long_break");
    } else {
      persistState();
    }
  });

  if (timerState.running) {
    timerIntervalId = window.setInterval(tick, 1000);
  }

  syncTimerView();
}
