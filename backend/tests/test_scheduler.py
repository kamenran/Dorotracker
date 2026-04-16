from datetime import date
from unittest import TestCase

from dorotracker_scheduler.models import Assignment, ScheduleBlock, ScheduleRequest
from dorotracker_scheduler.scheduler import reschedule_assignments, schedule_assignments


class SchedulerTests(TestCase):
    def test_schedule_assignments_spreads_work_before_due_dates(self) -> None:
        request = ScheduleRequest(
            assignments=[
                Assignment(
                    id="essay-1",
                    title="Essay",
                    due_date=date(2026, 4, 20),
                    estimated_minutes=240,
                    priority=5,
                ),
                Assignment(
                    id="quiz-1",
                    title="Quiz Prep",
                    due_date=date(2026, 4, 18),
                    estimated_minutes=90,
                    priority=3,
                ),
            ],
            start_date=date(2026, 4, 16),
            daily_study_limit_minutes=180,
        )

        schedule = schedule_assignments(request)

        self.assertEqual(schedule.summary.unscheduled_minutes, 0)
        self.assertEqual(schedule.summary.total_minutes_scheduled, 330)
        self.assertTrue(any(block.assignment_id == "quiz-1" for block in schedule.blocks))
        self.assertTrue(all(block.minutes > 0 for block in schedule.blocks))
        self.assertTrue(all(block.scheduled_date <= date(2026, 4, 20) for block in schedule.blocks))

    def test_reschedule_uses_completed_work_to_reduce_future_load(self) -> None:
        request = ScheduleRequest(
            assignments=[
                Assignment(
                    id="project-1",
                    title="Project",
                    due_date=date(2026, 4, 19),
                    estimated_minutes=180,
                )
            ],
            start_date=date(2026, 4, 16),
            daily_study_limit_minutes=90,
        )

        schedule = reschedule_assignments(
            request,
            completed_blocks=[
                ScheduleBlock(
                    assignment_id="project-1",
                    assignment_title="Project",
                    scheduled_date=date(2026, 4, 16),
                    minutes=60,
                    pomodoro_sessions=3,
                )
            ],
        )

        self.assertEqual(schedule.summary.total_minutes_scheduled, 120)
        self.assertEqual(schedule.summary.unscheduled_minutes, 0)

    def test_schedule_marks_work_as_overdue_when_deadline_has_passed(self) -> None:
        request = ScheduleRequest(
            assignments=[
                Assignment(
                    id="lab-1",
                    title="Lab",
                    due_date=date(2026, 4, 15),
                    estimated_minutes=120,
                )
            ],
            start_date=date(2026, 4, 16),
            daily_study_limit_minutes=60,
        )

        schedule = schedule_assignments(request)

        self.assertIn("lab-1", schedule.summary.overdue_assignment_ids)
        self.assertEqual(schedule.summary.total_minutes_scheduled, 120)
        self.assertTrue(all(block.is_overdue for block in schedule.blocks))
