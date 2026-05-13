import pytest
from dataclasses import dataclass, field
from chores.answer_validators import validate_answer, AnswerValidationError


@dataclass
class FakeQuestion:
    type: str
    required: bool = True
    regex_pattern: str = ""
    min_value: int | None = None
    max_value: int | None = None
    pk: int = 1


@dataclass
class FakeChoice:
    pk: int
    question_id: int


def test_text_invalid_regex_rejected():
    q = FakeQuestion(type="TEXT", regex_pattern=r"^\d+$")
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer="abc", valid_choice_ids=set())


def test_text_valid_regex_passes():
    q = FakeQuestion(type="TEXT", regex_pattern=r"^\d+$")
    validate_answer(q, answer="123", valid_choice_ids=set())  # no exception


def test_integer_below_min_rejected():
    q = FakeQuestion(type="INTEGER", min_value=5, max_value=10)
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=4, valid_choice_ids=set())


def test_integer_above_max_rejected():
    q = FakeQuestion(type="INTEGER", min_value=5, max_value=10)
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=11, valid_choice_ids=set())


def test_integer_in_range_passes():
    q = FakeQuestion(type="INTEGER", min_value=5, max_value=10)
    validate_answer(q, answer=7, valid_choice_ids=set())  # no exception


def test_required_with_none_answer_rejected():
    q = FakeQuestion(type="TEXT", required=True)
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=None, valid_choice_ids=set())


def test_optional_with_none_answer_passes():
    q = FakeQuestion(type="TEXT", required=False)
    validate_answer(q, answer=None, valid_choice_ids=set())  # no exception


def test_enum_invalid_choice_rejected():
    q = FakeQuestion(type="ENUM")
    with pytest.raises(AnswerValidationError):
        validate_answer(q, answer=99, valid_choice_ids={1, 2, 3})


def test_enum_valid_choice_passes():
    q = FakeQuestion(type="ENUM")
    validate_answer(q, answer=2, valid_choice_ids={1, 2, 3})  # no exception
