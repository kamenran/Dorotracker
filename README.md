# DoroTracker

DoroTracker is a study planning prototype that combines assignment tracking, automated schedule generation, schedule regeneration, and Pomodoro-based study sessions in a single web application.

The prototype demonstrates a usable application with real database-backed functionality, including user accounts, assignment CRUD operations, saved schedules, and tracked study sessions.

## Access

- Live application: `[Add Railway URL before submission]`
- GitHub repository: [https://github.com/kamenran/Dorotracker](https://github.com/kamenran/Dorotracker)

## Project Scope

The current prototype includes:

- user registration and login with hashed passwords
- assignment create, read, update, and delete operations
- schedule generation based on deadlines, estimated effort, and study limits
- schedule regeneration after the user marks work as completed or missed
- Pomodoro-based study session tracking
- persistent storage in MySQL

## Technology Stack

- Node.js backend
- MySQL database
- Railway hosted deployment
- Aiven hosted MySQL

## Database Implementation

The application stores and retrieves data from MySQL in the following core tables:

- `users`
- `user_sessions`
- `assignments`
- `schedule_runs`
- `schedule_blocks`
- `study_sessions`

These tables support the main functional areas of the prototype:

- account creation and authentication
- assignment management
- saved schedule generation and regeneration
- recorded Pomodoro study sessions

## Main Code Locations

- [frontend/index.html](/Users/kamraneisenberg/Documents/Dorotracker/frontend/index.html)
- [frontend/styles.css](/Users/kamraneisenberg/Documents/Dorotracker/frontend/styles.css)
- [server/index.js](/Users/kamraneisenberg/Documents/Dorotracker/server/index.js)
- [server/db.js](/Users/kamraneisenberg/Documents/Dorotracker/server/db.js)
- [database/schema.sql](/Users/kamraneisenberg/Documents/Dorotracker/database/schema.sql)

## Optional Local Run

The primary review path for this project is the hosted Railway deployment listed above.

An optional local run path is also available for environments that already have both Node.js and MySQL installed and configured.

Local run requirements:

- Node.js
- MySQL
- ability to run the schema file in a local MySQL instance

Verified local run outline:

1. Clone the repository
2. Install dependencies with `npm install`
3. Run [database/schema.sql](/Users/kamraneisenberg/Documents/Dorotracker/database/schema.sql) in a local MySQL database named `dorotracker`
4. Configure environment variables so the app points to local MySQL rather than the hosted database
5. Start the server with `npm start`
6. Open `http://127.0.0.1:8000`

Because local MySQL configurations can vary by machine, the hosted deployment remains the recommended access path for review.

## Submission Contents

The final submission package is intended to include:

- the application code
- the live access link
- access instructions
- the video demonstration
- the document summarizing contributions by team member
