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

let timeIntervalId = null;

function isDatabaseConnectionIssue(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("database unavailable") ||
    normalized.includes("could not load dashboard")
  );
}

function databasePlaceholder(title) {
  return `
    <h2>${title}</h2>
    <p>The planner is having trouble reaching the database right now. Please refresh in a moment.</p>
  `;
}

function featureCard(route, title, description) {
  return `
    <a class="feature-launch-card" href="#${route}">
      <h3>${title}</h3>
      <p>${description}</p>
      <span>Open page</span>
    </a>
  `;
}

function getStoredFirstName() {
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

function cloudMascot(label = "Doro cloud") {
  return `
    <div class="cloud-mascot" aria-label="${label}" role="img">
      <div class="cloud-mascot-body">
        <span class="cloud-eye left"></span>
        <span class="cloud-eye right"></span>
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

function pageFrame(title, description, route, content = "") {
  return `
    <section class="page-view">
      <header class="page-hero">
        <p class="feature-label">${route}</p>
        <h1>${title}</h1>
        <p>${description}</p>
      </header>
      <section class="page-panel" id="page-panel">
        ${content}
      </section>
    </section>
  `;
}

function renderHomePage(app) {
  const firstName = getStoredFirstName();
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
  `;

  loadHomeDashboard();
}

function renderSchedulerPage(app) {
  app.innerHTML = pageFrame(
    "Scheduler and Rescheduler",
    "Add assignments, generate a study plan, and reschedule after completed or missed work.",
    "scheduler",
  );

  mountSchedulerFeature(document.getElementById("page-panel"));
}

function renderAssignmentsPage(app) {
  app.innerHTML = pageFrame(
    "Assignments",
    "This page is reserved for the dedicated assignment management experience.",
    "assignments",
  );

  mountAssignmentFeature(document.getElementById("page-panel"));
}

function renderTimerPage(app) {
  app.innerHTML = pageFrame(
    "Pomodoro and Progress",
    "Run focus and break sessions, save study history to MySQL, and make the app feel like your actual study companion.",
    "pomodoro",
  );

  mountTimerFeature(document.getElementById("page-panel"));
}

function renderAuthPage(app) {
  app.innerHTML = pageFrame(
    "Account",
    "This page is reserved for sign in, registration, and account management.",
    "account",
  );

  mountAuthFeature(document.getElementById("page-panel"));
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

async function loadHomeDashboard() {
  const dashboard = document.getElementById("home-dashboard");
  if (!dashboard) {
    return;
  }

  const firstName = getStoredFirstName();
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

window.addEventListener("hashchange", renderRoute);
mountClock();
renderRoute();
