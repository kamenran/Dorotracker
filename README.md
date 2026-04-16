# DoroTracker

A basic end-to-end prototype for the DoroTracker sprint scope. This version includes:

- Basic registration and login
- Assignment creation, editing, deletion, and listing
- Study schedule generation based on deadlines, effort, and priority
- Rescheduling after completed study sessions
- A browser dashboard for assignments, schedule blocks, and quick stats
- A Pomodoro timer with study-session logging
- JSON-backed persistence for users, assignments, sessions, and settings

## Tech stack

- Backend: Python standard library HTTP server
- Frontend: Vanilla HTML, CSS, and JavaScript
- Persistence: local JSON file at [database/store.json](/Users/kamraneisenberg/Documents/Dorotracker/database/store.json)

## Project structure

```text
backend/
  app_store.py
  dorotracker_scheduler/
    __init__.py
    models.py
    scheduler.py
  server.py
  tests/
    test_app_store.py
    test_scheduler.py
database/
  store.json
docs/
  api.md
frontend/
  app.js
  index.html
  styles.css
```

## Run locally

The easiest option on macOS is to double-click [Start DoroTracker.command](/Users/kamraneisenberg/Documents/Dorotracker/Start%20DoroTracker.command).

On Windows, double-click [Start DoroTracker.bat](/Users/kamraneisenberg/Documents/Dorotracker/Start%20DoroTracker.bat).

If you prefer Terminal, you can also run:

```bash
./scripts/start_app.sh
```

On Windows Terminal or Command Prompt:

```bat
scripts\start_app.bat
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

## Run tests

```bash
PYTHONPATH=backend python3 -m unittest discover -s backend/tests
```

## Demo flow

1. Register a new account from the landing panel.
2. Add a few assignments with different due dates and estimated minutes.
3. Save study settings if you want different daily limits or Pomodoro length.
4. Watch the generated schedule update automatically.
5. Run the timer or log a completed study session.
6. Refresh the schedule and show how remaining work gets redistributed.

## Notes

- Authentication is intentionally basic for prototype/demo use.
- The scheduler is day-based, not calendar time-slot based.
- Rescheduling is driven by completed minutes logged against assignments.
