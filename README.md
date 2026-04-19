# DoroTracker

DoroTracker is a study planning web app built around four core flows:

- account registration and login
- assignment tracking
- schedule generation and rescheduling
- Pomodoro-based study sessions

The app uses a Node.js backend, a MySQL database, and a lightweight frontend designed around the DoroTracker brand.

## Features

- register and log in with hashed passwords
- create, view, edit, and delete assignments
- prevent duplicate assignment names for the same user
- reject invalid or past due dates
- generate a study schedule based on deadlines, effort, and study limits
- reschedule after marking work as completed or missed
- track Pomodoro study sessions and progress
- store users, assignments, schedules, and sessions in MySQL

## Tech stack

- Node.js
- MySQL
- Railway for web hosting
- Aiven for hosted MySQL
- MySQL Workbench for database inspection and demoing

## Project structure

- [frontend/index.html](/Users/kamraneisenberg/Documents/Dorotracker/frontend/index.html)
- [frontend/styles.css](/Users/kamraneisenberg/Documents/Dorotracker/frontend/styles.css)
- [server/index.js](/Users/kamraneisenberg/Documents/Dorotracker/server/index.js)
- [server/db.js](/Users/kamraneisenberg/Documents/Dorotracker/server/db.js)
- [database/schema.sql](/Users/kamraneisenberg/Documents/Dorotracker/database/schema.sql)

## Hosted deployment

The intended hosted setup is:

- Railway for the app
- Aiven for the MySQL database

This gives you:

- a live project link
- a real MySQL backend
- the ability to show app actions appearing in MySQL Workbench during a demo

### Railway variables

Set these variables in Railway:

- `HOST=0.0.0.0`
- `PORT=8000`
- `MYSQL_HOST=your-aiven-host`
- `MYSQL_PORT=your-aiven-port`
- `MYSQL_USER=your-aiven-user`
- `MYSQL_PASSWORD=your-aiven-password`
- `MYSQL_DATABASE=dorotracker`
- `MYSQL_SSL_MODE=required`
- `MYSQL_SSL_CA_CONTENT=paste the full Aiven CA certificate contents here`

Important:

- do not set `MYSQL_SOCKET` on Railway
- Railway should connect by host and port, not by `/tmp/mysql.sock`

## Local setup

If you want to run the app locally, you need:

- Node.js
- MySQL

### Mac

1. Install Homebrew if needed.
2. Install Node.js and MySQL:

```bash
brew install node
brew install mysql
```

3. Start MySQL:

```bash
brew services start mysql
```

4. Clone the repo:

```bash
git clone https://github.com/kamenran/Dorotracker.git
cd Dorotracker
git checkout kamran-feature
```

5. Install dependencies:

```bash
npm install
```

6. Create the schema:

```bash
mysql -u root < database/schema.sql
```

7. Start the app:

```bash
./scripts/start_app.sh
```

8. Open:

```text
http://127.0.0.1:8000
```

### Windows

1. Install Node.js from [nodejs.org](https://nodejs.org/).
2. Install MySQL from [dev.mysql.com/downloads](https://dev.mysql.com/downloads/).
3. Clone the repo:

```bash
git clone https://github.com/kamenran/Dorotracker.git
cd Dorotracker
git checkout kamran-feature
```

4. Install dependencies:

```bash
npm install
```

5. Create the schema:

```bash
mysql -u root -p < database/schema.sql
```

6. Start the app:

```bash
node server/index.js
```

7. Open:

```text
http://127.0.0.1:8000
```

## Database demo checklist

For a clean project demo, open the app and MySQL Workbench at the same time and show changes appearing in these tables:

- `users`
- `user_sessions`
- `assignments`
- `schedule_runs`
- `schedule_blocks`
- `study_sessions`

A strong demo flow is:

1. Register a new user.
2. Show the new user row in `users`.
3. Add an assignment.
4. Show the new assignment row in `assignments`.
5. Generate a schedule.
6. Show rows in `schedule_runs` and `schedule_blocks`.
7. Complete a Pomodoro session.
8. Show the new row in `study_sessions` and the assignment progress update.

## Common issues

### `connect ENOENT /tmp/mysql.sock`

The app is trying to use a local MySQL socket instead of host and port.

Fix:

- local machine: make sure your local MySQL socket path is valid
- Railway: remove `MYSQL_SOCKET` entirely

### `mysql: command not found`

MySQL is not installed or not on your PATH.

### `npm: command not found`

Node.js is not installed or your shell needs to be restarted.

### The site loads but data actions fail

Usually this means:

- the backend is not running
- the schema was not loaded
- or the database connection variables are wrong

## Notes

- Keep `.env` out of Git.
- Keep local certificate files out of Git.
- Use [database/schema.sql](/Users/kamraneisenberg/Documents/Dorotracker/database/schema.sql) to initialize a fresh MySQL database.
