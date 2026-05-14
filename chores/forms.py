from django import forms
from django.forms import inlineformset_factory
from django.utils import timezone
from django.utils.safestring import mark_safe
from dateutil.rrule import rrulestr
from .models import ChoreDefinition, Question


class ChoreDefinitionForm(forms.ModelForm):
    recurrence = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 4}),
        help_text=mark_safe(
            "Enter recurrence in RRULE format. Example:<br>"
            "<code>DTSTART:20260101T000000Z<br>RRULE:FREQ=DAILY</code>"
        ),
    )

    def clean_recurrence(self):
        value = self.cleaned_data["recurrence"].strip()
        if "RRULE:" not in value.upper():
            raise forms.ValidationError(
                "Must include an RRULE line, e.g. RRULE:FREQ=DAILY."
            )
        try:
            rule = rrulestr(value, ignoretz=False)
        except Exception as exc:
            raise forms.ValidationError(f"Invalid recurrence rule: {exc}")
        try:
            rule.before(timezone.now(), inc=True)
        except TypeError:
            raise forms.ValidationError(
                "DTSTART must include a UTC timezone suffix, e.g. DTSTART:20260101T000000Z."
            )
        return value

    class Meta:
        model = ChoreDefinition
        fields = ["name", "description", "xp_size", "recurrence"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
        }


QuestionFormSet = inlineformset_factory(
    ChoreDefinition,
    Question,
    fields=["text", "type", "required", "order", "regex_pattern", "min_value", "max_value"],
    extra=0,
    can_delete=True,
    can_order=False,
)
