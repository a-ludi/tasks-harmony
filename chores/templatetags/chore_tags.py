from django import template
from xp.formulas import calculate_xp

register = template.Library()


@register.simple_tag
def xp_preview(instance):
    settings = instance.owner.profile.xp_settings
    return calculate_xp(instance.definition.base_xp, instance.streak_count, settings)
