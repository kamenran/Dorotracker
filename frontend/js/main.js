import { mountAuthFeature } from "./features/auth/index.js";
import { mountAssignmentFeature } from "./features/assignments/index.js";
import { authenticatedFetch } from "./features/auth/index.js";
import { mountSchedulerFeature } from "./features/scheduler/index.js";
import { mountTimerFeature } from "./features/timer/index.js";

const routes = {
  home: renderHomePage,
  scheduler: renderSchedulerPage,
  assignments: renderAssignmentsPage,
  timer: renderTimerPage,
  auth: renderAuthPage,
};

const IDLE_LOGOUT_MINUTES = 20;
const ACTIVITY_KEY = "dorotracker.lastActivityAt";
const IDLE_NOTICE_KEY = "dorotracker.idleNotice";
const SCHEDULER_DIRTY_KEY = "dorotracker.schedulerDirty";

let timeIntervalId = null;
let idleIntervalId = null;

function isDatabaseConnectionIssue(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("database unavailable") ||
    normalized.includes("could not load dashboard")
  );
}

function getSessionToken() {
  return window.localStorage.getItem("dorotracker.sessionToken") || "";
}

function clearLocalSession() {
  window.localStorage.removeItem("dorotracker.sessionToken");
  window.localStorage.removeItem("dorotracker.user");
  window.localStorage.removeItem(SCHEDULER_DIRTY_KEY);
}

function markActivity() {
  if (!getSessionToken()) {
    return;
  }

  window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}

async function forceIdleLogout() {
  if (!getSessionToken()) {
    return;
  }

  try {
    await authenticatedFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Best effort only.
  }

  clearLocalSession();
  window.localStorage.setItem(
    IDLE_NOTICE_KEY,
    "You were signed out after being inactive for 20 minutes.",
  );
  renderRoute();
}

function readStoredFirstName() {
  const rawUser = window.localStorage.getItem("dorotracker.user");
  if (!rawUser) {
    return "";
  }

  try {
    const user = JSON.parse(rawUser);
    return String(user.fullName || "").trim().split(/\s+/)[0] || "";
  } catch {
    return "";
  }
}

function databasePlaceholder(title) {
  return `
    <h2>${title}</h2>
    <p>The planner is having trouble reaching the database right now. Please refresh in a moment.</p>
  `;
}

function pageFrame(title, description, route, content = "") {
  return `
    <section class="page-view">
      <header class="page-hero">
        <p class="feature-label">${route}</p>
        <h1>${title}</h1>
        <p>${description}</p>
      </header>
      <section class="page-panel" id="page-panel">
        <div class="page-utility-grid">
          <section class="feature-card" id="page-alerts">
            <p class="feature-label">Alerts</p>
            <h2>Planner reminders</h2>
            <p>Loading your latest reminders...</p>
          </section>
          <section class="feature-card">
            <p class="feature-label">Quick start</p>
            ${renderHelpContent(route)}
          </section>
        </div>
        ${content}
      </section>
    </section>
  `;
}

function renderHelpContent(route) {
  const help = {
    scheduler: {
      title: "How to use the planner",
      points: [
        "Add assignments first, then generate a study plan.",
        "Use commitments to block out workdays or unavailable dates.",
        "If your progress changes, click refresh to rebuild the plan.",
        "Use Edit block when you want to manually move or resize one study block.",
      ],
    },
    assignments: {
      title: "How to manage assignments",
      points: [
        "Create one assignment at a time with a valid future due date.",
        "Priority and estimated minutes feed directly into the scheduler.",
        "Minutes completed should reflect progress out of the estimated total.",
        "Delete and edit actions are confirmed so you do not lose data by accident.",
      ],
    },
    timer: {
      title: "How the study room works",
      points: [
        "Choose a focus or break session and start the timer.",
        "Link focus sessions to an unfinished assignment when you want progress tracked.",
        "Save partial or completed focus sessions to update study history.",
        "The scheduler refresh will rebuild using your latest saved progress.",
      ],
    },
    auth: {
      title: "How account tools work",
      points: [
        "Register or sign in to keep all planner data private to your account.",
        "Use profile tools to update your name or email.",
        "Reset password requires your current password first.",
        "Idle sessions now sign out automatically after 20 minutes of inactivity.",
      ],
    },
    home: {
      title: "How to use DoroTracker",
      points: [
        "Start with Account so your planner, assignments, and sessions stay tied to your own profile.",
        "Use Assignments to add your work one item at a time with a due date, priority, and estimated time.",
        "Open Scheduler to generate a study plan, then refresh it whenever your assignments or availability change.",
        "Use Pomodoro to log focus sessions and keep your assignment progress moving forward.",
      ],
    },
  };

  const selected = help[route] || help.home;

  return `
    <h2>${selected.title}</h2>
    <div class="help-list">
      ${selected.points.map((point) => `<p>${point}</p>`).join("")}
    </div>
  `;
}

function renderHomePage(app) {
  const firstName = readStoredFirstName();
  const plannerTitle = firstName ? `${firstName}'s Planner` : "Your Planner";

  app.innerHTML = `
    <section class="home-hero">
      <div class="home-copy">
        <p class="eyebrow">Study planner</p>
        <h1>A calmer way to plan, study, and adjust.</h1>
        <p class="hero-copy">
          DoroTracker combines assignment tracking, study scheduling, rescheduling, and Pomodoro flow in one minimal workspace.
        </p>
        <div class="home-actions">
          <a class="hero-button" href="#scheduler">Open Scheduler</a>
        </div>
      </div>
      <div class="home-spotlight">
        <div class="spotlight-card">
          <p class="feature-label">Dashboard</p>
          <div id="home-dashboard">
            <h2>${plannerTitle}</h2>
            <p>Loading your latest planner details...</p>
          </div>
        </div>
      </div>
    </section>
    <section class="page-utility-grid home-utility-grid">
      <section class="feature-card" id="page-alerts">
        <p class="feature-label">Alerts</p>
        <h2>Planner reminders</h2>
        <p>Loading your latest reminders...</p>
      </section>
      <section class="feature-card">
        <p class="feature-label">Quick start</p>
        ${renderHelpContent("home")}
      </section>
    </section>
  `;

  loadHomeDashboard();
  loadPageAlerts();
}

function renderSchedulerPage(app) {
  app.innerHTML = pageFrame(
    "Scheduler and Rescheduler",
    "Add assignments, generate a study plan, and reschedule after completed or missed work.",
    "scheduler",
  );

  mountSchedulerFeature(document.getElementById("page-panel"));
  loadPageAlerts();
}

function renderAssignmentsPage(app) {
  app.innerHTML = pageFrame(
    "Assignments",
    "This page is reserved for the dedicated assignment management experience.",
    "assignments",
  );

  mountAssignmentFeature(document.getElementById("page-panel"));
  loadPageAlerts();
}

function renderTimerPage(app) {
  app.innerHTML = pageFrame(
    "Pomodoro and Progress",
    "Run focus and break sessions, save study history to MySQL, and make the app feel like your actual study companion.",
    "pomodoro",
  );

  mountTimerFeature(document.getElementById("page-panel"));
  loadPageAlerts();
}

function renderAuthPage(app) {
  app.innerHTML = pageFrame(
    "Account",
    "This page is reserved for sign in, registration, and account management.",
    "account",
  );

  mountAuthFeature(document.getElementById("page-panel"));
  loadPageAlerts();
}

function renderRoute() {
  const route = window.location.hash.replace("#", "") || "home";
  const app = document.getElementById("app");
  const render = routes[route] || routes.home;
  render(app);
}

function updateClock() {
  const timeNode = document.getElementById("site-time");
  const dateNode = document.getElementById("site-date");
  if (!timeNode || !dateNode) {
    return;
  }

  const now = new Date();
  timeNode.textContent = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  dateNode.textContent = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function mountClock() {
  updateClock();
  if (timeIntervalId) {
    window.clearInterval(timeIntervalId);
  }
  timeIntervalId = window.setInterval(updateClock, 1000);
}

function renderAlerts(target, data) {
  if (!target) {
    return;
  }

  const dueSoon = (data.upcomingAssignments || []).filter((assignment) => {
    const due = new Date(`${assignment.dueDate}T12:00:00`);
    const now = new Date();
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 2;
  });

  const alerts = [];

  const idleNotice = window.localStorage.getItem(IDLE_NOTICE_KEY);
  if (idleNotice) {
    alerts.push({ tone: "warning", title: "Security reminder", body: idleNotice });
    window.localStorage.removeItem(IDLE_NOTICE_KEY);
  }

  if (dueSoon.length) {
    alerts.push({
      tone: "warning",
      title: "Deadlines approaching",
      body: dueSoon.map((assignment) => `${assignment.title} is due ${assignment.dueDate}.`).join(" "),
    });
  }

  if ((data.todayBlocks || []).length) {
    alerts.push({
      tone: "info",
      title: "Today's study plan",
      body: `${data.todayBlocks.length} study block${data.todayBlocks.length === 1 ? " is" : "s are"} planned for today.`,
    });
  }

  if (Number(data.summary?.todayStudyMinutes || 0) > 240) {
    alerts.push({
      tone: "warning",
      title: "Heavy workload",
      body: `You have ${data.summary.todayStudyMinutes} minutes planned today. Review your schedule if this feels too packed.`,
    });
  }

  if (!alerts.length) {
    target.innerHTML = `
      <p class="feature-label">Alerts</p>
      <h2>Planner reminders</h2>
      <p>No urgent reminders right now. Your planner is looking calm.</p>
    `;
    return;
  }

  target.innerHTML = `
    <p class="feature-label">Alerts</p>
    <h2>Planner reminders</h2>
    <div class="alert-stack">
      ${alerts
        .map(
          (alert) => `
            <article class="alert-card ${alert.tone}">
              <strong>${alert.title}</strong>
              <p>${alert.body}</p>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

async function loadPageAlerts() {
  const alertsTarget = document.getElementById("page-alerts");
  if (!alertsTarget) {
    return;
  }

  try {
    const response = await authenticatedFetch("/api/dashboard");
    if (response.status === 401) {
      const idleNotice = window.localStorage.getItem(IDLE_NOTICE_KEY);
      alertsTarget.innerHTML = `
        <p class="feature-label">Alerts</p>
        <h2>Planner reminders</h2>
        <p>${idleNotice || "Sign in to load live reminders for due dates, study sessions, and workload warnings."}</p>
      `;
      if (idleNotice) {
        window.localStorage.removeItem(IDLE_NOTICE_KEY);
      }
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load alerts.");
    }

    renderAlerts(alertsTarget, data);
  } catch (error) {
    alertsTarget.innerHTML = isDatabaseConnectionIssue(error.message)
      ? databasePlaceholder("Alerts syncing...")
      : `
          <p class="feature-label">Alerts</p>
          <h2>Planner reminders</h2>
          <p>${error.message}</p>
        `;
  }
}

async function loadHomeDashboard() {
  const dashboard = document.getElementById("home-dashboard");
  if (!dashboard) {
    return;
  }

  const firstName = readStoredFirstName();
  const plannerTitle = firstName ? `${firstName}'s Planner` : "Your Planner";

  try {
    const response = await authenticatedFetch("/api/dashboard");
    if (response.status === 401) {
      dashboard.innerHTML = `
        <h2>Sign in to load your live dashboard.</h2>
        <p>Once you sign in, this homepage shows your assignment totals, completed minutes, and today's planned study time.</p>
      `;
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load dashboard.");
    }

    dashboard.innerHTML = `
      <h2>${plannerTitle}</h2>
      <div class="home-dashboard-grid">
        <div class="home-stat-card">
          <strong>${data.summary.assignmentCount}</strong>
          <span>assignments</span>
        </div>
        <div class="home-stat-card">
          <strong>${data.summary.totalCompletedMinutes}</strong>
          <span>minutes completed</span>
        </div>
        <div class="home-stat-card">
          <strong>${data.summary.todayStudyMinutes}</strong>
          <span>minutes planned today</span>
        </div>
      </div>
      <div class="home-dashboard-list">
        <h3>Upcoming assignments</h3>
        ${
          data.upcomingAssignments.length
            ? data.upcomingAssignments
                .map(
                  (assignment) => `
                    <div class="home-dashboard-row">
                      <strong>${assignment.title}</strong>
                      <span>Due ${assignment.dueDate}</span>
                      <span>${assignment.estimatedMinutes} min</span>
                    </div>
                  `,
                )
                .join("")
            : `<p>No assignments saved yet. Open the assignments or scheduler page to add one.</p>`
        }
      </div>
    `;
  } catch (error) {
    dashboard.innerHTML = isDatabaseConnectionIssue(error.message)
      ? databasePlaceholder("Planner syncing...")
      : `
          <h2>Dashboard unavailable</h2>
          <p>${error.message}</p>
        `;
  }
}

function mountIdleLogout() {
  const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, markActivity, { passive: true });
  });

  markActivity();

  if (idleIntervalId) {
    window.clearInterval(idleIntervalId);
  }

  idleIntervalId = window.setInterval(() => {
    const token = getSessionToken();
    if (!token) {
      return;
    }

    const lastActivityAt = Number(window.localStorage.getItem(ACTIVITY_KEY) || 0);
    if (!lastActivityAt) {
      markActivity();
      return;
    }

    const idleMs = Date.now() - lastActivityAt;
    if (idleMs >= IDLE_LOGOUT_MINUTES * 60 * 1000) {
      forceIdleLogout();
    }
  }, 10000);
}

window.addEventListener("hashchange", renderRoute);
mountClock();
mountIdleLogout();
renderRoute();
