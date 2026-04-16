from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from .models import Assignment, GeneratedSchedule, ScheduleBlock, ScheduleRequest, ScheduleSummary


def schedule_assignments(request: ScheduleRequest) -> GeneratedSchedule:
    _validate_request(request)

    assignments = sorted(
        request.assignments,
        key=lambda assignment: (assignment.due_date, -assignment.priority, assignment.title.lower()),
    )
    remaining_capacity = _build_capacity_map(request.start_date, assignments, request.daily_study_limit_minutes)
    blocks: list[ScheduleBlock] = []
    unscheduled_minutes = 0
    overdue_assignment_ids: list[str] = []

    for assignment in assignments:
        remaining = assignment.remaining_minutes
        if remaining == 0:
            continue

        available_dates = _assignment_dates(request.start_date, assignment.due_date)
        if not available_dates:
            overdue_assignment_ids.append(assignment.id)
            overdue_blocks, leftover = _schedule_overdue_assignment(
                assignment=assignment,
                remaining=remaining,
                remaining_capacity=remaining_capacity,
                minimum_block_minutes=request.minimum_block_minutes,
                pomodoro_length_minutes=request.pomodoro_length_minutes,
            )
            blocks.extend(overdue_blocks)
            unscheduled_minutes += leftover
            continue

        target_dates = _rank_dates(available_dates, assignment.due_date)
        for scheduled_date in target_dates:
            if remaining == 0:
                break

            day_capacity = remaining_capacity[scheduled_date]
            if day_capacity < request.minimum_block_minutes and remaining > request.minimum_block_minutes:
                continue

            minutes = min(day_capacity, remaining)
            if minutes <= 0:
                continue

            if minutes < request.minimum_block_minutes and remaining > request.minimum_block_minutes:
                continue

            blocks.append(
                ScheduleBlock(
                    assignment_id=assignment.id,
                    assignment_title=assignment.title,
                    scheduled_date=scheduled_date,
                    minutes=minutes,
                    pomodoro_sessions=_pomodoro_sessions(minutes, request.pomodoro_length_minutes),
                )
            )
            remaining_capacity[scheduled_date] -= minutes
            remaining -= minutes

        if remaining > 0:
            overdue_assignment_ids.append(assignment.id)
            overdue_blocks, leftover = _schedule_overdue_assignment(
                assignment=assignment,
                remaining=remaining,
                remaining_capacity=remaining_capacity,
                minimum_block_minutes=request.minimum_block_minutes,
                pomodoro_length_minutes=request.pomodoro_length_minutes,
            )
            blocks.extend(overdue_blocks)
            unscheduled_minutes += leftover

    ordered_blocks = sorted(
        blocks,
        key=lambda block: (block.scheduled_date, block.is_overdue, block.assignment_title.lower()),
    )

    return GeneratedSchedule(
        generated_on=request.start_date,
        blocks=ordered_blocks,
        summary=ScheduleSummary(
            total_assignments=len(assignments),
            total_minutes_scheduled=sum(block.minutes for block in ordered_blocks),
            unscheduled_minutes=unscheduled_minutes,
            overdue_assignment_ids=sorted(set(overdue_assignment_ids)),
        ),
    )


def reschedule_assignments(
    request: ScheduleRequest,
    completed_blocks: list[ScheduleBlock] | None = None,
) -> GeneratedSchedule:
    completed_minutes_by_assignment: dict[str, int] = defaultdict(int)

    for block in completed_blocks or []:
        completed_minutes_by_assignment[block.assignment_id] += block.minutes

    refreshed_assignments: list[Assignment] = []
    for assignment in request.assignments:
        refreshed_assignments.append(
            Assignment(
                id=assignment.id,
                title=assignment.title,
                due_date=assignment.due_date,
                estimated_minutes=assignment.estimated_minutes,
                minutes_completed=assignment.minutes_completed + completed_minutes_by_assignment[assignment.id],
                priority=assignment.priority,
                course=assignment.course,
            )
        )

    return schedule_assignments(
        ScheduleRequest(
            assignments=refreshed_assignments,
            start_date=request.start_date,
            daily_study_limit_minutes=request.daily_study_limit_minutes,
            minimum_block_minutes=request.minimum_block_minutes,
            pomodoro_length_minutes=request.pomodoro_length_minutes,
        )
    )


def _validate_request(request: ScheduleRequest) -> None:
    if request.daily_study_limit_minutes <= 0:
        raise ValueError("daily_study_limit_minutes must be greater than 0")
    if request.minimum_block_minutes <= 0:
        raise ValueError("minimum_block_minutes must be greater than 0")
    if request.pomodoro_length_minutes <= 0:
        raise ValueError("pomodoro_length_minutes must be greater than 0")
    if request.minimum_block_minutes > request.daily_study_limit_minutes:
        raise ValueError("minimum_block_minutes cannot exceed daily_study_limit_minutes")


def _build_capacity_map(
    start_date: date,
    assignments: list[Assignment],
    daily_limit: int,
) -> dict[date, int]:
    last_due_date = max((assignment.due_date for assignment in assignments), default=start_date)
    horizon_end = max(last_due_date, start_date) + timedelta(days=7)
    capacity: dict[date, int] = {}
    current = start_date

    while current <= horizon_end:
        capacity[current] = daily_limit
        current += timedelta(days=1)

    return capacity


def _assignment_dates(start_date: date, due_date: date) -> list[date]:
    if due_date < start_date:
        return []

    dates: list[date] = []
    current = start_date
    while current <= due_date:
        dates.append(current)
        current += timedelta(days=1)
    return dates


def _rank_dates(dates: list[date], due_date: date) -> list[date]:
    del due_date
    return sorted(dates)


def _schedule_overdue_assignment(
    assignment: Assignment,
    remaining: int,
    remaining_capacity: dict[date, int],
    minimum_block_minutes: int,
    pomodoro_length_minutes: int,
) -> tuple[list[ScheduleBlock], int]:
    blocks: list[ScheduleBlock] = []

    for scheduled_date in sorted(remaining_capacity):
        if remaining == 0 or scheduled_date <= assignment.due_date:
            continue

        capacity = remaining_capacity[scheduled_date]
        if capacity <= 0:
            continue
        if capacity < minimum_block_minutes and remaining > minimum_block_minutes:
            continue

        minutes = min(capacity, remaining)
        blocks.append(
            ScheduleBlock(
                assignment_id=assignment.id,
                assignment_title=assignment.title,
                scheduled_date=scheduled_date,
                minutes=minutes,
                pomodoro_sessions=_pomodoro_sessions(minutes, pomodoro_length_minutes),
                is_overdue=True,
            )
        )
        remaining_capacity[scheduled_date] -= minutes
        remaining -= minutes

    return blocks, remaining


def _pomodoro_sessions(minutes: int, pomodoro_length_minutes: int) -> int:
    return max((minutes + pomodoro_length_minutes - 1) // pomodoro_length_minutes, 1)
