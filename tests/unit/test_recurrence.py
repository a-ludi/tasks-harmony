import pytest
from datetime import datetime, timezone, timedelta
from chores.recurrence import ChoreStatus, get_chore_status

# Helpers
def dt(year, month, day, hour=12, tz=timezone.utc):
    return datetime(year, month, day, hour, tzinfo=tz)

# A daily RRULE starting 2026-01-01
DAILY = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
# A weekly RRULE starting 2026-01-01 (Thursdays)
WEEKLY = "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY"


def test_status_due_within_window_no_completion():
    # now = Jan 1 noon, window = [Jan 1 00:00, Jan 2 00:00), no completion
    result = get_chore_status(DAILY, last_completed_at=None, now=dt(2026, 1, 1))
    assert result == ChoreStatus.DUE


def test_status_completed_when_last_completed_within_current_window():
    # completed Jan 1 at 06:00, now = Jan 1 noon
    completed = dt(2026, 1, 1, hour=6)
    now = dt(2026, 1, 1, hour=12)
    result = get_chore_status(DAILY, last_completed_at=completed, now=now)
    assert result == ChoreStatus.COMPLETED


def test_status_overdue_when_window_closed_without_completion():
    # now = Jan 2 noon, last_completed_at = Dec 31 (before Jan 1 window)
    old = dt(2025, 12, 31)
    now = dt(2026, 1, 2)
    result = get_chore_status(DAILY, last_completed_at=old, now=now)
    assert result == ChoreStatus.OVERDUE


def test_status_overdue_when_never_completed():
    now = dt(2026, 1, 2)
    result = get_chore_status(DAILY, last_completed_at=None, now=now)
    assert result == ChoreStatus.OVERDUE


def test_status_upcoming_when_before_first_occurrence():
    # RRULE starts Jan 10; now = Jan 5
    future_rule = "DTSTART:20260110T000000Z\nRRULE:FREQ=DAILY"
    now = dt(2026, 1, 5)
    result = get_chore_status(future_rule, last_completed_at=None, now=now)
    assert result == ChoreStatus.UPCOMING


def test_status_upcoming_after_completing_current_window():
    # Weekly chore, window = [Jan 1, Jan 8). Completed Jan 1. Now = Jan 1 noon.
    # → COMPLETED (we're still inside the window)
    completed = dt(2026, 1, 1, hour=1)
    now = dt(2026, 1, 1, hour=12)
    result = get_chore_status(WEEKLY, last_completed_at=completed, now=now)
    assert result == ChoreStatus.COMPLETED


def test_streak_break_detection_missed_previous_window():
    # Window [Jan 8, Jan 15) is current. Last completed Dec 31 (before rule start).
    # Previous window [Jan 1, Jan 8) was never completed.
    from chores.recurrence import detect_streak_break
    completed = dt(2025, 12, 31)
    now = dt(2026, 1, 10)
    assert detect_streak_break(WEEKLY, last_completed_at=completed, now=now) is True


def test_no_streak_break_when_completed_in_previous_window():
    # Window [Jan 8, Jan 15) is current. last_completed_at = Jan 3 (inside [Jan 1, Jan 8)).
    from chores.recurrence import detect_streak_break
    completed = dt(2026, 1, 3)
    now = dt(2026, 1, 10)
    assert detect_streak_break(WEEKLY, last_completed_at=completed, now=now) is False
