from __future__ import annotations

import json
import mimetypes
import secrets
from dataclasses import asdict
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from app_store import AppStore
from dorotracker_scheduler.models import Assignment, ScheduleBlock, ScheduleRequest
from dorotracker_scheduler.scheduler import reschedule_assignments, schedule_assignments

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
STORE_PATH = ROOT_DIR / "database" / "store.json"
STORE = AppStore(STORE_PATH)
TOKENS: dict[str, str] = {}


def _parse_assignment(payload: dict) -> Assignment:
    return Assignment(
        id=str(payload["id"]),
        title=payload["title"],
        due_date=date.fromisoformat(payload["due_date"]),
        estimated_minutes=int(payload["estimated_minutes"]),
        minutes_completed=int(payload.get("minutes_completed", 0)),
        priority=int(payload.get("priority", 3)),
        course=payload.get("course") or None,
    )


def _serialize_schedule(schedule) -> dict:
    serialized = asdict(schedule)
    serialized["generated_on"] = schedule.generated_on.isoformat()
    for block in serialized["blocks"]:
        block["scheduled_date"] = block["scheduled_date"].isoformat()
    return serialized


def _schedule_for_user(user_id: str, start_date: date | None = None) -> dict:
    assignments = [_parse_assignment(assignment) for assignment in STORE.list_assignments(user_id)]
    settings = STORE.get_user_settings(user_id)
    request = ScheduleRequest(
        assignments=assignments,
        start_date=start_date or date.today(),
        daily_study_limit_minutes=settings["daily_study_limit_minutes"],
        minimum_block_minutes=settings["minimum_block_minutes"],
        pomodoro_length_minutes=settings["pomodoro_length_minutes"],
    )
    sessions = STORE.list_study_sessions(user_id)
    completed_blocks = [
        ScheduleBlock(
            assignment_id=session["assignment_id"],
            assignment_title=session["assignment_title"],
            scheduled_date=date.fromisoformat(session["completed_on"]),
            minutes=int(session["minutes_completed"]),
            pomodoro_sessions=max(
                (int(session["minutes_completed"]) + settings["pomodoro_length_minutes"] - 1)
                // settings["pomodoro_length_minutes"],
                1,
            ),
        )
        for session in sessions
    ]
    return _serialize_schedule(reschedule_assignments(request, completed_blocks=completed_blocks))


def _bootstrap_payload(user_id: str) -> dict:
    return {
        "user": STORE.get_user(user_id),
        "settings": STORE.get_user_settings(user_id),
        "assignments": STORE.list_assignments(user_id),
        "study_sessions": STORE.list_study_sessions(user_id),
        "schedule": _schedule_for_user(user_id),
    }


class DoroTrackerHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return
        if path == "/api/bootstrap":
            user_id = self._require_auth()
            if user_id is None:
                return
            self._send_json(HTTPStatus.OK, _bootstrap_payload(user_id))
            return
        if path == "/api/assignments":
            user_id = self._require_auth()
            if user_id is None:
                return
            self._send_json(HTTPStatus.OK, {"assignments": STORE.list_assignments(user_id)})
            return
        if path == "/api/schedule":
            user_id = self._require_auth()
            if user_id is None:
                return
            query = parse_qs(parsed.query)
            start_date = None
            if "start_date" in query:
                start_date = date.fromisoformat(query["start_date"][0])
            self._send_json(HTTPStatus.OK, _schedule_for_user(user_id, start_date=start_date))
            return

        self._serve_static(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        payload = self._read_json()
        if payload is None:
            return

        try:
            if parsed.path == "/api/register":
                user = STORE.register_user(payload["name"], payload["email"], payload["password"])
                token = self._create_token(user["id"])
                self._send_json(HTTPStatus.CREATED, {"token": token, "user": user})
                return
            if parsed.path == "/api/login":
                user = STORE.login_user(payload["email"], payload["password"])
                token = self._create_token(user["id"])
                self._send_json(HTTPStatus.OK, {"token": token, "user": user})
                return

            user_id = self._require_auth()
            if user_id is None:
                return

            if parsed.path == "/api/assignments":
                assignment = STORE.create_assignment(user_id, payload)
                self._send_json(
                    HTTPStatus.CREATED,
                    {"assignment": assignment, "schedule": _schedule_for_user(user_id)},
                )
                return
            if parsed.path == "/api/schedule/generate":
                self._send_json(HTTPStatus.OK, _schedule_for_user(user_id))
                return
            if parsed.path == "/api/schedule/reschedule":
                self._send_json(HTTPStatus.OK, _schedule_for_user(user_id))
                return
            if parsed.path == "/api/study-sessions":
                session = STORE.add_study_session(user_id, payload)
                self._send_json(
                    HTTPStatus.CREATED,
                    {"study_session": session, "schedule": _schedule_for_user(user_id)},
                )
                return
            if parsed.path == "/api/settings":
                settings = STORE.update_user_settings(user_id, payload)
                self._send_json(HTTPStatus.OK, {"settings": settings, "schedule": _schedule_for_user(user_id)})
                return
        except (KeyError, TypeError, ValueError) as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        user_id = self._require_auth()
        if user_id is None:
            return
        payload = self._read_json()
        if payload is None:
            return

        try:
            assignment_id = parsed.path.removeprefix("/api/assignments/")
            assignment = STORE.update_assignment(user_id, assignment_id, payload)
            self._send_json(HTTPStatus.OK, {"assignment": assignment, "schedule": _schedule_for_user(user_id)})
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        user_id = self._require_auth()
        if user_id is None:
            return

        try:
            assignment_id = parsed.path.removeprefix("/api/assignments/")
            STORE.delete_assignment(user_id, assignment_id)
            self._send_json(HTTPStatus.OK, {"deleted": True, "schedule": _schedule_for_user(user_id)})
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})

    def log_message(self, format: str, *args) -> None:
        return

    def _read_json(self) -> dict | None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(content_length) or b"{}")
        except json.JSONDecodeError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
            return None

    def _create_token(self, user_id: str) -> str:
        token = secrets.token_urlsafe(24)
        TOKENS[token] = user_id
        return token

    def _require_auth(self) -> str | None:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Missing bearer token"})
            return None
        token = header.removeprefix("Bearer ").strip()
        user_id = TOKENS.get(token)
        if user_id is None:
            self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Invalid token"})
            return None
        return user_id

    def _serve_static(self, path: str) -> None:
        if path == "/":
            file_path = FRONTEND_DIR / "index.html"
        else:
            file_path = FRONTEND_DIR / path.lstrip("/")

        try:
            resolved = file_path.resolve()
            resolved.relative_to(FRONTEND_DIR.resolve())
        except Exception:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "File not found"})
            return

        if not resolved.exists() or not resolved.is_file():
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "File not found"})
            return

        mime_type, _ = mimetypes.guess_type(str(resolved))
        body = resolved.read_bytes()
        self.send_response(HTTPStatus.OK)
        self._send_cors_headers()
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), DoroTrackerHandler)
    print(f"DoroTracker app listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
