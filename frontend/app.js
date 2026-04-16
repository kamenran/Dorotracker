const state = {
  token: localStorage.getItem("dorotracker-token") || "",
  user: null,
  assignments: [],
  studySessions: [],
  schedule: null,
  settings: null,
  timer: {
    intervalId: null,
    totalSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    active: false,
  },
};

const elements = {
  app: document.getElementById("app"),
  authView: document.getElementById("auth-view"),
  userView: document.getElementById("user-view"),
  authForm: document.getElementById("auth-form"),
  authName: document.getElementById("auth-name"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  userName: document.getElementById("user-name"),
  userEmail: document.getElementById("user-email"),
  logoutButton: document.getElementById("logout-button"),
  statusMessage: document.getElementById("status-message"),
  assignmentForm: document.getElementById("assignment-form"),
  assignmentId: document.getElementById("assignment-id"),
  assignmentTitle: document.getElementById("assignment-title"),
  assignmentCourse: document.getElementById("assignment-course"),
  assignmentDueDate: document.getElementById("assignment-due-date"),
  assignmentEstimatedMinutes: document.getElementById("assignment-estimated-minutes"),
  assignmentMinutesCompleted: document.getElementById("assignment-minutes-completed"),
  assignmentPriority: document.getElementById("assignment-priority"),
  assignmentReset: document.getElementById("assignment-reset"),
  assignmentList: document.getElementById("assignment-list"),
  scheduleSummary: document.getElementById("schedule-summary"),
  scheduleList: document.getElementById("schedule-list"),
  statsGrid: document.getElementById("stats-grid"),
  studySessionList: document.getElementById("study-session-list"),
  studyLogForm: document.getElementById("study-log-form"),
  studyAssignment: document.getElementById("study-assignment"),
  studyMinutes: document.getElementById("study-minutes"),
  timerAssignmentLabel: document.getElementById("timer-assignment-label"),
  timerDisplay: document.getElementById("timer-display"),
  timerStart: document.getElementById("timer-start"),
  timerPause: document.getElementById("timer-pause"),
  timerReset: document.getElementById("timer-reset"),
  settingsForm: document.getElementById("settings-form"),
  dailyLimit: document.getElementById("daily-limit"),
  minimumBlock: document.getElementById("minimum-block"),
  pomodoroLength: document.getElementById("pomodoro-length"),
  refreshButton: document.getElementById("refresh-button"),
};

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function resetAssignmentForm() {
  elements.assignmentForm.reset();
  elements.assignmentId.value = "";
  elements.assignmentMinutesCompleted.value = 0;
  elements.assignmentPriority.value = 3;
}

function renderAssignments() {
  if (!state.assignments.length) {
    elements.assignmentList.innerHTML = `<div class="card"><p>No assignments yet. Add one to generate your first schedule.</p></div>`;
  } else {
    elements.assignmentList.innerHTML = state.assignments
      .map(
        (assignment) => `
          <article class="card">
            <div class="card-header">
              <div>
                <h3>${assignment.title}</h3>
                <p>${assignment.course || "General"} · Due ${assignment.due_date}</p>
              </div>
              <span class="pill">P${assignment.priority}</span>
            </div>
            <p>${assignment.minutes_completed}/${assignment.estimated_minutes} minutes completed</p>
            <div class="card-actions">
              <button type="button" class="secondary" data-action="edit" data-id="${assignment.id}">Edit</button>
              <button type="button" class="secondary" data-action="focus" data-id="${assignment.id}">Focus</button>
              <button type="button" data-action="delete" data-id="${assignment.id}">Delete</button>
            </div>
          </article>
        `,
      )
      .join("");
  }

  elements.studyAssignment.innerHTML = state.assignments
    .map((assignment) => `<option value="${assignment.id}">${assignment.title}</option>`)
    .join("");
}

function renderSchedule() {
  if (!state.schedule) {
    elements.scheduleSummary.innerHTML = "";
    elements.scheduleList.innerHTML = "";
    return;
  }

  elements.scheduleSummary.innerHTML = `
    <div><strong>${state.schedule.summary.total_minutes_scheduled}</strong><span>minutes scheduled</span></div>
    <div><strong>${state.schedule.summary.unscheduled_minutes}</strong><span>minutes still unscheduled</span></div>
    <div><strong>${state.schedule.summary.overdue_assignment_ids.length}</strong><span>overdue assignments</span></div>
  `;

  if (!state.schedule.blocks.length) {
    elements.scheduleList.innerHTML = `<div class="card"><p>No schedule blocks yet. Add assignments first.</p></div>`;
    return;
  }

  elements.scheduleList.innerHTML = state.schedule.blocks
    .map(
      (block) => `
        <article class="card">
          <div class="card-header">
            <div>
              <h3>${block.assignment_title}</h3>
              <p>${block.scheduled_date}</p>
            </div>
            <span class="pill">${block.minutes} min · ${block.pomodoro_sessions} pomodoros</span>
          </div>
          <p>${block.is_overdue ? "Overdue work block" : "Planned study block"}</p>
        </article>
      `,
    )
    .join("");
}

function renderStats() {
  const totalAssignments = state.assignments.length;
  const completedAssignments = state.assignments.filter((assignment) => assignment.status === "completed").length;
  const totalCompletedMinutes = state.assignments.reduce(
    (total, assignment) => total + Number(assignment.minutes_completed || 0),
    0,
  );
  const totalRemainingMinutes = state.assignments.reduce(
    (total, assignment) => total + Math.max(Number(assignment.estimated_minutes) - Number(assignment.minutes_completed), 0),
    0,
  );

  elements.statsGrid.innerHTML = `
    <div class="stat-card"><span>Assignments</span><strong>${totalAssignments}</strong></div>
    <div class="stat-card"><span>Completed</span><strong>${completedAssignments}</strong></div>
    <div class="stat-card"><span>Minutes done</span><strong>${totalCompletedMinutes}</strong></div>
    <div class="stat-card"><span>Minutes left</span><strong>${totalRemainingMinutes}</strong></div>
  `;
}

function renderStudySessions() {
  if (!state.studySessions.length) {
    elements.studySessionList.innerHTML = `<div class="card"><p>No study sessions logged yet.</p></div>`;
    return;
  }
  elements.studySessionList.innerHTML = state.studySessions
    .slice(0, 6)
    .map(
      (session) => `
        <article class="card">
          <div class="card-header">
            <div>
              <h3>${session.assignment_title}</h3>
              <p>${session.completed_on}</p>
            </div>
            <span class="pill">${session.minutes_completed} min</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderAuth() {
  const signedIn = Boolean(state.token && state.user);
  elements.authView.classList.toggle("hidden", signedIn);
  elements.userView.classList.toggle("hidden", !signedIn);
  elements.app.classList.toggle("hidden", !signedIn);
  if (signedIn) {
    elements.userName.textContent = state.user.name;
    elements.userEmail.textContent = state.user.email;
  }
}

function renderSettings() {
  if (!state.settings) {
    return;
  }
  elements.dailyLimit.value = state.settings.daily_study_limit_minutes;
  elements.minimumBlock.value = state.settings.minimum_block_minutes;
  elements.pomodoroLength.value = state.settings.pomodoro_length_minutes;
  resetTimerLength();
}

function renderAll() {
  renderAuth();
  renderAssignments();
  renderSchedule();
  renderStats();
  renderStudySessions();
  renderSettings();
}

function resetTimerLength() {
  const minutes = Number(state.settings?.pomodoro_length_minutes || 25);
  state.timer.totalSeconds = minutes * 60;
  if (!state.timer.active) {
    state.timer.remainingSeconds = state.timer.totalSeconds;
  }
  renderTimer();
}

function renderTimer() {
  const minutes = String(Math.floor(state.timer.remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(state.timer.remainingSeconds % 60).padStart(2, "0");
  elements.timerDisplay.textContent = `${minutes}:${seconds}`;
}

async function loadBootstrap() {
  if (!state.token) {
    renderAll();
    return;
  }
  try {
    const data = await api("/api/bootstrap");
    state.user = data.user;
    state.assignments = data.assignments;
    state.studySessions = data.study_sessions;
    state.schedule = data.schedule;
    state.settings = data.settings;
    renderAll();
  } catch (error) {
    state.token = "";
    state.user = null;
    localStorage.removeItem("dorotracker-token");
    setStatus(error.message);
    renderAll();
  }
}

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = event.submitter?.dataset.mode || "login";
  try {
    const payload = {
      email: elements.authEmail.value,
      password: elements.authPassword.value,
    };
    if (mode === "register") {
      payload.name = elements.authName.value || "DoroTracker User";
    }
    const data = await api(`/api/${mode}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("dorotracker-token", state.token);
    setStatus(mode === "register" ? "Account created." : "Logged in.");
    await loadBootstrap();
  } catch (error) {
    setStatus(error.message);
  }
});

elements.logoutButton.addEventListener("click", () => {
  state.token = "";
  state.user = null;
  state.assignments = [];
  state.studySessions = [];
  state.schedule = null;
  state.settings = null;
  localStorage.removeItem("dorotracker-token");
  setStatus("Logged out.");
  renderAll();
});

elements.assignmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: elements.assignmentTitle.value,
    course: elements.assignmentCourse.value,
    due_date: elements.assignmentDueDate.value,
    estimated_minutes: Number(elements.assignmentEstimatedMinutes.value),
    minutes_completed: Number(elements.assignmentMinutesCompleted.value),
    priority: Number(elements.assignmentPriority.value),
  };

  try {
    if (elements.assignmentId.value) {
      await api(`/api/assignments/${elements.assignmentId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setStatus("Assignment updated.");
    } else {
      await api("/api/assignments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus("Assignment created.");
    }
    resetAssignmentForm();
    await loadBootstrap();
  } catch (error) {
    setStatus(error.message);
  }
});

elements.assignmentReset.addEventListener("click", resetAssignmentForm);

elements.assignmentList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const assignment = state.assignments.find((item) => item.id === button.dataset.id);
  if (!assignment) {
    return;
  }

  if (button.dataset.action === "edit") {
    elements.assignmentId.value = assignment.id;
    elements.assignmentTitle.value = assignment.title;
    elements.assignmentCourse.value = assignment.course;
    elements.assignmentDueDate.value = assignment.due_date;
    elements.assignmentEstimatedMinutes.value = assignment.estimated_minutes;
    elements.assignmentMinutesCompleted.value = assignment.minutes_completed;
    elements.assignmentPriority.value = assignment.priority;
    return;
  }

  if (button.dataset.action === "focus") {
    elements.studyAssignment.value = assignment.id;
    elements.timerAssignmentLabel.textContent = `Focused assignment: ${assignment.title}`;
    return;
  }

  if (button.dataset.action === "delete") {
    try {
      await api(`/api/assignments/${assignment.id}`, { method: "DELETE" });
      setStatus("Assignment deleted.");
      await loadBootstrap();
    } catch (error) {
      setStatus(error.message);
    }
  }
});

elements.studyLogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/study-sessions", {
      method: "POST",
      body: JSON.stringify({
        assignment_id: elements.studyAssignment.value,
        minutes_completed: Number(elements.studyMinutes.value || state.settings.pomodoro_length_minutes),
      }),
    });
    setStatus("Study session logged and schedule refreshed.");
    elements.studyMinutes.value = "";
    await loadBootstrap();
  } catch (error) {
    setStatus(error.message);
  }
});

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        daily_study_limit_minutes: Number(elements.dailyLimit.value),
        minimum_block_minutes: Number(elements.minimumBlock.value),
        pomodoro_length_minutes: Number(elements.pomodoroLength.value),
      }),
    });
    setStatus("Settings saved.");
    await loadBootstrap();
  } catch (error) {
    setStatus(error.message);
  }
});

elements.refreshButton.addEventListener("click", async () => {
  try {
    state.schedule = await api("/api/schedule/reschedule", { method: "POST", body: "{}" });
    setStatus("Schedule refreshed.");
    renderSchedule();
    renderStats();
  } catch (error) {
    setStatus(error.message);
  }
});

elements.timerStart.addEventListener("click", () => {
  if (state.timer.active) {
    return;
  }
  state.timer.active = true;
  state.timer.intervalId = window.setInterval(() => {
    if (state.timer.remainingSeconds <= 0) {
      window.clearInterval(state.timer.intervalId);
      state.timer.active = false;
      setStatus("Pomodoro complete. Log the session below.");
      return;
    }
    state.timer.remainingSeconds -= 1;
    renderTimer();
  }, 1000);
});

elements.timerPause.addEventListener("click", () => {
  window.clearInterval(state.timer.intervalId);
  state.timer.active = false;
});

elements.timerReset.addEventListener("click", () => {
  window.clearInterval(state.timer.intervalId);
  state.timer.active = false;
  state.timer.remainingSeconds = state.timer.totalSeconds;
  renderTimer();
});

loadBootstrap();
