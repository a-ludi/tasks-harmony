from django import forms as django_forms
from django import template
from django.utils.safestring import mark_safe
from xp.formulas import calculate_xp

register = template.Library()


@register.simple_tag
def xp_preview(instance):
    settings = instance.owner.profile.xp_settings
    return calculate_xp(instance.definition.base_xp, instance.streak_count, settings)


@register.inclusion_tag("_bs_field.html")
def bs_field(field):
    widget = field.field.widget
    errors = field.errors
    if isinstance(widget, (django_forms.Select, django_forms.SelectMultiple)):
        css_class = "form-select"
    elif isinstance(widget, django_forms.CheckboxInput):
        css_class = "form-check-input"
    else:
        css_class = "form-control"
    if errors:
        css_class += " is-invalid"
    return {
        "field": field,
        "rendered_widget": mark_safe(field.as_widget(attrs={"class": css_class})),
        "is_checkbox": isinstance(widget, django_forms.CheckboxInput),
    }


@register.filter
def get_item(dictionary, key):
    if not isinstance(dictionary, dict):
        return None
    return dictionary.get(key)
