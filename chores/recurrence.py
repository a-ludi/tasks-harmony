import datetime
from enum import Enum
from dateutil.rrule import rrulestr


class ChoreStatus(Enum):
    OVERDUE = "overdue"
    DUE = "due"
    COMPLETED = "completed"
    UPCOMING = "upcoming"


def _parse_rule(rrule_string) -> object:
    return rrulestr(str(rrule_string), ignoretz=False)


def get_chore_status(
    rrule_string: str,
    last_completed_at: datetime.datetime | None,
    now: datetime.datetime,
) -> ChoreStatus:
    rule = _parse_rule(rrule_string)

    # Most recent occurrence on or before now
    window_start = rule.before(now, inc=True)
    if window_start is None:
        return ChoreStatus.UPCOMING

    # Next occurrence strictly after window_start
    window_end = rule.after(window_start, inc=False)

    # Completed in the current window?
    if last_completed_at is not None and last_completed_at >= window_start:
        return ChoreStatus.COMPLETED

    # If a previous window exists and was missed, it's already overdue regardless
    # of whether the current window is still open
    prev_window_start = rule.before(window_start, inc=False)
    if prev_window_start is not None:
        if last_completed_at is None or last_completed_at < prev_window_start:
            return ChoreStatus.OVERDUE

    # No missed prior window — are we still inside the current window?
    if window_end is None or now < window_end:
        return ChoreStatus.DUE

    # Window has closed without completion
    return ChoreStatus.OVERDUE


def detect_streak_break(
    rrule_string: str,
    last_completed_at: datetime.datetime | None,
    now: datetime.datetime,
) -> bool:
    """Return True if the previous window closed without a completion (streak broken)."""
    if last_completed_at is None:
        return True

    rule = _parse_rule(rrule_string)

    # Current window start = most recent occurrence on or before now
    current_window_start = rule.before(now, inc=True)
    if current_window_start is None:
        return False

    # Previous window start = occurrence before current_window_start
    prev_window_start = rule.before(current_window_start, inc=False)
    if prev_window_start is None:
        return False

    # The previous window was [prev_window_start, current_window_start)
    # Streak is broken if last_completed_at fell before prev_window_start
    return last_completed_at < prev_window_start
