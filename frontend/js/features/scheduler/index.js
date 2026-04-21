import { authenticatedFetch } from "../auth/index.js";

const SCHEDULER_DIRTY_KEY = "dorotracker.schedulerDirty";

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function isDatabaseConnectionIssue(message) {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("enotfound") || normalized.includes("econnrefused");
}

function formatFriendlyDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatPomodoroLabel(minutes, pomodoros) {
  if (Number(pomodoros || 0) <= 0) {
    return `${minutes} min focus block`;
  }

  return `${pomodoros} ${pomodoros === 1 ? "Pomodoro" : "Pomodoros"}`;
}

function isAssignmentCompleted(assignment) {
  return Number(assignment.minutesCompleted || 0) >= Number(assignment.estimatedMinutes || 0);
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function isDateBlocked(dateString, commitments = []) {
  const date = new Date(`${dateString}T12:00:00`);
  const weekday = date.getDay();

  return commitments.some((commitment) => {
    if (commitment.blockedDate) {
      return commitment.blockedDate === dateString;
    }

    return Number(commitment.dayOfWeek) === weekday;
  });
}

function markSchedulerDirty() {
  window.localStorage.setItem(SCHEDULER_DIRTY_KEY, "1");
}

function clearSchedulerDirty() {
  window.localStorage.removeItem(SCHEDULER_DIRTY_KEY);
}

function isSchedulerDirty() {
  return window.localStorage.getItem(SCHEDULER_DIRTY_KEY) === "1";
}

function summarizeBlocks(blocks, assignments = []) {
  const warnings = buildScheduleWarnings(blocks, assignments);

  return {
    assignmentCount: new Set(blocks.map((block) => block.assignmentTitle)).size,
    totalMinutes: blocks.reduce((total, block) => total + Number(block.minutes || 0), 0),
    overloadedAssignments: warnings.length,
  };
}

function getRemainingMinutesForAssignment(assignment) {
  return Math.max(
    Number(assignment.estimatedMinutes || 0) - Number(assignment.minutesCompleted || 0),
    0,
  );
}

function buildScheduleWarnings(blocks, assignments = []) {
  const activeAssignments = assignments.filter((assignment) => !isAssignmentCompleted(assignment));
  const scheduledMinutesByAssignment = blocks.reduce((totals, block) => {
    totals[block.assignmentTitle] = (totals[block.assignmentTitle] || 0) + Number(block.minutes || 0);
    return totals;
  }, {});

  const warnings = [];

  activeAssignments.forEach((assignment) => {
    const remainingMinutes = getRemainingMinutesForAssignment(assignment);
    const scheduledMinutes = Number(scheduledMinutesByAssignment[assignment.title] || 0);

    if (scheduledMinutes < remainingMinutes) {
      warnings.push(`${assignment.title} still has ${remainingMinutes - scheduledMinutes} unscheduled minute(s).`);
    } else if (scheduledMinutes > remainingMinutes) {
      warnings.push(`${assignment.title} is scheduled for ${scheduledMinutes - remainingMinutes} extra minute(s).`);
    }
  });

  const overdueAssignments = [...new Set(
    blocks
      .filter((block) => block.overdue)
      .map((block) => block.assignmentTitle),
  )];

  overdueAssignments.forEach((title) => {
    warnings.push(`${title} has study time scheduled after its due date.`);
  });

  return warnings;
}

function groupBlocksByDate(blocks) {
  return blocks.reduce((groups, block) => {
    if (!groups[block.scheduledDate]) {
      groups[block.scheduledDate] = [];
    }

    groups[block.scheduledDate].push(block);
    return groups;
  }, {});
}

function getWeekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function formatWeekRange(dateString) {
  const start = new Date(`${dateString}T12:00:00`);
  const end = new Date(`${dateString}T12:00:00`);
  end.setDate(end.getDate() + 6);

  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

function computePomodoroCount(minutes, pomodoroLength) {
  return Math.max(Math.ceil(Number(minutes || 0) / Math.max(Number(pomodoroLength || 25), 1)), 1);
}

function renderDayResults(result) {
  const blocksByDate = groupBlocksByDate(result.blocks);

  return result.blocks.length
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
                        <div class="scheduler-block-actions">
                          <button type="button" class="secondary scheduler-edit-block" data-edit-block="${block.clientKey}">Edit block</button>
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
}

function renderWeekResults(result) {
  const blocksByWeek = result.blocks.reduce((groups, block) => {
    const weekKey = getWeekStart(block.scheduledDate);
    if (!groups[weekKey]) {
      groups[weekKey] = [];
    }
    groups[weekKey].push(block);
    return groups;
  }, {});

  return result.blocks.length
    ? Object.entries(blocksByWeek)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([weekKey, blocks]) => {
          const blocksByDate = groupBlocksByDate(blocks);
          return `
            <article class="scheduler-week-card">
              <div class="scheduler-day-header">
                <p>Week of ${formatWeekRange(weekKey)}</p>
                <span>${blocks.reduce((total, block) => total + block.minutes, 0)} min planned</span>
              </div>
              <div class="scheduler-week-grid">
                ${Object.entries(blocksByDate)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(
                    ([date, dayBlocks]) => `
                      <div class="scheduler-week-day">
                        <strong>${formatFriendlyDate(date)}</strong>
                        <span>${dayBlocks.reduce((total, block) => total + block.minutes, 0)} min</span>
                        <div class="scheduler-week-list">
                          ${dayBlocks
                            .map(
                              (block) => `
                                <div class="scheduler-week-item">
                                  <span>${block.assignmentTitle}</span>
                                  <span>${block.minutes} min • ${block.pomodoros} ${block.pomodoros === 1 ? "Pomodoro" : "Pomodoros"}</span>
                                </div>
                              `,
                            )
                            .join("")}
                        </div>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="scheduler-empty">No study blocks generated yet.</p>`;
}

function renderError(target, message) {
  target.innerHTML = isDatabaseConnectionIssue(message)
    ? `
        <div class="scheduler-gate-card">
          <p class="feature-label">Planner temporarily unavailable</p>
          <h3>Your schedule will come back once the connection does.</h3>
          <p>The app is having trouble reaching the database right now. Please refresh in a moment.</p>
        </div>
      `
    : `<p class="scheduler-empty">${message}</p>`;
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
  let schedulerCommitments = [];
  let currentBlocks = [];
  let currentWarnings = [];
  let viewMode = "day";
  const todayDateString = getTodayDateString();

  container.insertAdjacentHTML(
    "beforeend",
    `
      <section class="scheduler-source-card">
        <div>
          <p class="feature-label">Assignment source</p>
          <h3>Build your task list in Assignments, then plan it here.</h3>
          <p class="scheduler-source-copy">
            This page reads your saved assignments and turns them into a study plan. If you need to add,
            edit, or delete work, use the Assignments page first.
          </p>
        </div>
        <div class="scheduler-source-actions">
          <a class="hero-button" href="#assignments">Open Assignments</a>
        </div>
      </section>
      <form class="scheduler-form" id="scheduler-form">
        <div class="scheduler-form-copy">
          <p class="scheduler-helper">
            Generate schedule creates a plan from your saved assignments. Then use the reschedule controls to tell the planner
            whether you completed work or missed work, and it will rebuild the plan from that update.
          </p>
        </div>
        <label>
          <span>Start date</span>
          <input name="startDate" type="date" value="${todayDateString}" min="${todayDateString}" />
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
        </div>
      </form>
      <div class="scheduler-assignment-summary" id="scheduler-assignment-summary"></div>
      <section class="scheduler-commitments-card">
        <div class="scheduler-assignment-summary-header">
          <div>
            <p class="feature-label">Availability and commitments</p>
            <h3>Block out days the planner should avoid</h3>
          </div>
          <span class="scheduler-results-caption">Use weekly patterns or one-time blocked dates.</span>
        </div>
        <form class="scheduler-commitments-form" id="commitments-form">
          <label>
            <span>Type</span>
            <select name="type" id="commitment-type">
              <option value="weekday">Weekly</option>
              <option value="date">Specific date</option>
            </select>
          </label>
          <label>
            <span>Label</span>
            <input name="label" type="text" value="Busy" required />
          </label>
          <label id="commitment-weekday-label">
            <span>Weekday</span>
            <select name="dayOfWeek">
              ${WEEKDAY_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}
            </select>
          </label>
          <label id="commitment-date-label" hidden>
            <span>Blocked date</span>
            <input name="blockedDate" type="date" min="${todayDateString}" />
          </label>
          <div class="scheduler-action-row">
            <button type="submit">Save commitment</button>
          </div>
        </form>
        <div class="assignments-status" id="commitments-status"></div>
        <div class="scheduler-commitments-list" id="commitments-list"></div>
      </section>
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
      <div class="scheduler-results-header">
        <div>
          <p class="feature-label">Study plan</p>
          <h3>Your schedule at a glance</h3>
        </div>
        <div class="scheduler-results-actions">
          <div class="scheduler-view-toggle">
            <button type="button" class="secondary is-active" data-view="day">Day</button>
            <button type="button" class="secondary" data-view="week">Week</button>
          </div>
          <button type="button" class="secondary" id="scheduler-refresh">Refresh</button>
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
  const commitmentsForm = container.querySelector("#commitments-form");
  const commitmentsStatus = container.querySelector("#commitments-status");
  const commitmentsList = container.querySelector("#commitments-list");
  const commitmentType = container.querySelector("#commitment-type");
  const commitmentWeekdayLabel = container.querySelector("#commitment-weekday-label");
  const commitmentDateLabel = container.querySelector("#commitment-date-label");
  const viewButtons = [...container.querySelectorAll(".scheduler-view-toggle button")];
  let blockSerial = 0;

  function stampBlocks(blocks) {
    return (blocks || []).map((block) => ({
      ...block,
      clientKey: block.clientKey || `block-${Date.now()}-${blockSerial += 1}`,
    }));
  }

  function renderResults() {
    const summary = summarizeBlocks(currentBlocks, schedulerAssignments);
    const warningMarkup = currentWarnings.length
      ? `<div class="scheduler-warnings">${currentWarnings.map((warning) => `<p>${warning}</p>`).join("")}</div>`
      : `<p class="scheduler-ok">No overload warnings.</p>`;

    const boardMarkup = viewMode === "week"
      ? renderWeekResults({ blocks: currentBlocks })
      : renderDayResults({ blocks: currentBlocks });

    output.innerHTML = `
      <div class="scheduler-results-shell">
        <div class="scheduler-summary">
          <div><strong>${summary.assignmentCount}</strong><span>assignments</span></div>
          <div><strong>${summary.totalMinutes}</strong><span>minutes planned</span></div>
          <div><strong>${summary.overloadedAssignments}</strong><span>warnings</span></div>
        </div>
        ${warningMarkup}
        <div class="scheduler-results-board">${boardMarkup}</div>
      </div>
    `;

    output.querySelectorAll(".scheduler-edit-block").forEach((button) => {
      button.addEventListener("click", () => {
        editBlock(button.dataset.editBlock);
      });
    });
  }

  function renderCommitmentsStatus(message, tone = "neutral") {
    commitmentsStatus.className = `assignments-status ${tone}`;
    commitmentsStatus.textContent = message;
  }

  function renderCommitments() {
    if (!schedulerCommitments.length) {
      commitmentsList.innerHTML = `<p class="scheduler-empty">No blocked days saved yet.</p>`;
      return;
    }

    commitmentsList.innerHTML = schedulerCommitments
      .map((commitment) => {
        const description = commitment.type === "date"
          ? `${commitment.label} on ${formatFriendlyDate(commitment.blockedDate)}`
          : `${commitment.label} every ${WEEKDAY_OPTIONS.find((option) => option.value === Number(commitment.dayOfWeek))?.label || "day"}`;

        return `
          <article class="scheduler-assignment-chip">
            <strong>${description}</strong>
            <button type="button" class="secondary commitment-delete" data-id="${commitment.id}">Delete</button>
          </article>
        `;
      })
      .join("");
  }

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

  async function saveManualBlocks() {
    const response = await authenticatedFetch("/api/scheduler/manual-save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blocks: currentBlocks,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not save the edited schedule.");
    }

    currentBlocks = stampBlocks(data.blocks || currentBlocks);
    clearSchedulerDirty();
  }

  async function editBlock(blockKey) {
    const block = currentBlocks.find((entry) => entry.clientKey === blockKey);
    if (!block) {
      return;
    }

    const assignment = schedulerAssignments.find((entry) => entry.title === block.assignmentTitle);
    const otherScheduledMinutes = currentBlocks.reduce(
      (total, entry) =>
        entry.clientKey !== blockKey && entry.assignmentTitle === block.assignmentTitle
          ? total + Number(entry.minutes || 0)
          : total,
      0,
    );
    const maxMinutes = assignment
      ? Math.max(getRemainingMinutesForAssignment(assignment) - otherScheduledMinutes, 0)
      : Number.MAX_SAFE_INTEGER;

    const nextDate = window.prompt("Move this study block to which date? (YYYY-MM-DD)", block.scheduledDate);
    if (nextDate === null) {
      return;
    }

    const trimmedDate = String(nextDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      renderError(output, "Enter the new block date in YYYY-MM-DD format.");
      return;
    }

    if (isDateBlocked(trimmedDate, schedulerCommitments)) {
      renderError(output, "That day is blocked by one of your saved commitments.");
      return;
    }

    const nextMinutes = window.prompt("How many minutes should this study block use?", String(block.minutes));
    if (nextMinutes === null) {
      return;
    }

    const parsedMinutes = Number(nextMinutes || 0);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      renderError(output, "Enter a positive number of minutes for the study block.");
      return;
    }

    if (parsedMinutes > maxMinutes) {
      renderError(
        output,
        `This block cannot exceed ${maxMinutes} minute${maxMinutes === 1 ? "" : "s"} based on the assignment's remaining total.`,
      );
      return;
    }

    currentBlocks = currentBlocks.map((entry) =>
      entry.clientKey === blockKey
        ? {
            ...entry,
            scheduledDate: trimmedDate,
            minutes: parsedMinutes,
            pomodoros: computePomodoroCount(parsedMinutes, readSettings().pomodoroLength),
            overdue: trimmedDate > entry.dueDate,
          }
        : entry,
    );

    try {
      await saveManualBlocks();
      currentWarnings = buildScheduleWarnings(currentBlocks, schedulerAssignments);
      renderResults();
    } catch (error) {
      renderError(output, error.message);
    }
  }

  async function fetchAssignments() {
    const response = await authenticatedFetch("/api/assignments");
    if (response.status === 401) {
      schedulerAssignments.length = 0;
      renderAssignmentSummary();
      renderSignedOutState(output);
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load assignments.");
    }

    return data;
  }

  async function fetchCommitments() {
    const response = await authenticatedFetch("/api/commitments");
    if (response.status === 401) {
      schedulerCommitments = [];
      renderCommitments();
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load commitments.");
    }

    return data.commitments || [];
  }

  async function fetchLatestSchedule() {
    const response = await authenticatedFetch("/api/scheduler/latest");
    if (response.status === 401) {
      schedulerAssignments.length = 0;
      renderAssignmentSummary();
      renderSignedOutState(output);
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load the latest schedule.");
    }

    return data.blocks || [];
  }

  function readAssignments() {
    return [...schedulerAssignments];
  }

  async function refreshPlanner({ regenerate = false } = {}) {
    const [assignmentData, commitments] = await Promise.all([fetchAssignments(), fetchCommitments()]);
    if (!assignmentData) {
      return;
    }

    schedulerAssignments.splice(0, schedulerAssignments.length, ...(assignmentData.assignments || []));
    schedulerCommitments = commitments || [];
    renderAssignmentSummary();
    renderCommitments();

    if (!schedulerAssignments.length) {
      renderError(output, "Add at least one assignment on the Assignments page before generating a schedule.");
      return;
    }

    if (regenerate) {
      const result = await postScheduler("/api/scheduler/generate", {
        ...readSettings(),
      });
      currentBlocks = stampBlocks(result.blocks || []);
      currentWarnings = buildScheduleWarnings(currentBlocks, schedulerAssignments);
      clearSchedulerDirty();
      renderResults();
      return;
    }

    const latestBlocks = await fetchLatestSchedule();
    if (!latestBlocks || !latestBlocks.length) {
      renderError(output, "Generate a schedule to see your latest study plan.");
      return;
    }

    currentBlocks = stampBlocks(latestBlocks);
    currentWarnings = buildScheduleWarnings(currentBlocks, schedulerAssignments);
    renderResults();
  }

  function renderAssignmentSummary() {
    const activeAssignments = schedulerAssignments.filter((assignment) => !isAssignmentCompleted(assignment));

    if (!schedulerAssignments.length) {
      assignmentSummary.innerHTML = `
        <div class="scheduler-empty">
          <p>No assignments saved yet. Add your first assignment on the Assignments page, then come back here.</p>
        </div>
      `;
      syncRescheduleAssignments([]);
      return;
    }

    if (!activeAssignments.length) {
      assignmentSummary.innerHTML = `
        <div class="scheduler-empty">
          <p>All saved assignments are completed. Add a new assignment or update an existing one to build a fresh plan.</p>
        </div>
      `;
      syncRescheduleAssignments([]);
      return;
    }

    assignmentSummary.innerHTML = `
      <div class="scheduler-assignment-summary-header">
        <div>
          <p class="feature-label">Planner input</p>
          <h3>${activeAssignments.length} active ${activeAssignments.length === 1 ? "assignment" : "assignments"}</h3>
        </div>
        <span class="scheduler-results-caption">These are the items the scheduler will use for generate and reschedule.</span>
      </div>
      <div class="scheduler-assignment-summary-grid">
        ${activeAssignments
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

    syncRescheduleAssignments(activeAssignments);
  }

  function syncRescheduleAssignments(assignments) {
    rescheduleAssignment.innerHTML = assignments.length
      ? assignments.map((assignment) => `<option value="${assignment.id}">${assignment.title}</option>`).join("")
      : `<option value="">No assignments yet</option>`;
  }

  function readSettings() {
    const formData = new FormData(form);
    const requestedStartDate = String(formData.get("startDate") || "");
    const normalizedStartDate = requestedStartDate && requestedStartDate >= todayDateString ? requestedStartDate : todayDateString;

    return {
      startDate: normalizedStartDate,
      dailyStudyLimit: Number(formData.get("dailyLimit") || 180),
      minimumBlock: Number(formData.get("minimumBlock") || 30),
      pomodoroLength: Number(formData.get("pomodoroLength") || 25),
      deadlineBufferDays: 1,
    };
  }

  function syncCommitmentFieldVisibility() {
    const showDate = commitmentType.value === "date";
    commitmentDateLabel.hidden = !showDate;
    commitmentWeekdayLabel.hidden = showDate;

    if (showDate) {
      commitmentsForm.elements.namedItem("dayOfWeek").value = "0";
    } else {
      commitmentsForm.elements.namedItem("blockedDate").value = "";
    }
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
      currentBlocks = stampBlocks(result.blocks || []);
      currentWarnings = buildScheduleWarnings(currentBlocks, schedulerAssignments);
      clearSchedulerDirty();
      renderResults();
    } catch (error) {
      renderError(output, error.message);
    }
  });

  commitmentsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(commitmentsForm);

    try {
      const response = await authenticatedFetch("/api/commitments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: String(formData.get("type") || ""),
          label: String(formData.get("label") || "").trim(),
          dayOfWeek: Number(formData.get("dayOfWeek") || 0),
          blockedDate: String(formData.get("blockedDate") || ""),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not save commitment.");
      }

      schedulerCommitments = data.commitments || [];
      renderCommitments();
      renderCommitmentsStatus("Commitment saved.", "success");
      markSchedulerDirty();
      commitmentsForm.reset();
      commitmentsForm.elements.namedItem("label").value = "Busy";
      commitmentType.value = "weekday";
      syncCommitmentFieldVisibility();
    } catch (error) {
      renderCommitmentsStatus(error.message, "error");
    }
  });

  commitmentsList.addEventListener("click", async (event) => {
    const button = event.target.closest(".commitment-delete");
    if (!button) {
      return;
    }

    if (!window.confirm("Delete this blocked-day commitment?")) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/commitments/${button.dataset.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not delete commitment.");
      }

      schedulerCommitments = data.commitments || [];
      renderCommitments();
      renderCommitmentsStatus("Commitment deleted.", "success");
      markSchedulerDirty();
    } catch (error) {
      renderCommitmentsStatus(error.message, "error");
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
      const refreshedAssignments = await fetchAssignments();
      if (refreshedAssignments) {
        schedulerAssignments.splice(0, schedulerAssignments.length, ...(refreshedAssignments.assignments || []));
        renderAssignmentSummary();
      }
      currentBlocks = stampBlocks(result.blocks || []);
      currentWarnings = buildScheduleWarnings(currentBlocks, schedulerAssignments);
      clearSchedulerDirty();
      renderResults();
    } catch (error) {
      renderError(output, error.message);
    }
  });

  refreshButton.addEventListener("click", async () => {
    try {
      await refreshPlanner({ regenerate: isSchedulerDirty() });
    } catch (error) {
      renderError(output, error.message);
    }
  });

  commitmentType.addEventListener("change", syncCommitmentFieldVisibility);

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      viewMode = button.dataset.view;
      viewButtons.forEach((entry) => entry.classList.toggle("is-active", entry === button));
      if (currentBlocks.length) {
        renderResults();
      }
    });
  });

  syncCommitmentFieldVisibility();
  renderCommitmentsStatus("Save blocked days here if you want the planner to work around them.", "neutral");
  refreshPlanner().catch((error) => {
    renderError(output, error.message);
  });
}
