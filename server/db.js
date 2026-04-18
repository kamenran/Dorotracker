import mysql from "mysql2/promise";
import { config } from "./config.js";

const pool = mysql.createPool({
  ...(config.mysqlSocket
    ? { socketPath: config.mysqlSocket }
    : { host: config.mysqlHost, port: config.mysqlPort }),
  user: config.mysqlUser,
  password: config.mysqlPassword,
  database: config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

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

export function getDatabaseMode() {
  return "mysql";
}

export async function testConnection() {
  await pool.query("SELECT 1");
}

export async function listAssignments() {
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
      ORDER BY due_date, priority DESC, id
    `,
  );

  return rows.map(mapAssignmentRow);
}

export async function createAssignment(assignment) {
  const [result] = await pool.execute(
    `
      INSERT INTO assignments (title, due_date, estimated_minutes, priority)
      VALUES (?, ?, ?, ?)
    `,
    [assignment.title, assignment.dueDate, assignment.estimatedMinutes, assignment.priority],
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
      WHERE id = ?
    `,
    [result.insertId],
  );

  return mapAssignmentRow(rows[0]);
}

export async function deleteAssignment(id) {
  await pool.execute("DELETE FROM assignments WHERE id = ?", [id]);
}

export async function clearAssignments() {
  await pool.query("DELETE FROM schedule_blocks");
  await pool.query("DELETE FROM schedule_runs");
  await pool.query("DELETE FROM assignments");
}

export async function applyCompletion(id, minutes) {
  await pool.execute(
    `
      UPDATE assignments
      SET minutes_completed = LEAST(estimated_minutes, minutes_completed + ?)
      WHERE id = ?
    `,
    [minutes, id],
  );
}

export async function saveSchedule(runType, blocks) {
  const [runResult] = await pool.execute(
    `
      INSERT INTO schedule_runs (run_type)
      VALUES (?)
    `,
    [runType],
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
