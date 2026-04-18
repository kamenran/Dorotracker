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
  getDatabaseMode,
  getSessionUser,
  loginUser,
  listAssignments,
  registerUser,
  saveSchedule,
  testConnection,
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

    if (request.method === "POST" && url.pathname === "/api/assignments") {
      const auth = await requireUser(request, response);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const assignment = await createAssignment(auth.user.id, {
        title: body.title,
        dueDate: body.dueDate,
        estimatedMinutes: Number(body.estimatedMinutes),
        priority: Number(body.priority || 3),
      });
      sendJson(response, 201, { assignment, assignments: await listAssignments(auth.user.id) });
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
          const result = reschedule({
            assignments,
            ...normalizeSchedulerPayload(body),
            missedAssignmentTitle:
              body.missedAssignmentId && selectedAssignment ? selectedAssignment.title : "",
          });
          await saveSchedule(auth.user.id, "reschedule", result.blocks.map((block) => {
            const match = assignments.find((assignment) => assignment.title === block.assignmentTitle);
            return {
              ...block,
              assignmentId: match?.id ?? null,
            };
          }));
          return result;
        })(),
      );
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
