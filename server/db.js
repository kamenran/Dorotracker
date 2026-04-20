import fs from "node:fs";
import mysql from "mysql2/promise";
import crypto from "node:crypto";
import { config } from "./config.js";

function buildSslConfig() {
  if (config.mysqlSslCaContent) {
    return {
      ca: config.mysqlSslCaContent.replace(/\\n/g, "\n"),
      rejectUnauthorized: true,
    };
  }

  if (config.mysqlSslCa) {
    return {
      ca: fs.readFileSync(config.mysqlSslCa, "utf8"),
      rejectUnauthorized: true,
    };
  }

  return null;
}

const pool = mysql.createPool({
  ...(config.mysqlSocket
    ? { socketPath: config.mysqlSocket }
    : { host: config.mysqlHost, port: config.mysqlPort }),
  ...(buildSslConfig() ? { ssl: buildSslConfig() } : {}),
  timezone: "Z",
  user: config.mysqlUser,
  password: config.mysqlPassword,
  database: config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});


let schemaReadyPromise;

function mapAssignmentRow(row) {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.dueDate,
    estimatedMinutes: row.estimatedMinutes,
    minutesCompleted: row.minutesCompleted,
    priority: row.priority,
  };
}

function mapScheduleBlockRow(row) {
  return {
    id: row.id,
    runId: row.runId,
    assignmentTitle: row.assignmentTitle,
    dueDate: row.dueDate,
    scheduledDate: row.scheduledDate,
    minutes: row.minutes,
    pomodoros: row.pomodoros,
    priority: row.priority,
    overdue: Boolean(row.overdue),
  };
}

function mapStudySessionRow(row) {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    assignmentTitle: row.assignmentTitle,
    sessionType: row.sessionType,
    plannedMinutes: row.plannedMinutes,
    actualMinutes: row.actualMinutes,
    completed: Boolean(row.completed),
    createdAt: row.createdAt,
  };
}

function mapCommitmentRow(row) {
  return {
    id: row.id,
    label: row.label,
    type: row.blockedDate ? "date" : "weekday",
    blockedDate: row.blockedDate,
    dayOfWeek: row.dayOfWeek,
  };
}

function normalizeTitleForComparison(title) {
  return String(title || "").trim().toLowerCase();
}

function isAssignmentCompleted(assignment) {
  return Number(assignment.minutesCompleted || 0) >= Number(assignment.estimatedMinutes || 0);
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
        AND column_name = ?
    `,
    [config.mysqlDatabase, tableName, columnName],
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      session_token VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NULL,
      title VARCHAR(255) NOT NULL,
      due_date DATE NOT NULL,
      estimated_minutes INT NOT NULL,
      minutes_completed INT NOT NULL DEFAULT 0,
      priority INT NOT NULL DEFAULT 3,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_assignment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_runs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NULL,
      run_type ENUM('generate', 'reschedule') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_schedule_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_blocks (
      id INT PRIMARY KEY AUTO_INCREMENT,
      run_id INT NOT NULL,
      assignment_id INT NULL,
      assignment_title VARCHAR(255) NOT NULL,
      due_date DATE NOT NULL,
      scheduled_date DATE NOT NULL,
      minutes INT NOT NULL,
      pomodoros INT NOT NULL,
      priority INT NOT NULL,
      overdue TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_schedule_run FOREIGN KEY (run_id) REFERENCES schedule_runs(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      assignment_id INT NULL,
      assignment_title VARCHAR(255) NULL,
      session_type ENUM('focus', 'short_break', 'long_break') NOT NULL DEFAULT 'focus',
      planned_minutes INT NOT NULL,
      actual_minutes INT NOT NULL,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_study_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_study_session_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_commitments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      label VARCHAR(255) NOT NULL,
      day_of_week TINYINT NULL,
      blocked_date DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_commitment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  if (!(await columnExists("assignments", "user_id"))) {
    await pool.query("ALTER TABLE assignments ADD COLUMN user_id INT NULL AFTER id");
  }

  if (!(await columnExists("schedule_runs", "user_id"))) {
    await pool.query("ALTER TABLE schedule_runs ADD COLUMN user_id INT NULL AFTER id");
  }
}

async function ensureSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureSchema();
  }

  await schemaReadyPromise;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = String(storedHash).split(":");
  if (!salt || !originalHash) {
    return false;
  }

  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(derivedKey, "hex"));
}

export function getDatabaseMode() {
  return "mysql";
}

export async function testConnection() {
  await pool.query("SELECT 1");
  await ensureSchemaReady();
}

export async function registerUser({ fullName, email, password }) {
  await ensureSchemaReady();
  const normalizedEmail = String(email).trim().toLowerCase();
  const passwordHash = hashPassword(password);

  const [result] = await pool.execute(
    `
      INSERT INTO users (full_name, email, password_hash)
      VALUES (?, ?, ?)
    `,
    [fullName, normalizedEmail, passwordHash],
  );

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await pool.execute(
    `
      INSERT INTO user_sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `,
    [result.insertId, token, expiresAt],
  );

  return {
    token,
    user: {
      id: result.insertId,
      fullName,
      email: normalizedEmail,
    },
  };
}

export async function loginUser({ email, password }) {
  await ensureSchemaReady();
  const normalizedEmail = String(email).trim().toLowerCase();
  const [rows] = await pool.execute(
    `
      SELECT id, full_name AS fullName, email, password_hash AS passwordHash
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [normalizedEmail],
  );

  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid email or password.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await pool.execute(
    `
      INSERT INTO user_sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `,
    [user.id, token, expiresAt],
  );

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
    },
  };
}

export async function getSessionUser(token) {
  await ensureSchemaReady();
  if (!token) {
    return null;
  }

  const [rows] = await pool.execute(
    `
      SELECT
        users.id,
        users.full_name AS fullName,
        users.email
      FROM user_sessions
      JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.session_token = ?
        AND user_sessions.expires_at > NOW()
      LIMIT 1
    `,
    [token],
  );

  return rows[0] || null;
}

export async function deleteSession(token) {
  await ensureSchemaReady();
  if (!token) {
    return;
  }

  await pool.execute("DELETE FROM user_sessions WHERE session_token = ?", [token]);
}

export async function updateUserProfile(userId, { fullName, email }) {
  await ensureSchemaReady();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const [duplicates] = await pool.execute(
    `
      SELECT id
      FROM users
      WHERE email = ?
        AND id <> ?
      LIMIT 1
    `,
    [normalizedEmail, userId],
  );

  if (duplicates[0]) {
    throw new Error("That email is already registered.");
  }

  await pool.execute(
    `
      UPDATE users
      SET full_name = ?, email = ?
      WHERE id = ?
    `,
    [String(fullName || "").trim(), normalizedEmail, userId],
  );

  const [rows] = await pool.execute(
    `
      SELECT id, full_name AS fullName, email
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] || null;
}

export async function changeUserPassword(userId, { currentPassword, newPassword }) {
  await ensureSchemaReady();
  const [rows] = await pool.execute(
    `
      SELECT password_hash AS passwordHash
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  const user = rows[0];
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    throw new Error("Current password is incorrect.");
  }

  await pool.execute(
    `
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `,
    [hashPassword(newPassword), userId],
  );
}

export async function deleteUserAccount(userId, password) {
  await ensureSchemaReady();
  const [rows] = await pool.execute(
    `
      SELECT password_hash AS passwordHash
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Password is incorrect.");
  }

  await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
}

export async function listCommitments(userId) {
  await ensureSchemaReady();
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        label,
        day_of_week AS dayOfWeek,
        DATE_FORMAT(blocked_date, '%Y-%m-%d') AS blockedDate
      FROM user_commitments
      WHERE user_id = ?
      ORDER BY blocked_date IS NULL, blocked_date, day_of_week, id
    `,
    [userId],
  );

  return rows.map(mapCommitmentRow);
}

export async function createCommitment(userId, commitment) {
  await ensureSchemaReady();

  if (commitment.type === "date") {
    const [duplicates] = await pool.execute(
      `
        SELECT id
        FROM user_commitments
        WHERE user_id = ?
          AND blocked_date = ?
        LIMIT 1
      `,
      [userId, commitment.blockedDate],
    );

    if (duplicates[0]) {
      throw new Error("That blocked date is already saved.");
    }
  }

  if (commitment.type === "weekday") {
    const [duplicates] = await pool.execute(
      `
        SELECT id
        FROM user_commitments
        WHERE user_id = ?
          AND day_of_week = ?
          AND blocked_date IS NULL
        LIMIT 1
      `,
      [userId, commitment.dayOfWeek],
    );

    if (duplicates[0]) {
      throw new Error("That weekday commitment is already saved.");
    }
  }

  const [result] = await pool.execute(
    `
      INSERT INTO user_commitments (user_id, label, day_of_week, blocked_date)
      VALUES (?, ?, ?, ?)
    `,
    [
      userId,
      commitment.label,
      commitment.type === "weekday" ? commitment.dayOfWeek : null,
      commitment.type === "date" ? commitment.blockedDate : null,
    ],
  );

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        label,
        day_of_week AS dayOfWeek,
        DATE_FORMAT(blocked_date, '%Y-%m-%d') AS blockedDate
      FROM user_commitments
      WHERE id = ?
      LIMIT 1
    `,
    [result.insertId],
  );

  return rows[0] ? mapCommitmentRow(rows[0]) : null;
}

export async function deleteCommitment(userId, id) {
  await ensureSchemaReady();
  await pool.execute("DELETE FROM user_commitments WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function listAssignments(userId) {
  await ensureSchemaReady();
  const [rows] = await pool.query(
    `
      SELECT
        id,
        title,
        DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate,
        estimated_minutes AS estimatedMinutes,
        minutes_completed AS minutesCompleted,
        priority
      FROM assignments
      WHERE user_id = ?
      ORDER BY due_date, priority DESC, id
    `,
    [userId],
  );

  return rows.map(mapAssignmentRow);
}

export async function createAssignment(userId, assignment) {
  await ensureSchemaReady();
  const [duplicates] = await pool.execute(
    `
      SELECT id
      FROM assignments
      WHERE user_id = ?
        AND LOWER(TRIM(title)) = ?
      LIMIT 1
    `,
    [userId, normalizeTitleForComparison(assignment.title)],
  );

  if (duplicates[0]) {
    throw new Error("You already have an assignment with that name.");
  }

  const [result] = await pool.execute(
    `
      INSERT INTO assignments (user_id, title, due_date, estimated_minutes, minutes_completed, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      assignment.title,
      assignment.dueDate,
      assignment.estimatedMinutes,
      assignment.minutesCompleted,
      assignment.priority,
    ],
  );

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        title,
        DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate,
        estimated_minutes AS estimatedMinutes,
        minutes_completed AS minutesCompleted,
        priority
      FROM assignments
      WHERE id = ? AND user_id = ?
    `,
    [result.insertId, userId],
  );

  return mapAssignmentRow(rows[0]);
}

export async function updateAssignment(userId, id, assignment) {
  await ensureSchemaReady();
  const [duplicates] = await pool.execute(
    `
      SELECT id
      FROM assignments
      WHERE user_id = ?
        AND LOWER(TRIM(title)) = ?
        AND id <> ?
      LIMIT 1
    `,
    [userId, normalizeTitleForComparison(assignment.title), id],
  );

  if (duplicates[0]) {
    throw new Error("You already have an assignment with that name.");
  }

  await pool.execute(
    `
      UPDATE assignments
      SET title = ?, due_date = ?, estimated_minutes = ?, priority = ?, minutes_completed = ?
      WHERE id = ? AND user_id = ?
    `,
    [
      assignment.title,
      assignment.dueDate,
      assignment.estimatedMinutes,
      assignment.priority,
      assignment.minutesCompleted,
      id,
      userId,
    ],
  );

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        title,
        DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate,
        estimated_minutes AS estimatedMinutes,
        minutes_completed AS minutesCompleted,
        priority
      FROM assignments
      WHERE id = ? AND user_id = ?
    `,
    [id, userId],
  );

  return rows[0] ? mapAssignmentRow(rows[0]) : null;
}

export async function deleteAssignment(userId, id) {
  await ensureSchemaReady();
  await pool.execute("DELETE FROM assignments WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function clearAssignments(userId) {
  await ensureSchemaReady();
  await pool.query(
    `
      DELETE schedule_blocks
      FROM schedule_blocks
      JOIN schedule_runs ON schedule_runs.id = schedule_blocks.run_id
      WHERE schedule_runs.user_id = ?
    `,
    [userId],
  );
  await pool.query("DELETE FROM schedule_runs WHERE user_id = ?", [userId]);
  await pool.query("DELETE FROM assignments WHERE user_id = ?", [userId]);
}

export async function applyCompletion(userId, id, minutes) {
  await ensureSchemaReady();
  await pool.execute(
    `
      UPDATE assignments
      SET minutes_completed = LEAST(estimated_minutes, minutes_completed + ?)
      WHERE id = ? AND user_id = ?
    `,
    [minutes, id, userId],
  );
}

export async function applyMissedWork(userId, id, minutes) {
  await ensureSchemaReady();
  const [rows] = await pool.execute(
    `
      SELECT minutes_completed AS minutesCompleted
      FROM assignments
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    [id, userId],
  );

  const currentCompletedMinutes = Number(rows[0]?.minutesCompleted || 0);
  const appliedMinutes = Math.min(Math.max(Number(minutes) || 0, 0), currentCompletedMinutes);

  if (appliedMinutes <= 0) {
    return {
      applied: false,
      appliedMinutes: 0,
    };
  }

  await pool.execute(
    `
      UPDATE assignments
      SET minutes_completed = GREATEST(0, minutes_completed - ?)
      WHERE id = ? AND user_id = ?
    `,
    [appliedMinutes, id, userId],
  );

  return {
    applied: true,
    appliedMinutes,
  };
}

export async function saveSchedule(userId, runType, blocks) {
  await ensureSchemaReady();
  const [runResult] = await pool.execute(
    `
      INSERT INTO schedule_runs (user_id, run_type)
      VALUES (?, ?)
    `,
    [userId, runType],
  );

  const runId = runResult.insertId;

  if (!blocks.length) {
    return runId;
  }

  const values = blocks.map((block) => [
    runId,
    block.assignmentId ?? null,
    block.assignmentTitle,
    block.dueDate,
    block.scheduledDate,
    block.minutes,
    block.pomodoros,
    block.priority,
    block.overdue ? 1 : 0,
  ]);

  await pool.query(
    `
      INSERT INTO schedule_blocks (
        run_id,
        assignment_id,
        assignment_title,
        due_date,
        scheduled_date,
        minutes,
        pomodoros,
        priority,
        overdue
      )
      VALUES ?
    `,
    [values],
  );

  return runId;
}

export async function getLatestScheduleBlocks(userId) {
  await ensureSchemaReady();
  const assignments = await listAssignments(userId);
  const activeAssignments = assignments.filter((assignment) => !isAssignmentCompleted(assignment));
  const activeAssignmentKeys = new Set(
    activeAssignments.map((assignment) => `${assignment.id}:${assignment.title}`),
  );

  if (!activeAssignments.length) {
    return [];
  }

  const [runs] = await pool.execute(
    `
      SELECT id
      FROM schedule_runs
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [userId],
  );

  if (!runs[0]) {
    return [];
  }

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        run_id AS runId,
        assignment_id AS assignmentId,
        assignment_title AS assignmentTitle,
        DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate,
        DATE_FORMAT(scheduled_date, '%Y-%m-%d') AS scheduledDate,
        minutes,
        pomodoros,
        priority,
        overdue
      FROM schedule_blocks
      WHERE run_id = ?
      ORDER BY scheduled_date, id
    `,
    [runs[0].id],
  );

  return rows
    .filter((row) => activeAssignmentKeys.has(`${row.assignmentId ?? ""}:${row.assignmentTitle}`))
    .map(mapScheduleBlockRow);
}

export async function getDashboardData(userId) {
  await ensureSchemaReady();
  const assignments = await listAssignments(userId);
  const activeAssignments = assignments.filter((assignment) => !isAssignmentCompleted(assignment));
  const latestSchedule = await getLatestScheduleBlocks(userId);
  const timerData = await getTimerData(userId);
  const today = new Date().toISOString().slice(0, 10);
  const todayBlocks = latestSchedule.filter((block) => block.scheduledDate === today);

  return {
    summary: {
      assignmentCount: assignments.length,
      totalEstimatedMinutes: assignments.reduce((sum, assignment) => sum + Number(assignment.estimatedMinutes || 0), 0),
      totalCompletedMinutes: assignments.reduce((sum, assignment) => sum + Number(assignment.minutesCompleted || 0), 0),
      todayStudyMinutes: todayBlocks.reduce((sum, block) => sum + Number(block.minutes || 0), 0),
      focusSessionsCompleted: timerData.summary.focusSessionsCompleted,
    },
    upcomingAssignments: activeAssignments.slice(0, 5),
    todayBlocks,
    recentSessions: timerData.sessions.slice(0, 4),
  };
}

export async function createStudySession(userId, session) {
  await ensureSchemaReady();

  let assignmentId = session.assignmentId || null;
  let assignmentTitle = null;
  let canApplyToAssignment = Boolean(session.applyToAssignment);

  if (assignmentId) {
    const [rows] = await pool.execute(
      `
        SELECT
          title,
          estimated_minutes AS estimatedMinutes,
          minutes_completed AS minutesCompleted
        FROM assignments
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [assignmentId, userId],
    );
    const assignment = rows[0] || null;

    if (!assignment || isAssignmentCompleted(assignment)) {
      assignmentId = null;
      assignmentTitle = null;
      canApplyToAssignment = false;
    } else {
      assignmentTitle = assignment.title;
    }
  }

  const [result] = await pool.execute(
    `
      INSERT INTO study_sessions (
        user_id,
        assignment_id,
        assignment_title,
        session_type,
        planned_minutes,
        actual_minutes,
        completed
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      assignmentId,
      assignmentTitle,
      session.sessionType,
      session.plannedMinutes,
      session.actualMinutes,
      session.completed ? 1 : 0,
    ],
  );

  if (canApplyToAssignment && session.sessionType === "focus" && assignmentId && session.actualMinutes > 0) {
    await applyCompletion(userId, assignmentId, session.actualMinutes);
  }

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        assignment_id AS assignmentId,
        assignment_title AS assignmentTitle,
        session_type AS sessionType,
        planned_minutes AS plannedMinutes,
        actual_minutes AS actualMinutes,
        completed,
        DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
      FROM study_sessions
      WHERE id = ?
    `,
    [result.insertId],
  );

  return mapStudySessionRow(rows[0]);
}

export async function getTimerData(userId) {
  await ensureSchemaReady();
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        assignment_id AS assignmentId,
        assignment_title AS assignmentTitle,
        session_type AS sessionType,
        planned_minutes AS plannedMinutes,
        actual_minutes AS actualMinutes,
        completed,
        DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
      FROM study_sessions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 12
    `,
    [userId],
  );

  const sessions = rows.map(mapStudySessionRow);

  return {
    summary: {
      totalSessions: sessions.length,
      focusSessionsCompleted: sessions.filter((session) => session.sessionType === "focus" && session.completed).length,
      focusMinutesCompleted: sessions
        .filter((session) => session.sessionType === "focus" && session.completed)
        .reduce((sum, session) => sum + Number(session.actualMinutes || 0), 0),
    },
    sessions,
  };
}

export async function clearStudySessions(userId) {
  await ensureSchemaReady();
  await pool.execute(
    `
      DELETE FROM study_sessions
      WHERE user_id = ?
    `,
    [userId],
  );
}
