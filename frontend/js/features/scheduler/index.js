function renderResults(target, result) {
  const warningMarkup = result.warnings.length
    ? `<div class="scheduler-warnings">${result.warnings
        .map((warning) => `<p>${warning}</p>`)
        .join("")}</div>`
    : `<p class="scheduler-ok">No overload warnings.</p>`;

  const blockMarkup = result.blocks.length
    ? result.blocks
        .map(
          (block) => `
            <div class="scheduler-block">
              <strong>${block.assignmentTitle}</strong>
              <span>${block.scheduledDate}</span>
              <span>${block.minutes} min</span>
              <span>${block.pomodoros} pomodoros</span>
            </div>
          `,
        )
        .join("")
    : `<p class="scheduler-empty">No study blocks generated yet.</p>`;

  target.innerHTML = `
    <div class="scheduler-summary">
      <div><strong>${result.summary.assignmentCount}</strong><span>assignments</span></div>
      <div><strong>${result.summary.totalMinutes}</strong><span>minutes</span></div>
      <div><strong>${result.summary.overloadedAssignments}</strong><span>warnings</span></div>
    </div>
    ${warningMarkup}
    <div class="scheduler-results-list">${blockMarkup}</div>
  `;
}

function renderError(target, message) {
  target.innerHTML = `<p class="scheduler-empty">${message}</p>`;
}

export function mountSchedulerFeature(container) {
  if (!container) {
    return;
  }

  const schedulerAssignments = [];

  container.insertAdjacentHTML(
    "beforeend",
    `
      <form class="scheduler-assignment-form" id="scheduler-assignment-form">
        <p class="scheduler-helper">
          Add one assignment at a time. Build your assignment list first, then generate or reschedule the plan.
        </p>
        <label>
          <span>Assignment title</span>
          <input name="title" type="text" placeholder="Ex: Database Project" />
        </label>
        <label>
          <span>Due date</span>
          <input name="dueDate" type="date" />
        </label>
        <label>
          <span>Estimated minutes</span>
          <input name="estimatedMinutes" type="number" value="120" min="30" step="15" />
        </label>
        <label>
          <span>Priority</span>
          <input name="priority" type="number" value="3" min="1" max="5" />
        </label>
        <div class="scheduler-action-row">
          <button type="submit">Add assignment</button>
          <button type="button" class="secondary" id="clear-button">Clear assignments</button>
        </div>
      </form>
      <div class="scheduler-assignment-list" id="scheduler-assignment-list"></div>
      <form class="scheduler-form" id="scheduler-form">
        <p class="scheduler-helper">
          Generate schedule creates a plan from the assignments you added. Then use the reschedule controls to tell the planner
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

  const assignmentForm = container.querySelector("#scheduler-assignment-form");
  const assignmentList = container.querySelector("#scheduler-assignment-list");
  const form = container.querySelector("#scheduler-form");
  const output = container.querySelector("#scheduler-output");
  const rescheduleButton = container.querySelector("#reschedule-button");
  const clearButton = container.querySelector("#clear-button");
  const rescheduleAssignment = container.querySelector("#reschedule-assignment");
  const rescheduleStatus = container.querySelector("#reschedule-status");
  const rescheduleMinutes = container.querySelector("#reschedule-minutes");

  async function postScheduler(path, payload) {
    const response = await fetch(path, {
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

  function readAssignments() {
    return [...schedulerAssignments];
  }

  function renderAssignmentList() {
    if (!schedulerAssignments.length) {
      assignmentList.innerHTML = `<p class="scheduler-empty">No assignments added yet.</p>`;
      syncRescheduleAssignments([]);
      return;
    }

    assignmentList.innerHTML = schedulerAssignments
      .map(
        (assignment, index) => `
          <div class="scheduler-added-assignment">
            <div>
              <strong>${assignment.title}</strong>
              <span>Due ${assignment.dueDate}</span>
              <span>${assignment.estimatedMinutes} min</span>
              <span>Priority ${assignment.priority}</span>
            </div>
            <button type="button" class="secondary scheduler-remove-button" data-index="${index}">
              Remove
            </button>
          </div>
        `,
      )
      .join("");

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

  function clearSchedulerForm() {
    schedulerAssignments.length = 0;
    assignmentForm.reset();
    output.innerHTML = `<p class="scheduler-empty">Assignments cleared. Add new values and click Generate schedule.</p>`;
    renderAssignmentList();
  }

  assignmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const formData = new FormData(assignmentForm);
      const assignment = {
        title: String(formData.get("title") || "").trim(),
        dueDate: String(formData.get("dueDate") || ""),
        estimatedMinutes: Number(formData.get("estimatedMinutes") || 0),
        priority: Number(formData.get("priority") || 3),
      };

      if (!assignment.title || !assignment.dueDate || assignment.estimatedMinutes <= 0) {
        renderError(output, "Fill out title, due date, and estimated minutes before adding an assignment.");
        return;
      }

      const result = await postScheduler("/api/assignments", assignment);
      schedulerAssignments.splice(0, schedulerAssignments.length, ...result.assignments);
      assignmentForm.reset();
      assignmentForm.elements.namedItem("estimatedMinutes").value = "120";
      assignmentForm.elements.namedItem("priority").value = "3";
      renderAssignmentList();
      renderError(output, `Added "${assignment.title}". You can add more assignments or generate a schedule now.`);
    } catch (error) {
      renderError(output, error.message);
    }
  });

  assignmentList.addEventListener("click", async (event) => {
    const button = event.target.closest(".scheduler-remove-button");
    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }

    const assignment = schedulerAssignments[index];
    if (!assignment) {
      return;
    }

    try {
      const result = await fetch(`/api/assignments/${assignment.id}`, {
        method: "DELETE",
      });
      const data = await result.json();
      if (!result.ok) {
        throw new Error(data.error || "Could not remove assignment.");
      }
      schedulerAssignments.splice(0, schedulerAssignments.length, ...data.assignments);
      renderAssignmentList();
    } catch (error) {
      renderError(output, error.message);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const assignments = readAssignments();
    if (!assignments.length) {
      output.innerHTML = `<p class="scheduler-empty">Add at least one assignment before generating a schedule.</p>`;
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
      });
      renderResults(output, result);
    } catch (error) {
      renderError(output, error.message);
    }
  });

  clearButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/assignments", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not clear assignments.");
      }
      clearSchedulerForm();
    } catch (error) {
      renderError(output, error.message);
    }
  });

  fetch("/api/assignments")
    .then((response) => response.json())
    .then((data) => {
      schedulerAssignments.splice(0, schedulerAssignments.length, ...(data.assignments || []));
      renderAssignmentList();
      if (!schedulerAssignments.length) {
        output.innerHTML = `<p class="scheduler-empty">Add at least one assignment before generating a schedule.</p>`;
        return;
      }
      return postScheduler("/api/scheduler/generate", {
        ...readSettings(),
      }).then((result) => renderResults(output, result));
    })
    .catch((error) => {
      output.innerHTML = `<p class="scheduler-empty">${error.message}</p>`;
    });
}
