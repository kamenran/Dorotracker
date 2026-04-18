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
  getDatabaseMode,
  listAssignments,
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

    if (request.method === "GET" && url.pathname === "/api/assignments") {
      sendJson(response, 200, { assignments: await listAssignments() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assignments") {
      const body = await readJsonBody(request);
      const assignment = await createAssignment({
        title: body.title,
        dueDate: body.dueDate,
        estimatedMinutes: Number(body.estimatedMinutes),
        priority: Number(body.priority || 3),
      });
      sendJson(response, 201, { assignment, assignments: await listAssignments() });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/assignments/")) {
      const id = Number(url.pathname.split("/").pop());
      await deleteAssignment(id);
      sendJson(response, 200, { assignments: await listAssignments() });
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/assignments") {
      await clearAssignments();
      sendJson(response, 200, { assignments: [] });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/scheduler/generate") {
      const body = await readJsonBody(request);
      const assignments = await listAssignments();
      const result = generateSchedule({
        assignments,
        ...normalizeSchedulerPayload(body),
      });
      await saveSchedule("generate", result.blocks.map((block) => {
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
      const body = await readJsonBody(request);
      if (body.completedAssignmentId && Number(body.completedMinutes || 0) > 0) {
        await applyCompletion(body.completedAssignmentId, Number(body.completedMinutes));
      }
      const assignments = await listAssignments();
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
          await saveSchedule("reschedule", result.blocks.map((block) => {
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
