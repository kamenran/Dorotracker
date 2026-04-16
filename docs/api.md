# DoroTracker API

## Public routes

### `GET /health`

Returns:

```json
{
  "status": "ok"
}
```

### `POST /api/register`

Request:

```json
{
  "name": "Kamran",
  "email": "kamran@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "token": "bearer-token",
  "user": {
    "id": "user-id",
    "name": "Kamran",
    "email": "kamran@example.com",
    "created_at": "2026-04-16T12:00:00"
  }
}
```

### `POST /api/login`

Request:

```json
{
  "email": "kamran@example.com",
  "password": "password123"
}
```

## Authenticated routes

Use `Authorization: Bearer <token>`.

### `GET /api/bootstrap`

Returns the current user, settings, assignments, study sessions, and generated schedule.

### `GET /api/assignments`

Returns all assignments for the signed-in user.

### `POST /api/assignments`

Request:

```json
{
  "title": "Research Essay",
  "course": "ENG201",
  "due_date": "2026-04-20",
  "estimated_minutes": 240,
  "minutes_completed": 0,
  "priority": 5
}
```

### `PUT /api/assignments/<assignment_id>`

Updates the provided fields.

### `DELETE /api/assignments/<assignment_id>`

Deletes the assignment and its logged sessions.

### `GET /api/schedule`

Returns the current generated schedule. Optional query parameter:

```text
start_date=2026-04-16
```

### `POST /api/schedule/generate`

Returns the current generated schedule using saved assignments and settings.

### `POST /api/schedule/reschedule`

Returns the rescheduled plan after completed sessions or assignment edits.

### `POST /api/study-sessions`

Request:

```json
{
  "assignment_id": "assignment-id",
  "minutes_completed": 25,
  "completed_on": "2026-04-16"
}
```

### `POST /api/settings`

Request:

```json
{
  "daily_study_limit_minutes": 180,
  "minimum_block_minutes": 30,
  "pomodoro_length_minutes": 25
}
```
