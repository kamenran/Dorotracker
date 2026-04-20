import fs from "node:fs";
import path from "node:path";

function cleanEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function loadEnvFile() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const [key, ...rest] = line.split("=");
    if (!process.env[key]) {
      process.env[key] = cleanEnvValue(rest.join("="));
    }
  }
}

loadEnvFile();

export const config = {
  host: cleanEnvValue(process.env.HOST) || "127.0.0.1",
  port: Number(cleanEnvValue(process.env.PORT) || 8000),
  mysqlBin: cleanEnvValue(process.env.MYSQL_BIN) || "mysql",
  mysqlHost: cleanEnvValue(process.env.MYSQL_HOST) || "127.0.0.1",
  mysqlSocket: cleanEnvValue(process.env.MYSQL_SOCKET),
  mysqlPort: Number(cleanEnvValue(process.env.MYSQL_PORT) || 3306),
  mysqlUser: cleanEnvValue(process.env.MYSQL_USER) || "root",
  mysqlPassword: process.env.MYSQL_PASSWORD || "",
  mysqlDatabase: cleanEnvValue(process.env.MYSQL_DATABASE) || "dorotracker",
  mysqlSslCa: cleanEnvValue(process.env.MYSQL_SSL_CA),
  mysqlSslCaContent: process.env.MYSQL_SSL_CA_CONTENT || "",
  mysqlSslMode: cleanEnvValue(process.env.MYSQL_SSL_MODE),
};
