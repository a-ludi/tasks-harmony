from django import template
from xp.formulas import calculate_xp

register = template.Library()


@register.simple_tag
def xp_preview(instance):
    settings = instance.owner.profile.xp_settings
    return calculate_xp(instance.definition.base_xp, instance.streak_count, settings)


@register.filter
def get_item(dictionary, key):
    if not isinstance(dictionary, dict):
        return None
    return dictionary.get(key)
