const SCHEDULER_DIRTY_KEY = "dorotracker.schedulerDirty";

function getToken() {
  return window.localStorage.getItem("dorotracker.sessionToken") || "";
}

function saveSession(session) {
  window.localStorage.setItem("dorotracker.sessionToken", session.token);
  window.localStorage.setItem("dorotracker.user", JSON.stringify(session.user));
  window.localStorage.removeItem(SCHEDULER_DIRTY_KEY);
}

function saveUser(user) {
  window.localStorage.setItem("dorotracker.user", JSON.stringify(user));
}

function clearSession() {
  window.localStorage.removeItem("dorotracker.sessionToken");
  window.localStorage.removeItem("dorotracker.user");
  window.localStorage.removeItem(SCHEDULER_DIRTY_KEY);
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
          <p>Your password is hashed before it is stored, and your planner data stays tied to your own account session.</p>
        </div>
        <div class="auth-pill-list">
          <span>Hashed passwords</span>
          <span>MySQL user records</span>
          <span>Account controls</span>
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

      <div class="auth-status-card" id="auth-status-card"></div>
      <div class="auth-management" id="auth-management"></div>
    </div>
  `;

  const registerForm = container.querySelector("#register-form");
  const loginForm = container.querySelector("#login-form");
  const statusCard = container.querySelector("#auth-status-card");
  const management = container.querySelector("#auth-management");

  function renderMessage(message, title = "Status update") {
    statusCard.innerHTML = `
      <p class="feature-label">Session</p>
      <h3>${title}</h3>
      <p>${message}</p>
      <button type="button" class="secondary" id="auth-refresh-session">Refresh session</button>
    `;

    statusCard.querySelector("#auth-refresh-session").addEventListener("click", () => {
      renderSessionState();
    });
  }

  function renderSignedOutManagement() {
    management.innerHTML = `
      <div class="auth-card">
        <p class="feature-label">Account tools</p>
        <h3>Sign in to manage your account</h3>
        <p>Once you're signed in, you can update your profile, reset your password, and delete your account from here.</p>
      </div>
    `;
  }

  function renderSignedInManagement(user) {
    management.innerHTML = `
      <div class="auth-management-grid">
        <form class="auth-card" id="profile-form">
          <p class="feature-label">Profile</p>
          <h3>Update account info</h3>
          <label><span>Full name</span><input name="fullName" type="text" value="${user.fullName}" required /></label>
          <label><span>Email</span><input name="email" type="email" value="${user.email}" required /></label>
          <button type="submit">Save profile</button>
        </form>

        <form class="auth-card" id="password-form">
          <p class="feature-label">Password</p>
          <h3>Reset your password</h3>
          <label><span>Current password</span><input name="currentPassword" type="password" required /></label>
          <label><span>New password</span><input name="newPassword" type="password" minlength="8" required /></label>
          <button type="submit">Reset password</button>
        </form>

        <form class="auth-card auth-danger-card" id="delete-account-form">
          <p class="feature-label">Danger zone</p>
          <h3>Delete account</h3>
          <p>This removes your account, assignments, schedules, commitments, and saved sessions from MySQL.</p>
          <label><span>Password</span><input name="password" type="password" required /></label>
          <button type="submit">Delete account</button>
        </form>
      </div>
    `;

    management.querySelector("#profile-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const formData = new FormData(formElement);

      try {
        const response = await authenticatedFetch("/api/auth/me", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fullName: String(formData.get("fullName") || "").trim(),
            email: String(formData.get("email") || "").trim(),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not update your profile.");
        }

        saveUser(data.user);
        renderSessionState();
        renderMessage("Account information updated.", "Profile saved");
      } catch (error) {
        renderMessage(error.message);
      }
    });

    management.querySelector("#password-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const formData = new FormData(formElement);

      try {
        const response = await authenticatedFetch("/api/auth/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentPassword: String(formData.get("currentPassword") || ""),
            newPassword: String(formData.get("newPassword") || ""),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not reset your password.");
        }

        formElement.reset();
        renderMessage("Password reset complete.", "Password updated");
      } catch (error) {
        renderMessage(error.message);
      }
    });

    management.querySelector("#delete-account-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const formData = new FormData(formElement);
      if (!window.confirm("Delete this account and all saved planner data? This cannot be undone.")) {
        return;
      }

      try {
        const response = await authenticatedFetch("/api/auth/me", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: String(formData.get("password") || ""),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not delete your account.");
        }

        clearSession();
        renderSessionState();
        renderMessage("Your account was deleted.", "Account removed");
      } catch (error) {
        renderMessage(error.message);
      }
    });
  }

  function renderSessionState() {
    const user = readStoredUser();
    if (!user) {
      statusCard.innerHTML = `
        <p class="feature-label">Session</p>
        <h3>Not signed in yet</h3>
        <p>Create an account or sign in to use the scheduler with your own saved data.</p>
        <button type="button" class="secondary" id="auth-clear-local-session">Clear local session</button>
      `;
      statusCard.querySelector("#auth-clear-local-session").addEventListener("click", () => {
        clearSession();
        renderSessionState();
      });
      renderSignedOutManagement();
      return;
    }

    statusCard.innerHTML = `
      <p class="feature-label">Session</p>
      <h3>${user.fullName}</h3>
      <p>Signed in as ${user.email}</p>
      <div class="auth-session-facts">
        <span>Assignments are private to this account.</span>
        <span>Schedules and commitments stay tied to your login.</span>
      </div>
      <button type="button" class="secondary" id="auth-logout-button">Sign out</button>
    `;
    statusCard.querySelector("#auth-logout-button").addEventListener("click", async () => {
      await authenticatedFetch("/api/auth/logout", { method: "POST" });
      clearSession();
      renderSessionState();
    });

    renderSignedInManagement(user);
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
      renderMessage("Account created and signed in.", "Welcome");
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
      renderMessage("Signed in successfully.", "Welcome back");
    } catch (error) {
      renderMessage(error.message);
    }
  });

  renderSessionState();
}
