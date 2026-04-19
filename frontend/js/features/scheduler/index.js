import { authenticatedFetch } from "../auth/index.js";

function formatFriendlyDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatPomodoroLabel(minutes, pomodoros) {
  const wholePomodoros = Math.floor(minutes / 25);
  const remainder = minutes % 25;

  if (remainder === 0) {
    return `${pomodoros} ${pomodoros === 1 ? "Pomodoro" : "Pomodoros"}`;
  }

  if (wholePomodoros <= 0) {
    return `${minutes} min focus block`;
  }

  return `${wholePomodoros} ${wholePomodoros === 1 ? "Pomodoro" : "Pomodoros"} + ${remainder} min`;
}

function renderResults(target, result) {
  const warningMarkup = result.warnings.length
    ? `<div class="scheduler-warnings">${result.warnings
        .map((warning) => `<p>${warning}</p>`)
        .join("")}</div>`
    : `<p class="scheduler-ok">No overload warnings.</p>`;

  const blocksByDate = result.blocks.reduce((groups, block) => {
    if (!groups[block.scheduledDate]) {
      groups[block.scheduledDate] = [];
    }

    groups[block.scheduledDate].push(block);
    return groups;
  }, {});

  const dayMarkup = result.blocks.length
    ? Object.entries(blocksByDate)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([date, blocks]) => `
            <article class="scheduler-day-card">
              <div class="scheduler-day-header">
                <p>${formatFriendlyDate(date)}</p>
                <span>${blocks.reduce((total, block) => total + block.minutes, 0)} min planned</span>
              </div>
              <div class="scheduler-day-list">
                ${blocks
                  .map(
                    (block) => `
                      <div class="scheduler-block">
                        <div class="scheduler-block-main">
                          <strong>${block.assignmentTitle}</strong>
                          <span>${block.minutes} min</span>
                        </div>
                        <div class="scheduler-block-meta">
                          <span>${formatPomodoroLabel(block.minutes, block.pomodoros)}</span>
                          <span>Due ${formatFriendlyDate(block.dueDate)}</span>
                        </div>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="scheduler-empty">No study blocks generated yet.</p>`;

  target.innerHTML = `
    <div class="scheduler-results-shell">
      <div class="scheduler-summary">
        <div><strong>${result.summary.assignmentCount}</strong><span>assignments</span></div>
        <div><strong>${result.summary.totalMinutes}</strong><span>minutes planned</span></div>
        <div><strong>${result.summary.overloadedAssignments}</strong><span>warnings</span></div>
      </div>
      ${warningMarkup}
      <div class="scheduler-results-header">
        <div>
          <p class="feature-label">Study plan</p>
          <h3>Your schedule at a glance</h3>
        </div>
        <span class="scheduler-results-caption">Grouped by day so it feels like a real plan, not a raw dump.</span>
      </div>
      <div class="scheduler-results-board">${dayMarkup}</div>
    </div>
  `;
}

function renderError(target, message) {
  target.innerHTML = `<p class="scheduler-empty">${message}</p>`;
}

function renderSignedOutState(target) {
  target.innerHTML = `
    <div class="scheduler-gate-card">
      <p class="feature-label">Sign in required</p>
      <h3>Open the Account page before using the planner.</h3>
      <p>Your assignments and schedules are now tied to a user account, so you need to register or sign in first.</p>
      <a class="hero-button" href="#auth">Go to Account</a>
    </div>
  `;
}

export function mountSchedulerFeature(container) {
  if (!container) {
    return;
  }

  const schedulerAssignments = [];

  container.insertAdjacentHTML(
    "beforeend",
    `
      <section class="scheduler-source-card">
        <div>
          <p class="feature-label">Assignment source</p>
          <h3>Build your task list in Assignments, then plan it here.</h3>
          <p class="scheduler-source-copy">
            This page reads your saved assignments from MySQL and turns them into a study plan. If you need to add,
            edit, or delete work, use the Assignments page first.
          </p>
        </div>
        <div class="scheduler-source-actions">
          <a class="hero-button" href="#assignments">Open Assignments</a>
        </div>
      </section>
      <div class="scheduler-assignment-summary" id="scheduler-assignment-summary"></div>
      <form class="scheduler-form" id="scheduler-form">
        <p class="scheduler-helper">
          Generate schedule creates a plan from your saved assignments. Then use the reschedule controls to tell the planner
          whether you completed work or missed work, and it will rebuild the plan from that update.
        </p>
        <label>
          <span>Start date</span>
          <input name="startDate" type="date" value="2026-04-18" />
        </label>
        <label>
          <span>Daily study limit</span>
          <input name="dailyLimit" type="number" value="180" min="30" step="15" />
        </label>
        <label>
          <span>Minimum block</span>
          <input name="minimumBlock" type="number" value="30" min="15" step="5" />
        </label>
        <label>
          <span>Pomodoro length</span>
          <input name="pomodoroLength" type="number" value="25" min="5" step="5" />
        </label>

        <div class="scheduler-action-row">
          <button type="submit">Generate schedule</button>
          <button type="button" class="secondary" id="scheduler-refresh">Refresh</button>
        </div>
      </form>
      <div class="scheduler-reschedule-panel">
        <p class="feature-label">Reschedule update</p>
        <div class="scheduler-reschedule-grid">
          <label>
            <span>Assignment to update</span>
            <select id="reschedule-assignment"></select>
          </label>
          <label>
            <span>What happened</span>
            <select id="reschedule-status">
              <option value="completed">I completed work</option>
              <option value="missed">I missed this work</option>
            </select>
          </label>
          <label>
            <span>Minutes involved</span>
            <input id="reschedule-minutes" type="number" value="60" min="0" step="5" />
          </label>
        </div>
        <div class="scheduler-action-row">
          <button type="button" class="secondary" id="reschedule-button">Reschedule from update</button>
        </div>
      </div>
      <div class="scheduler-output" id="scheduler-output"></div>
    `,
  );

  const assignmentSummary = container.querySelector("#scheduler-assignment-summary");
  const form = container.querySelector("#scheduler-form");
  const output = container.querySelector("#scheduler-output");
  const refreshButton = container.querySelector("#scheduler-refresh");
  const rescheduleButton = container.querySelector("#reschedule-button");
  const rescheduleAssignment = container.querySelector("#reschedule-assignment");
  const rescheduleStatus = container.querySelector("#reschedule-status");
  const rescheduleMinutes = container.querySelector("#reschedule-minutes");

  async function postScheduler(path, payload) {
    const response = await authenticatedFetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Scheduler request failed.");
    }

    return data;
  }

  async function fetchAssignments() {
    const response = await authenticatedFetch("/api/assignments");
    if (response.status === 401) {
      schedulerAssignments.length = 0;
      renderAssignmentList();
      renderSignedOutState(output);
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load assignments.");
    }

    return data;
  }

  function readAssignments() {
    return [...schedulerAssignments];
  }

  async function refreshPlanner() {
    const data = await fetchAssignments();
    if (!data) {
      return;
    }

    schedulerAssignments.splice(0, schedulerAssignments.length, ...(data.assignments || []));
    renderAssignmentSummary();

    if (!schedulerAssignments.length) {
      renderError(output, "Add at least one assignment on the Assignments page before generating a schedule.");
      return;
    }

    const result = await postScheduler("/api/scheduler/generate", {
      ...readSettings(),
    });
    renderResults(output, result);
  }

  function renderAssignmentSummary() {
    if (!schedulerAssignments.length) {
      assignmentSummary.innerHTML = `
        <div class="scheduler-empty">
          <p>No assignments saved yet. Add your first assignment on the Assignments page, then come back here.</p>
        </div>
      `;
      syncRescheduleAssignments([]);
      return;
    }

    assignmentSummary.innerHTML = `
      <div class="scheduler-assignment-summary-header">
        <div>
          <p class="feature-label">Planner input</p>
          <h3>${schedulerAssignments.length} saved ${schedulerAssignments.length === 1 ? "assignment" : "assignments"}</h3>
        </div>
        <span class="scheduler-results-caption">These are the items the scheduler will use for generate and reschedule.</span>
      </div>
      <div class="scheduler-assignment-summary-grid">
        ${schedulerAssignments
          .map(
            (assignment) => `
              <article class="scheduler-assignment-chip">
                <strong>${assignment.title}</strong>
                <span>Due ${formatFriendlyDate(assignment.dueDate)}</span>
                <span>${assignment.estimatedMinutes} min total</span>
                <span>${assignment.minutesCompleted || 0} min completed</span>
                <span>Priority ${assignment.priority}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    `;

    syncRescheduleAssignments(schedulerAssignments);
  }

  function syncRescheduleAssignments(assignments) {
    rescheduleAssignment.innerHTML = assignments.length
      ? assignments
          .map(
            (assignment) =>
              `<option value="${assignment.id}">${assignment.title}</option>`,
          )
          .join("")
      : `<option value="">No assignments yet</option>`;
  }

  function readSettings() {
    const formData = new FormData(form);
    return {
      startDate: String(formData.get("startDate") || ""),
      dailyStudyLimit: Number(formData.get("dailyLimit") || 180),
      minimumBlock: Number(formData.get("minimumBlock") || 30),
      pomodoroLength: Number(formData.get("pomodoroLength") || 25),
      deadlineBufferDays: 1,
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const assignments = readAssignments();
    if (!assignments.length) {
      renderError(output, "Add at least one assignment on the Assignments page before generating a schedule.");
      return;
    }

    try {
      const result = await postScheduler("/api/scheduler/generate", {
        ...readSettings(),
      });
      renderResults(output, result);
    } catch (error) {
      renderError(output, error.message);
    }
  });

  rescheduleButton.addEventListener("click", async () => {
    const assignments = readAssignments();
    if (!assignments.length) {
      renderError(output, "Add at least one assignment on the Assignments page before rescheduling.");
      return;
    }

    const selectedId = Number(rescheduleAssignment.value || 0);
    const status = rescheduleStatus.value;
    const minutes = Number(rescheduleMinutes.value || 0);

    try {
      const result = await postScheduler("/api/scheduler/reschedule", {
        ...readSettings(),
        completedAssignmentId: status === "completed" ? selectedId : 0,
        completedMinutes: status === "completed" ? minutes : 0,
        missedAssignmentId: status === "missed" ? selectedId : 0,
        missedMinutes: status === "missed" ? minutes : 0,
      });
      renderResults(output, result);
    } catch (error) {
      renderError(output, error.message);
    }
  });

  refreshButton.addEventListener("click", async () => {
    try {
      await refreshPlanner();
    } catch (error) {
      renderError(output, error.message);
    }
  });

  refreshPlanner().catch((error) => {
    output.innerHTML = `<p class="scheduler-empty">${error.message}</p>`;
  });
}
