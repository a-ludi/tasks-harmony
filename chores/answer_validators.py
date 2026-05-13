import re


class AnswerValidationError(Exception):
    pass


def validate_answer(question, answer, valid_choice_ids: set) -> None:
    if answer is None:
        if question.required:
            raise AnswerValidationError("Question is required")
        return

    if question.type == "TEXT":
        if question.regex_pattern:
            if not re.fullmatch(question.regex_pattern, str(answer)):
                raise AnswerValidationError(
                    f"Answer does not match required pattern: {question.regex_pattern}"
                )

    elif question.type == "INTEGER":
        if question.min_value is not None and answer < question.min_value:
            raise AnswerValidationError(f"Answer must be >= {question.min_value}")
        if question.max_value is not None and answer > question.max_value:
            raise AnswerValidationError(f"Answer must be <= {question.max_value}")

    elif question.type == "ENUM":
        if answer not in valid_choice_ids:
            raise AnswerValidationError("Invalid choice")
