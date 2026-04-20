function parseDate(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function listDates(startDate, endDate) {
  const dates = [];
  const cursor = parseDate(startDate);
  const limit = parseDate(endDate);

  while (cursor <= limit) {
    dates.push(toDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function pomodoroCount(minutes, pomodoroLength) {
  return Math.max(Math.ceil(minutes / pomodoroLength), 1);
}

function getRemainingMinutes(assignment) {
  return Math.max(
    Number(assignment.estimatedMinutes || 0) - Number(assignment.minutesCompleted || 0),
    0,
  );
}

function isDateBlocked(dateString, commitments = []) {
  const date = parseDate(dateString);
  const weekday = date.getDay();

  return commitments.some((commitment) => {
    if (commitment.blockedDate) {
      return commitment.blockedDate === dateString;
    }

    return Number(commitment.dayOfWeek) === weekday;
  });
}

function formatAssignmentList(items) {
  if (!items.length) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function generateSchedule({
  assignments,
  startDate,
  dailyStudyLimit,
  minimumBlock,
  pomodoroLength,
  deadlineBufferDays = 1,
  commitments = [],
}) {
  const sortedAssignments = [...assignments].sort((left, right) => {
    return (
      parseDate(left.dueDate) - parseDate(right.dueDate) ||
      right.priority - left.priority ||
      left.title.localeCompare(right.title)
    );
  });

  const horizonEnd = sortedAssignments.reduce((latest, assignment) => {
    return parseDate(assignment.dueDate) > parseDate(latest) ? assignment.dueDate : latest;
  }, startDate);

  const allDates = listDates(startDate, horizonEnd);
  const capacityByDate = Object.fromEntries(
    allDates.map((date) => [date, isDateBlocked(date, commitments) ? 0 : dailyStudyLimit]),
  );

  const blocks = [];
  const overloadedAssignments = [];
  let activeAssignmentCount = 0;

  for (const assignment of sortedAssignments) {
    let remainingMinutes = getRemainingMinutes(assignment);
    if (remainingMinutes > 0) {
      activeAssignmentCount += 1;
    }
    let frontloadMinutes = Math.min(Number(assignment.frontloadMinutes || 0), remainingMinutes);
    const bufferedDeadline = parseDate(assignment.dueDate);
    bufferedDeadline.setDate(bufferedDeadline.getDate() - deadlineBufferDays);

    let availableDates = allDates.filter((date) => parseDate(date) <= bufferedDeadline);
    if (!availableDates.length) {
      availableDates = [startDate];
    }

    for (let index = 0; index < availableDates.length && frontloadMinutes > 0; index += 1) {
      const date = availableDates[index];
      const availableCapacity = capacityByDate[date] || 0;
      const minutes = Math.min(frontloadMinutes, availableCapacity);

      if (minutes <= 0) {
        continue;
      }

      blocks.push({
        assignmentTitle: assignment.title,
        dueDate: assignment.dueDate,
        scheduledDate: date,
        minutes,
        pomodoros: pomodoroCount(minutes, pomodoroLength),
        priority: assignment.priority,
        overdue: parseDate(date) > parseDate(assignment.dueDate),
      });

      capacityByDate[date] -= minutes;
      remainingMinutes -= minutes;
      frontloadMinutes -= minutes;
    }

    for (let index = 0; index < availableDates.length && remainingMinutes > 0; index += 1) {
      const date = availableDates[index];
      const remainingDays = availableDates.length - index;
      const targetSlice = Math.max(Math.ceil(remainingMinutes / remainingDays), minimumBlock);
      const availableCapacity = capacityByDate[date] || 0;
      const minutes = Math.min(targetSlice, availableCapacity, remainingMinutes);

      if (minutes <= 0) {
        continue;
      }

      blocks.push({
        assignmentTitle: assignment.title,
        dueDate: assignment.dueDate,
        scheduledDate: date,
        minutes,
        pomodoros: pomodoroCount(minutes, pomodoroLength),
        priority: assignment.priority,
        overdue: parseDate(date) > parseDate(assignment.dueDate),
      });

      capacityByDate[date] -= minutes;
      remainingMinutes -= minutes;
    }

    if (remainingMinutes > 0) {
      overloadedAssignments.push({
        title: assignment.title,
        remainingMinutes,
      });
    }
  }

  const warnings = overloadedAssignments.length
    ? [
        overloadedAssignments.length === 1
          ? `${overloadedAssignments[0].title} could not fully fit before its deadline. ${overloadedAssignments[0].remainingMinutes} minute(s) remain unscheduled.`
          : `${formatAssignmentList(
              overloadedAssignments.map(
                (assignment) => `${assignment.title} (${assignment.remainingMinutes} min remaining)`,
              ),
            )} could not fully fit before their deadlines.`,
      ]
    : [];

  return {
    blocks: blocks.sort((left, right) => {
      return (
        parseDate(left.scheduledDate) - parseDate(right.scheduledDate) ||
        left.assignmentTitle.localeCompare(right.assignmentTitle)
      );
    }),
    warnings,
    summary: {
      assignmentCount: activeAssignmentCount,
      totalMinutes: blocks.reduce((total, block) => total + block.minutes, 0),
      overloadedAssignments: overloadedAssignments.length,
    },
  };
}

export function reschedule({
  assignments,
  startDate,
  dailyStudyLimit,
  minimumBlock,
  pomodoroLength,
  deadlineBufferDays = 1,
  commitments = [],
  missedAssignmentTitle = "",
  missedMinutes = 0,
}) {
  const normalizedMissedMinutes = Math.max(Number(missedMinutes) || 0, 0);

  const adjustedAssignments = assignments.map((assignment) => {
    const remainingMinutes = getRemainingMinutes(assignment);
    const frontloadMinutes =
      missedAssignmentTitle && assignment.title === missedAssignmentTitle ? normalizedMissedMinutes : 0;

    return {
      ...assignment,
      frontloadMinutes: Math.min(frontloadMinutes, remainingMinutes),
      priority:
        missedAssignmentTitle && assignment.title === missedAssignmentTitle
          ? Math.min(Number(assignment.priority) + 1, 5)
          : assignment.priority,
    };
  });

  return generateSchedule({
    assignments: adjustedAssignments,
    startDate,
    dailyStudyLimit,
    minimumBlock,
    pomodoroLength,
    deadlineBufferDays,
    commitments,
  });
}
