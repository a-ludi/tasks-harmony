import re
import threading
from datetime import date
from django import forms
from django.forms import inlineformset_factory
from django.utils.safestring import mark_safe
from dateutil.rrule import rrulestr
from .models import ChoreDefinition, Question

FREQ_CHOICES = [
    ("DAILY", "Daily"),
    ("WEEKLY", "Weekly"),
    ("MONTHLY", "Monthly"),
]


def _parse_recurrence(value):
    """Parse stored RRULE string into (freq, interval, dtstart_date)."""
    freq, interval, dtstart = "DAILY", 1, None
    for line in (value or "").splitlines():
        upper = line.upper().strip()
        if upper.startswith("DTSTART:"):
            ts = upper[8:]
            try:
                dtstart = date(int(ts[0:4]), int(ts[4:6]), int(ts[6:8]))
            except (ValueError, IndexError):
                pass
        elif upper.startswith("RRULE:"):
            params = {}
            for part in upper[6:].split(";"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    params[k] = v
            freq = params.get("FREQ", "DAILY")
            try:
                interval = int(params.get("INTERVAL", "1"))
            except ValueError:
                interval = 1
    return freq, interval, dtstart


class ChoreDefinitionForm(forms.ModelForm):
    recurrence_freq = forms.ChoiceField(
        choices=FREQ_CHOICES,
        label="Frequency",
    )
    recurrence_interval = forms.IntegerField(
        min_value=1,
        initial=1,
        label="Every N periods",
        help_text="e.g. 2 means every 2 days / weeks / months",
    )
    recurrence_dtstart = forms.DateField(
        label="Start date",
        widget=forms.DateInput(attrs={"type": "date"}),
    )

    class Meta:
        model = ChoreDefinition
        fields = ["name", "description", "xp_size"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk and self.instance.recurrence:
            freq, interval, dtstart = _parse_recurrence(str(self.instance.recurrence))
            self.fields["recurrence_freq"].initial = freq
            self.fields["recurrence_interval"].initial = interval
            self.fields["recurrence_dtstart"].initial = dtstart

    def clean(self):
        cleaned = super().clean()
        freq = cleaned.get("recurrence_freq")
        interval = cleaned.get("recurrence_interval", 1)
        dtstart = cleaned.get("recurrence_dtstart")
        if freq and dtstart:
            date_str = dtstart.strftime("%Y%m%dT000000Z")
            cleaned["recurrence"] = f"DTSTART:{date_str}\nRRULE:FREQ={freq};INTERVAL={interval}"
        return cleaned

    def save(self, commit=True):
        instance = super().save(commit=False)
        instance.recurrence = self.cleaned_data["recurrence"]
        if commit:
            instance.save()
        return instance


class QuestionForm(forms.ModelForm):
    choice_labels = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 2, "placeholder": "One choice per line"}),
        label="Choices",
        help_text="ENUM only — one option per line, in display order",
    )

    class Meta:
        model = Question
        fields = ["text", "type", "required", "order", "regex_pattern", "min_value", "max_value"]
        widgets = {
            "order": forms.HiddenInput(),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk and self.instance.type == "ENUM":
            labels = list(self.instance.choices.order_by("order").values_list("label", flat=True))
            self.fields["choice_labels"].initial = "\n".join(labels)
        if not self.instance.pk:
            self.fields["required"].initial = True

    def clean_regex_pattern(self):
        pattern = self.cleaned_data.get("regex_pattern", "")
        if not pattern:
            return pattern
        try:
            compiled = re.compile(pattern)
        except re.error as exc:
            raise forms.ValidationError(f"Invalid regular expression: {exc}")
        # Detect catastrophic backtracking: run against a worst-case input in a
        # daemon thread and reject patterns that don't finish within 1 second.
        finished = threading.Event()
        def _probe():
            try:
                re.fullmatch(compiled, "a" * 30 + "!")
            except Exception:
                pass
            finished.set()
        threading.Thread(target=_probe, daemon=True).start()
        if not finished.wait(timeout=1.0):
            raise forms.ValidationError(
                "Regular expression timed out — it appears to be catastrophically "
                "backtracking. Simplify the pattern."
            )
        return pattern


QuestionFormSet = inlineformset_factory(
    ChoreDefinition,
    Question,
    form=QuestionForm,
    extra=0,
    can_delete=True,
    can_order=False,
)
