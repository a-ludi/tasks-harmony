import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Pack, XPSize } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MarkdownEditor } from '@/components/ui/MarkdownEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { XP_BASE } from '@/xp/calculator';

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Resolve the defaultXPSize value for updatePackManifest from the UI dropdown state.
 * The sentinel 'NONE' represents "no selection" (Radix UI does not allow empty string).
 */
export function resolveDefaultXPSize(
  defaultXPSize: XPSize | 'CUSTOM' | 'NONE',
  customDefaultXP: string,
): XPSize | number | undefined {
  const isCustom = defaultXPSize === 'CUSTOM';
  if (isCustom && customDefaultXP.trim()) {
    return Math.max(1, Math.floor(Number(customDefaultXP) || 1));
  } else if (!isCustom && defaultXPSize !== 'NONE') {
    return defaultXPSize as XPSize;
  }
  // 'NONE' sentinel → undefined (no default)
  return undefined;
}

interface Props {
  pack: Pack;
  onClose: () => void;
}

export default function PackOptionsModal({ pack, onClose }: Props) {
  const updatePackManifest = useAppStore((s) => s.updatePackManifest);

  const [title, setTitle] = useState(pack.manifest.title);
  const [description, setDescription] = useState(pack.manifest.description ?? '');
  const [streak, setStreak] = useState(pack.manifest.streak ?? true);
  const [decay, setDecay] = useState(pack.manifest.decay ?? true);
  const [xpTarget, setXpTarget] = useState(
    pack.manifest.xpTarget != null ? String(pack.manifest.xpTarget) : ''
  );
  const [targetDate, setTargetDate] = useState(pack.manifest.targetDate ?? '');
  const [allowShiftOnImport, setAllowShiftOnImport] = useState(
    pack.manifest.allowShiftOnImport ?? false
  );

  // Default XP size — same CUSTOM pattern as ChoreFormModal
  const initialDefaultXP = pack.manifest.defaultXPSize;
  const [defaultXPSize, setDefaultXPSize] = useState<XPSize | 'CUSTOM' | 'NONE'>(
    typeof initialDefaultXP === 'number' ? 'CUSTOM'
      : (initialDefaultXP ?? 'NONE')
  );
  const [customDefaultXP, setCustomDefaultXP] = useState(
    typeof initialDefaultXP === 'number' ? String(initialDefaultXP) : ''
  );
  const isCustomDefaultXP = defaultXPSize === 'CUSTOM';

  const [titleError, setTitleError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    if (!title.trim()) { setTitleError('Title is required.'); return; }
    setTitleError('');
    setSubmitting(true);

    const xpTargetVal = xpTarget.trim() ? Number(xpTarget) : undefined;
    const targetDateVal = targetDate.trim() || undefined;

    const defaultXPSizeVal = resolveDefaultXPSize(defaultXPSize, customDefaultXP);

    await updatePackManifest(pack.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      streak,
      decay,
      xpTarget: xpTargetVal,
      targetDate: targetDateVal,
      allowShiftOnImport,
      defaultXPSize: defaultXPSizeVal,
    });
    setSubmitting(false);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pack Options</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Details section */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Details</h3>
            <div className="space-y-1">
              <Label htmlFor="pack-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="pack-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={titleError ? 'border-destructive' : ''}
              />
              {titleError && <p className="text-xs text-destructive">{titleError}</p>}
            </div>
            <div className="space-y-1">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <MarkdownEditor value={description} onChange={setDescription} />
            </div>
          </section>

          {/* Scoring section */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Scoring</h3>

            {/* Streaks enabled toggle */}
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pack-streak" className="font-normal cursor-pointer">Streaks enabled</Label>
              <Switch
                id="pack-streak"
                checked={streak}
                onCheckedChange={setStreak}
              />
            </div>

            {/* Decay enabled toggle */}
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pack-decay" className="font-normal cursor-pointer">Decay enabled</Label>
              <Switch
                id="pack-decay"
                checked={decay}
                onCheckedChange={setDecay}
              />
            </div>

            {/* Default XP size — same CUSTOM dropdown pattern as ChoreFormModal */}
            <div className="space-y-1">
              <Label htmlFor="pack-default-xp">Default XP size</Label>
              {isCustomDefaultXP ? (
                <div className="flex items-center gap-2">
                  <Input
                    id="pack-default-xp"
                    type="number"
                    min="1"
                    step="1"
                    value={customDefaultXP}
                    onChange={(e) => setCustomDefaultXP(e.target.value)}
                    className="w-28"
                    placeholder="e.g. 15"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setDefaultXPSize('S'); setCustomDefaultXP(''); }}
                  >
                    Use preset
                  </Button>
                </div>
              ) : (
                <Select
                  value={defaultXPSize}
                  onValueChange={(v) => {
                    if (v === 'CUSTOM') { setDefaultXPSize('CUSTOM'); }
                    else { setDefaultXPSize(v as XPSize | 'NONE'); }
                  }}
                >
                  <SelectTrigger id="pack-default-xp">
                    <SelectValue placeholder="None (use app default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None (use app default)</SelectItem>
                    {XP_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size} ({XP_BASE[size]} XP)
                      </SelectItem>
                    ))}
                    <SelectItem value="CUSTOM">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* XP target number input */}
            <div className="space-y-1">
              <Label htmlFor="pack-xp-target">XP target <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="pack-xp-target"
                type="number"
                min="1"
                step="1"
                value={xpTarget}
                onChange={(e) => setXpTarget(e.target.value)}
                placeholder="e.g. 1000"
              />
            </div>

            {/* Target date input */}
            <div className="space-y-1">
              <Label htmlFor="pack-target-date">Target date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="pack-target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>

            {/* Allow shift on import toggle */}
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pack-allow-shift" className="font-normal cursor-pointer">Allow shift on import</Label>
              <Switch
                id="pack-allow-shift"
                checked={allowShiftOnImport}
                onCheckedChange={setAllowShiftOnImport}
              />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
