import fs from "node:fs";
import path from "node:path";

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
      process.env[key] = rest.join("=");
    }
  }
}

loadEnvFile();

export const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 8000),
  mysqlBin: process.env.MYSQL_BIN || "mysql",
  mysqlHost: process.env.MYSQL_HOST || "127.0.0.1",
  mysqlSocket: process.env.MYSQL_SOCKET || "",
  mysqlPort: Number(process.env.MYSQL_PORT || 3306),
  mysqlUser: process.env.MYSQL_USER || "root",
  mysqlPassword: process.env.MYSQL_PASSWORD || "",
  mysqlDatabase: process.env.MYSQL_DATABASE || "dorotracker",
};
