from django import forms
from django.forms import inlineformset_factory
from .models import ChoreDefinition, Question


class ChoreDefinitionForm(forms.ModelForm):
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
