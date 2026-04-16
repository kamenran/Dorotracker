from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class Assignment:
    id: str
    title: str
    due_date: date
    estimated_minutes: int
    minutes_completed: int = 0
    priority: int = 3
    course: str | None = None

    @property
    def remaining_minutes(self) -> int:
        return max(self.estimated_minutes - self.minutes_completed, 0)


@dataclass
class ScheduleBlock:
    assignment_id: str
    assignment_title: str
    scheduled_date: date
    minutes: int
    pomodoro_sessions: int
    is_overdue: bool = False


@dataclass
class ScheduleSummary:
    total_assignments: int
    total_minutes_scheduled: int
    unscheduled_minutes: int
    overdue_assignment_ids: list[str] = field(default_factory=list)


@dataclass
class GeneratedSchedule:
    generated_on: date
    blocks: list[ScheduleBlock]
    summary: ScheduleSummary


@dataclass
class ScheduleRequest:
    assignments: list[Assignment]
    start_date: date
    daily_study_limit_minutes: int = 180
    minimum_block_minutes: int = 30
    pomodoro_length_minutes: int = 25
