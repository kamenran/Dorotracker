from __future__ import annotations

import json
import secrets
from datetime import date, datetime
from pathlib import Path


class AppStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write(self._default_data())

    def register_user(self, name: str, email: str, password: str) -> dict:
        data = self._read()
        normalized_email = email.strip().lower()
        if any(user["email"] == normalized_email for user in data["users"]):
            raise ValueError("An account with that email already exists")

        user = {
            "id": secrets.token_hex(8),
            "name": name.strip(),
            "email": normalized_email,
            "password": password,
            "created_at": datetime.utcnow().isoformat(),
        }
        data["users"].append(user)
        self._write(data)
        return self._public_user(user)

    def login_user(self, email: str, password: str) -> dict:
        data = self._read()
        normalized_email = email.strip().lower()
        for user in data["users"]:
            if user["email"] == normalized_email and user["password"] == password:
                return self._public_user(user)
        raise ValueError("Invalid email or password")

    def get_user(self, user_id: str) -> dict:
        data = self._read()
        for user in data["users"]:
            if user["id"] == user_id:
                return self._public_user(user)
        raise ValueError("User not found")

    def get_user_settings(self, user_id: str) -> dict:
        data = self._read()
        settings = data["settings"].get(user_id)
        if settings is None:
            settings = self._default_settings()
            data["settings"][user_id] = settings
            self._write(data)
        return settings

    def update_user_settings(self, user_id: str, payload: dict) -> dict:
        data = self._read()
        settings = data["settings"].setdefault(user_id, self._default_settings())
        for key in ("daily_study_limit_minutes", "minimum_block_minutes", "pomodoro_length_minutes"):
            if key in payload:
                settings[key] = int(payload[key])
        self._write(data)
        return settings

    def list_assignments(self, user_id: str) -> list[dict]:
        data = self._read()
        assignments = [assignment for assignment in data["assignments"] if assignment["user_id"] == user_id]
        return sorted(assignments, key=lambda assignment: (assignment["due_date"], -assignment["priority"]))

    def create_assignment(self, user_id: str, payload: dict) -> dict:
        assignment = self._assignment_from_payload(user_id, payload)
        data = self._read()
        data["assignments"].append(assignment)
        self._write(data)
        return assignment

    def update_assignment(self, user_id: str, assignment_id: str, payload: dict) -> dict:
        data = self._read()
        for assignment in data["assignments"]:
            if assignment["id"] == assignment_id and assignment["user_id"] == user_id:
                for key in ("title", "course", "due_date", "estimated_minutes", "minutes_completed", "priority", "status"):
                    if key in payload:
                        assignment[key] = self._coerce_assignment_field(key, payload[key])
                assignment["updated_at"] = datetime.utcnow().isoformat()
                self._write(data)
                return assignment
        raise ValueError("Assignment not found")

    def delete_assignment(self, user_id: str, assignment_id: str) -> None:
        data = self._read()
        original_count = len(data["assignments"])
        data["assignments"] = [
            assignment
            for assignment in data["assignments"]
            if not (assignment["id"] == assignment_id and assignment["user_id"] == user_id)
        ]
        if len(data["assignments"]) == original_count:
            raise ValueError("Assignment not found")
        data["study_sessions"] = [
            session for session in data["study_sessions"] if session["assignment_id"] != assignment_id
        ]
        self._write(data)

    def add_study_session(self, user_id: str, payload: dict) -> dict:
        assignment_id = str(payload["assignment_id"])
        minutes_completed = int(payload["minutes_completed"])
        completed_on = payload.get("completed_on", date.today().isoformat())
        if minutes_completed <= 0:
            raise ValueError("minutes_completed must be greater than 0")

        data = self._read()
        assignment = None
        for current in data["assignments"]:
            if current["id"] == assignment_id and current["user_id"] == user_id:
                assignment = current
                break
        if assignment is None:
            raise ValueError("Assignment not found")

        session = {
            "id": secrets.token_hex(8),
            "user_id": user_id,
            "assignment_id": assignment_id,
            "assignment_title": assignment["title"],
            "minutes_completed": minutes_completed,
            "completed_on": completed_on,
            "created_at": datetime.utcnow().isoformat(),
        }
        assignment["minutes_completed"] = min(
            int(assignment["estimated_minutes"]),
            int(assignment["minutes_completed"]) + minutes_completed,
        )
        if assignment["minutes_completed"] >= int(assignment["estimated_minutes"]):
            assignment["status"] = "completed"
        data["study_sessions"].append(session)
        self._write(data)
        return session

    def list_study_sessions(self, user_id: str) -> list[dict]:
        data = self._read()
        sessions = [session for session in data["study_sessions"] if session["user_id"] == user_id]
        return sorted(sessions, key=lambda session: (session["completed_on"], session["created_at"]), reverse=True)

    def _assignment_from_payload(self, user_id: str, payload: dict) -> dict:
        title = payload["title"].strip()
        if not title:
            raise ValueError("title is required")
        estimated_minutes = int(payload["estimated_minutes"])
        if estimated_minutes <= 0:
            raise ValueError("estimated_minutes must be greater than 0")
        return {
            "id": secrets.token_hex(8),
            "user_id": user_id,
            "title": title,
            "course": payload.get("course", "").strip(),
            "due_date": payload["due_date"],
            "estimated_minutes": estimated_minutes,
            "minutes_completed": int(payload.get("minutes_completed", 0)),
            "priority": int(payload.get("priority", 3)),
            "status": payload.get("status", "active"),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

    def _coerce_assignment_field(self, key: str, value):
        if key in {"estimated_minutes", "minutes_completed", "priority"}:
            return int(value)
        if key in {"title", "course", "due_date", "status"}:
            return str(value).strip()
        return value

    def _read(self) -> dict:
        return json.loads(self.path.read_text())

    def _write(self, data: dict) -> None:
        self.path.write_text(json.dumps(data, indent=2))

    def _default_data(self) -> dict:
        return {
            "users": [],
            "assignments": [],
            "study_sessions": [],
            "settings": {},
        }

    def _default_settings(self) -> dict:
        return {
            "daily_study_limit_minutes": 180,
            "minimum_block_minutes": 30,
            "pomodoro_length_minutes": 25,
        }

    def _public_user(self, user: dict) -> dict:
        return {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
        }
