from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from app_store import AppStore


class AppStoreTests(TestCase):
    def test_register_create_assignment_and_log_session(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = AppStore(Path(temp_dir) / "store.json")
            user = store.register_user("Kamran", "kamran@example.com", "password123")
            store.update_user_settings(user["id"], {"daily_study_limit_minutes": 210})
            assignment = store.create_assignment(
                user["id"],
                {
                    "title": "Database Homework",
                    "course": "COSC412",
                    "due_date": "2026-04-20",
                    "estimated_minutes": 120,
                    "priority": 4,
                },
            )
            session = store.add_study_session(
                user["id"],
                {
                    "assignment_id": assignment["id"],
                    "minutes_completed": 30,
                },
            )

            assignments = store.list_assignments(user["id"])
            self.assertEqual(len(assignments), 1)
            self.assertEqual(assignments[0]["minutes_completed"], 30)
            self.assertEqual(session["minutes_completed"], 30)
            self.assertEqual(store.get_user_settings(user["id"])["daily_study_limit_minutes"], 210)
