# DoroTracker

DoroTracker is a Node.js prototype for assignment tracking, schedule generation, schedule regeneration, and Pomodoro-oriented study planning.

## Team split

- `nathan-feature`: auth and accounts
- `kelsey-feature`: assignment CRUD expansion
- `kamran-feature`: scheduler and rescheduler
- `beatrice-feature`: Pomodoro timer and progress UI

## What already works here

This base is intentionally light outside of the scheduler lane, but Kamran's feature is wired end to end:

- add one assignment at a time
- store assignments in MySQL
- generate a study schedule from deadlines, effort, and daily study limits
- reschedule after telling the app you completed work or missed work
- save generated schedule blocks in MySQL

The app uses:

- Node.js for the backend and scheduling flow
- MySQL for persistence
- a lightweight frontend styled around the DoroTracker logo colors

## Easiest local run

On this Mac repo, the launcher can open the website for you after MySQL is already running:

- macOS: [MAC DOUBLE CLICK.command](/Users/kamraneisenberg/Documents/Dorotracker/MAC%20DOUBLE%20CLICK.command)

Windows launcher is included for the app shell, but it expects MySQL to already be installed on that machine:

- Windows: `WINDOWS DOUBLE CLICK.bat`

## Manual run

If you want to run it from Terminal instead:

```bash
./scripts/start_app.sh
```

Then open `http://127.0.0.1:8000`.

## Local setup requirements

Installing MySQL by itself is not enough. To run DoroTracker locally, each developer needs:

- Node.js installed
- MySQL installed
- the MySQL server running
- the project database created from [database/schema.sql](/Users/kamraneisenberg/Documents/Dorotracker/database/schema.sql)

## How another group member runs it

1. Install Node.js.
2. Install MySQL.
3. Start the MySQL server.
4. Create the database and tables by running `database/schema.sql`.
5. Start the app.

On macOS, if MySQL is installed through Homebrew and running locally, this project expects:

- MySQL socket: `/tmp/mysql.sock`
- database name: `dorotracker`
- user: `root` unless changed in environment variables

On Windows, the normal local setup is:

- MySQL host: `127.0.0.1`
- MySQL port: `3306`
- database name: `dorotracker`

## Quick note

For local development, every group member still needs their own MySQL installation.

For a final demo where users should not install MySQL locally, the better approach is to deploy the app online with a cloud-hosted MySQL database.
