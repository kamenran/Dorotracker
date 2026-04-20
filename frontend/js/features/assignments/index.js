import { authenticatedFetch } from "../auth/index.js";

function isDatabaseConnectionIssue(message) {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("enotfound") || normalized.includes("econnrefused");
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isStrictValidDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || "").trim());
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function mountAssignmentFeature(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="assignments-page">
      <form class="assignments-form" id="assignments-form">
        <div class="assignments-form-header">
          <div>
            <p class="feature-label">Assignment manager</p>
            <h3>Create, edit, update, and delete assignment records</h3>
          </div>
          <button type="button" class="secondary" id="assignments-refresh">Refresh</button>
        </div>
        <div class="assignments-form-grid">
          <label><span>Title</span><input name="title" type="text" required /></label>
          <label><span>Due date</span><input name="dueDate" type="date" required /></label>
          <label><span>Estimated minutes</span><input name="estimatedMinutes" type="number" min="15" step="15" value="120" required /></label>
          <label><span>Priority</span><input name="priority" type="number" min="1" max="5" value="3" required /></label>
          <label><span>Minutes completed</span><input name="minutesCompleted" type="number" min="0" step="5" value="0" required /></label>
        </div>
        <div class="assignments-action-row">
          <button type="submit" id="assignments-submit">Add assignment</button>
          <button type="button" class="secondary" id="assignments-cancel" hidden>Cancel edit</button>
        </div>
      </form>

      <div class="assignments-status" id="assignments-status"></div>
      <div class="assignments-list" id="assignments-list"></div>
    </div>
  `;

  const form = container.querySelector("#assignments-form");
  const list = container.querySelector("#assignments-list");
  const status = container.querySelector("#assignments-status");
  const refreshButton = container.querySelector("#assignments-refresh");
  const cancelButton = container.querySelector("#assignments-cancel");
  const submitButton = container.querySelector("#assignments-submit");
  const dueDateInput = form.elements.namedItem("dueDate");

  let assignments = [];
  let editingId = null;
  const todayDateString = getTodayDateString();

  dueDateInput.min = todayDateString;

  function renderStatus(message, tone = "neutral") {
    status.className = `assignments-status ${tone}`;
    status.textContent = message;
  }

  function resetForm() {
    editingId = null;
    form.reset();
    form.elements.namedItem("estimatedMinutes").value = "120";
    form.elements.namedItem("priority").value = "3";
    form.elements.namedItem("minutesCompleted").value = "0";
    submitButton.textContent = "Add assignment";
    cancelButton.hidden = true;
  }

  function fillForm(assignment) {
    editingId = assignment.id;
    form.elements.namedItem("title").value = assignment.title;
    form.elements.namedItem("dueDate").value = assignment.dueDate;
    form.elements.namedItem("estimatedMinutes").value = String(assignment.estimatedMinutes);
    form.elements.namedItem("priority").value = String(assignment.priority);
    form.elements.namedItem("minutesCompleted").value = String(assignment.minutesCompleted);
    submitButton.textContent = "Save changes";
    cancelButton.hidden = false;
  }

  function renderList() {
    if (!assignments.length) {
      list.innerHTML = `<p class="scheduler-empty">No assignments saved for this account yet.</p>`;
      return;
    }

    list.innerHTML = assignments
      .map((assignment) => {
        const isCompleted = Number(assignment.minutesCompleted || 0) >= Number(assignment.estimatedMinutes || 0);

        return `
          <article class="assignment-record-card ${isCompleted ? "completed" : ""}">
            <div class="assignment-record-main">
              <div>
                <p class="feature-label">Assignment</p>
                <h4>${assignment.title}</h4>
              </div>
              <div class="assignment-record-badges">
                ${isCompleted ? `<span class="assignment-status-badge">Completed</span>` : ""}
                <span>Due ${assignment.dueDate}</span>
                <span>${assignment.estimatedMinutes} min</span>
                <span>${assignment.minutesCompleted} min done</span>
                <span>Priority ${assignment.priority}</span>
              </div>
            </div>
            <div class="assignment-record-actions">
              <button type="button" class="secondary assignment-edit" data-id="${assignment.id}">Edit</button>
              <button type="button" class="secondary assignment-progress" data-id="${assignment.id}" ${isCompleted ? "disabled" : ""}>+25 min</button>
              <button type="button" class="secondary assignment-delete" data-id="${assignment.id}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadAssignments() {
    const response = await authenticatedFetch("/api/assignments");
    const data = await response.json();
    if (response.status === 401) {
      list.innerHTML = `
        <div class="scheduler-gate-card">
          <p class="feature-label">Sign in required</p>
          <h3>Open the Account page before managing assignments.</h3>
          <p>Your assignment list is tied to a signed-in user account.</p>
          <a class="hero-button" href="#auth">Go to Account</a>
        </div>
      `;
      renderStatus("Sign in first to manage assignments.", "neutral");
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "Could not load assignments.");
    }

    assignments = data.assignments || [];
    renderList();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      title: String(form.elements.namedItem("title").value || "").trim(),
      dueDate: String(form.elements.namedItem("dueDate").value || ""),
      estimatedMinutes: Number(form.elements.namedItem("estimatedMinutes").value || 0),
      priority: Number(form.elements.namedItem("priority").value || 3),
      minutesCompleted: Number(form.elements.namedItem("minutesCompleted").value || 0),
    };

    try {
      if (!payload.title) {
        throw new Error("Assignment title is required.");
      }

      if (!isStrictValidDate(payload.dueDate)) {
        throw new Error("Enter a real due date.");
      }

      if (payload.dueDate < todayDateString) {
        throw new Error("Due date cannot be in the past.");
      }

      const duplicate = assignments.find(
        (assignment) =>
          assignment.id !== editingId &&
          assignment.title.trim().toLowerCase() === payload.title.toLowerCase(),
      );

      if (duplicate) {
        throw new Error("You already have an assignment with that name.");
      }

      const response = await authenticatedFetch(editingId ? `/api/assignments/${editingId}` : "/api/assignments", {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not save assignment.");
      }

      assignments = data.assignments || [];
      renderList();
      renderStatus(editingId ? "Assignment updated." : "Assignment created.", "success");
      resetForm();
    } catch (error) {
      renderStatus(error.message, "error");
    }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const id = Number(button.dataset.id || 0);
    const assignment = assignments.find((entry) => entry.id === id);
    if (!assignment) {
      return;
    }

    try {
      if (button.classList.contains("assignment-edit")) {
        fillForm(assignment);
        renderStatus(`Editing "${assignment.title}".`, "neutral");
        return;
      }

      if (button.classList.contains("assignment-progress")) {
        const response = await authenticatedFetch(`/api/assignments/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...assignment,
            minutesCompleted: Math.min(assignment.estimatedMinutes, assignment.minutesCompleted + 25),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not update progress.");
        }
        assignments = data.assignments || [];
        renderList();
        renderStatus(`Added 25 minutes to "${assignment.title}".`, "success");
        return;
      }

      if (button.classList.contains("assignment-delete")) {
        if (!window.confirm(`Delete "${assignment.title}"?`)) {
          return;
        }

        const response = await authenticatedFetch(`/api/assignments/${id}`, {
          method: "DELETE",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not delete assignment.");
        }
        assignments = data.assignments || [];
        renderList();
        renderStatus(`Deleted "${assignment.title}".`, "success");
      }
    } catch (error) {
      renderStatus(error.message, "error");
    }
  });

  refreshButton.addEventListener("click", async () => {
    try {
      await loadAssignments();
      renderStatus("Assignments refreshed.", "neutral");
    } catch (error) {
      renderStatus(error.message, "error");
    }
  });

  cancelButton.addEventListener("click", () => {
    resetForm();
    renderStatus("Edit cancelled.", "neutral");
  });

  renderStatus("Load or create assignments from this page.", "neutral");
  loadAssignments().catch((error) => {
    if (isDatabaseConnectionIssue(error.message)) {
      list.innerHTML = `
        <div class="scheduler-gate-card">
          <p class="feature-label">Assignments temporarily unavailable</p>
          <h3>Your saved work is still there.</h3>
          <p>The app is having trouble reaching the database right now. Please refresh in a moment.</p>
        </div>
      `;
      renderStatus("The database is temporarily unavailable. Please refresh in a moment.", "error");
      return;
    }

    renderStatus(error.message, "error");
  });
}
