import { mountAuthFeature } from "./features/auth/index.js";
import { mountAssignmentFeature } from "./features/assignments/index.js";
import { mountSchedulerFeature } from "./features/scheduler/index.js";
import { mountTimerFeature } from "./features/timer/index.js";

const routes = {
  home: renderHomePage,
  scheduler: renderSchedulerPage,
  assignments: renderAssignmentsPage,
  timer: renderTimerPage,
  auth: renderAuthPage,
};

function featureCard(route, title, description) {
  return `
    <a class="feature-launch-card" href="#${route}">
      <h3>${title}</h3>
      <p>${description}</p>
      <span>Open page</span>
    </a>
  `;
}

function pageFrame(title, description, route, content = "") {
  return `
    <section class="page-view">
      <a class="page-back-link" href="#home">Back to home</a>
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
  app.innerHTML = `
    <section class="home-hero">
      <div class="home-copy">
        <p class="eyebrow">Study planner</p>
        <h1>Plan your workload with less chaos.</h1>
        <p class="hero-copy">
          DoroTracker brings assignments, study sessions, rescheduling, and Pomodoro-style planning into one calmer workflow.
        </p>
        <div class="home-actions">
          <a class="hero-button" href="#scheduler">Open Scheduler</a>
          <a class="hero-link" href="#assignments">Browse feature pages</a>
        </div>
      </div>
      <div class="home-spotlight">
        <div class="spotlight-card">
          <p class="feature-label">Today</p>
          <h2>Build a schedule that actually looks usable.</h2>
          <p>
            Separate pages keep the experience clean, and the scheduler page focuses fully on adding assignments and rebuilding your plan.
          </p>
        </div>
      </div>
    </section>

    <section class="feature-launch-grid">
      ${featureCard("scheduler", "Scheduler / Rescheduler", "Generate a day-by-day study plan, then rebuild it after completed or missed work.")}
      ${featureCard("assignments", "Assignments", "Dedicated area for assignment management and future CRUD expansion.")}
      ${featureCard("timer", "Pomodoro + Progress", "Separate timer page for future focus sessions, progress history, and study tracking.")}
      ${featureCard("auth", "Account", "Account page reserved for sign in, registration, and user settings.")}
    </section>
  `;
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
    "This page is reserved for timer controls, session tracking, and progress visuals.",
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

window.addEventListener("hashchange", renderRoute);
renderRoute();
