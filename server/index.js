import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  applyCompletion,
  clearAssignments,
  createAssignment,
  deleteAssignment,
  deleteSession,
  getDashboardData,
  getDatabaseMode,
  getLatestScheduleBlocks,
  getSessionUser,
  getTimerData,
  loginUser,
  listAssignments,
  createStudySession,
  registerUser,
  saveSchedule,
  testConnection,
  updateAssignment,
} from "./db.js";
import { generateSchedule, reschedule } from "./features/scheduler/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(projectRoot, "frontend");

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
  });
  response.end(body);
}

function sendFile(response, filePath) {
  const body = fs.readFileSync(filePath);
  const extension = path.extname(filePath);
  const contentType =
    extension === ".css"
      ? "text/css; charset=utf-8"
      : extension === ".js"
        ? "application/javascript; charset=utf-8"
        : extension === ".png"
          ? "image/png"
          : extension === ".jpg" || extension === ".jpeg"
            ? "image/jpeg"
            : extension === ".svg"
              ? "image/svg+xml"
              : extension === ".ico"
                ? "image/x-icon"
        : "text/html; charset=utf-8";

  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": String(body.length),
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function readSessionToken(request) {
  const authorization = request.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers["x-session-token"] || "";
}

async function requireUser(request, response) {
  const token = readSessionToken(request);
  const user = await getSessionUser(token);
  if (!user) {
    sendJson(response, 401, { error: "You need to sign in first." });
    return null;
  }

  return { user, token };
}

function normalizeSchedulerPayload(body) {
  return {
    startDate: body.startDate,
    dailyStudyLimit: Number(body.dailyStudyLimit),
    minimumBlock: Number(body.minimumBlock),
    pomodoroLength: Number(body.pomodoroLength),
    deadlineBufferDays: Number(body.deadlineBufferDays || 1),
  };
}

function parseDateParts(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || "").trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getTodayParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function isPastDate(dateParts) {
  const today = getTodayParts();
  const numericValue = dateParts.year * 10000 + dateParts.month * 100 + dateParts.day;
  const todayValue = today.year * 10000 + today.month * 100 + today.day;
  return numericValue < todayValue;
}

function normalizeAssignmentPayload(body) {
  const title = String(body.title || "").trim();
  const dueDate = String(body.dueDate || "").trim();
  const estimatedMinutes = Number(body.estimatedMinutes);
  const priority = Number(body.priority || 3);
  const minutesCompleted = Number(body.minutesCompleted || 0);
  const parsedDate = parseDateParts(dueDate);

  if (!title) {
    throw new Error("Assignment title is required.");
  }

  if (!parsedDate) {
    throw new Error("Enter a real due date in YYYY-MM-DD format.");
  }

  if (isPastDate(parsedDate)) {
    throw new Error("Due date cannot be in the past.");
  }

  if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 15) {
    throw new Error("Estimated minutes must be at least 15.");
  }

  if (!Number.isFinite(priority) || priority < 1 || priority > 5) {
    throw new Error("Priority must be between 1 and 5.");
  }

  if (!Number.isFinite(minutesCompleted) || minutesCompleted < 0) {
    throw new Error("Minutes completed cannot be negative.");
  }

  return {
    title,
    dueDate,
    estimatedMinutes,
    priority,
    minutesCompleted: Math.min(minutesCompleted, estimatedMinutes),
  };
}

function normalizeBlocksForComparison(blocks) {
  return (blocks || []).map((block) => ({
    assignmentId: block.assignmentId ?? null,
    assignmentTitle: block.assignmentTitle,
    dueDate: block.dueDate,
    scheduledDate: block.scheduledDate,
    minutes: Number(block.minutes || 0),
    pomodoros: Number(block.pomodoros || 0),
    priority: Number(block.priority || 0),
    overdue: Boolean(block.overdue),
  }));
}

function blocksMatch(leftBlocks, rightBlocks) {
  return JSON.stringify(normalizeBlocksForComparison(leftBlocks)) === JSON.stringify(normalizeBlocksForComparison(rightBlocks));
}

function routeStatic(request, response) {
  const requestedPath = request.url === "/" ? "/index.html" : request.url;
  const resolvedPath = path.resolve(frontendRoot, `.${requestedPath}`);

  if (!resolvedPath.startsWith(frontendRoot) || !fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    sendJson(response, 404, { error: "File not found." });
    return;
  }

  sendFile(response, resolvedPath);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/health") {
      await testConnection();
      sendJson(response, 200, {
        status: "ok",
        runtime: "node",
        feature: "scheduler",
        database: getDatabaseMode(),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(request);
      if (!body.fullName || !body.email || !body.password || String(body.password).length < 8) {
        sendJson(response, 400, { error: "Full name, email, and a password with at least 8 characters are required." });
        return;
      }

      try {
        const result = await registerUser({
          fullName: String(body.fullName).trim(),
          email: String(body.email).trim(),
          password: String(body.password),
        });
        sendJson(response, 201, result);
      } catch (error) {
        if (String(error.message || "").includes("Duplicate entry")) {
          sendJson(response, 400, { error: "That email is already registered." });
          return;
        }
        throw error;
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      const result = await loginUser({
        email: String(body.email || "").trim(),
        password: String(body.password || ""),
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }

      sendJson(response, 200, { user: auth.user });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }

      await deleteSession(auth.token);
      sendJson(response, 200, { success: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/assignments") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { assignments: await listAssignments(auth.user.id) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      sendJson(response, 200, await getDashboardData(auth.user.id));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/scheduler/latest") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { blocks: await getLatestScheduleBlocks(auth.user.id) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/timer") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      sendJson(response, 200, await getTimerData(auth.user.id));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assignments") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const payload = normalizeAssignmentPayload(body);
      const assignment = await createAssignment(auth.user.id, payload);
      sendJson(response, 201, { assignment, assignments: await listAssignments(auth.user.id) });
      return;
    }

    if (request.method === "PUT" && url.pathname.startsWith("/api/assignments/")) {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      const id = Number(url.pathname.split("/").pop());
      const body = await readJsonBody(request);
      const payload = normalizeAssignmentPayload(body);
      const assignment = await updateAssignment(auth.user.id, id, payload);
      sendJson(response, 200, { assignment, assignments: await listAssignments(auth.user.id) });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/assignments/")) {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      const id = Number(url.pathname.split("/").pop());
      await deleteAssignment(auth.user.id, id);
      sendJson(response, 200, { assignments: await listAssignments(auth.user.id) });
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/assignments") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      await clearAssignments(auth.user.id);
      sendJson(response, 200, { assignments: [] });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/scheduler/generate") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const assignments = await listAssignments(auth.user.id);
      const result = generateSchedule({
        assignments,
        ...normalizeSchedulerPayload(body),
      });
      await saveSchedule(auth.user.id, "generate", result.blocks.map((block) => {
        const match = assignments.find((assignment) => assignment.title === block.assignmentTitle);
        return {
          ...block,
          assignmentId: match?.id ?? null,
        };
      }));
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/scheduler/reschedule") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      if (body.completedAssignmentId && Number(body.completedMinutes || 0) > 0) {
        await applyCompletion(auth.user.id, body.completedAssignmentId, Number(body.completedMinutes));
      }
      const assignments = await listAssignments(auth.user.id);
      const selectedAssignment = assignments.find(
        (assignment) => Number(assignment.id) === Number(body.completedAssignmentId || body.missedAssignmentId || 0),
      );
      sendJson(
        response,
        200,
        await (async () => {
          const latestBlocks = await getLatestScheduleBlocks(auth.user.id);
          const result = reschedule({
            assignments,
            ...normalizeSchedulerPayload(body),
            missedAssignmentTitle:
              body.missedAssignmentId && selectedAssignment ? selectedAssignment.title : "",
            missedMinutes: body.missedAssignmentId ? Number(body.missedMinutes || 0) : 0,
          });
          const blocksToSave = result.blocks.map((block) => {
            const match = assignments.find((assignment) => assignment.title === block.assignmentTitle);
            return {
              ...block,
              assignmentId: match?.id ?? null,
            };
          });

          if (body.missedAssignmentId && blocksMatch(latestBlocks, blocksToSave)) {
            return {
              ...result,
              warnings: [
                "That missed-work update did not change the plan because this assignment is already being scheduled as early as possible.",
                ...result.warnings,
              ],
            };
          }

          await saveSchedule(auth.user.id, "reschedule", blocksToSave);
          return result;
        })(),
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/timer/sessions") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const session = await createStudySession(auth.user.id, {
        assignmentId: Number(body.assignmentId || 0) || null,
        sessionType: ["focus", "short_break", "long_break"].includes(body.sessionType) ? body.sessionType : "focus",
        plannedMinutes: Number(body.plannedMinutes || 0),
        actualMinutes: Number(body.actualMinutes || 0),
        completed: Boolean(body.completed),
        applyToAssignment: Boolean(body.applyToAssignment),
      });
      sendJson(response, 201, {
        session,
        timer: await getTimerData(auth.user.id),
        assignments: await listAssignments(auth.user.id),
      });
      return;
    }

    if (request.method === "GET") {
      routeStatic(request, response);
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Request failed." });
  }
});

const port = config.port;
const host = config.host;

server.listen(port, host, () => {
  console.log(`DoroTracker Node server listening on http://${host}:${port}`);
});
