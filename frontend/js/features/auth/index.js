function getToken() {
  return window.localStorage.getItem("dorotracker.sessionToken") || "";
}

function saveSession(session) {
  window.localStorage.setItem("dorotracker.sessionToken", session.token);
  window.localStorage.setItem("dorotracker.user", JSON.stringify(session.user));
}

function clearSession() {
  window.localStorage.removeItem("dorotracker.sessionToken");
  window.localStorage.removeItem("dorotracker.user");
}

function readStoredUser() {
  const storedUser = window.localStorage.getItem("dorotracker.user");
  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch {
    clearSession();
    return null;
  }
}

export function getSessionToken() {
  return getToken();
}

export async function authenticatedFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearSession();
  }

  return response;
}

export function mountAuthFeature(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-hero-card">
        <div>
          <p class="feature-label">Account security</p>
          <h3>Save your planner behind a real sign-in.</h3>
          <p>Your password is hashed before it is stored, and your assignments stay tied to your own account session.</p>
        </div>
        <div class="auth-pill-list">
          <span>Hashed passwords</span>
          <span>MySQL user records</span>
          <span>Session access</span>
        </div>
      </div>
      <div class="auth-grid">
        <form class="auth-card" id="register-form">
          <p class="feature-label">Register</p>
          <h3>Create an account</h3>
          <p>Passwords are stored as hashes in MySQL, not as plain text.</p>
          <label><span>Full name</span><input name="fullName" type="text" required /></label>
          <label><span>Email</span><input name="email" type="email" required /></label>
          <label><span>Password</span><input name="password" type="password" minlength="8" required /></label>
          <button type="submit">Create account</button>
        </form>

        <form class="auth-card" id="login-form">
          <p class="feature-label">Sign in</p>
          <h3>Access your planner</h3>
          <p>Use your email and password to load your own saved assignments and schedules.</p>
          <label><span>Email</span><input name="email" type="email" required /></label>
          <label><span>Password</span><input name="password" type="password" required /></label>
          <button type="submit">Sign in</button>
        </form>
      </div>

      <div class="auth-status-card" id="auth-status-card">
        <p class="feature-label">Session</p>
        <h3>Not signed in yet</h3>
        <p>Create an account or sign in to use the scheduler with your own saved data.</p>
        <button type="button" class="secondary" id="logout-button">Sign out</button>
      </div>
    </div>
  `;

  const registerForm = container.querySelector("#register-form");
  const loginForm = container.querySelector("#login-form");
  const statusCard = container.querySelector("#auth-status-card");
  const logoutButton = container.querySelector("#logout-button");

  function renderMessage(message) {
    statusCard.innerHTML = `
      <p class="feature-label">Session</p>
      <h3>Status update</h3>
      <p>${message}</p>
      <button type="button" class="secondary" id="logout-button">Refresh session</button>
    `;
    statusCard.querySelector("#logout-button").addEventListener("click", () => {
      renderSessionState();
    });
  }

  function renderSessionState() {
    const user = readStoredUser();
    if (!user) {
      statusCard.innerHTML = `
        <p class="feature-label">Session</p>
        <h3>Not signed in yet</h3>
        <p>Create an account or sign in to use the scheduler with your own saved data.</p>
        <button type="button" class="secondary" id="logout-button">Clear local session</button>
      `;
      statusCard.querySelector("#logout-button").addEventListener("click", async () => {
        clearSession();
        renderSessionState();
      });
      return;
    }

    statusCard.innerHTML = `
      <p class="feature-label">Session</p>
      <h3>${user.fullName}</h3>
      <p>Signed in as ${user.email}</p>
      <div class="auth-session-facts">
        <span>Assignments are private to this account.</span>
        <span>Scheduler data is tied to your login.</span>
      </div>
      <button type="button" class="secondary" id="logout-button">Sign out</button>
    `;
    statusCard.querySelector("#logout-button").addEventListener("click", async () => {
      await authenticatedFetch("/api/auth/logout", { method: "POST" });
      clearSession();
      renderSessionState();
    });
  }

  async function submitAuthForm(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    saveSession(data);
    renderSessionState();
    return data;
  }

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    try {
      await submitAuthForm("/api/auth/register", {
        fullName: String(formData.get("fullName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      registerForm.reset();
    } catch (error) {
      renderMessage(error.message);
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      await submitAuthForm("/api/auth/login", {
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      loginForm.reset();
    } catch (error) {
      renderMessage(error.message);
    }
  });

  logoutButton.addEventListener("click", async () => {
    await authenticatedFetch("/api/auth/logout", { method: "POST" });
    clearSession();
    renderSessionState();
  });

  renderSessionState();
}
