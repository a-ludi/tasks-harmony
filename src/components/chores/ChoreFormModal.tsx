import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Chore, XPSize, RecurrenceFrequency, DuePeriodUnit } from '@/types';
import type { QuickAnswerSet } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MarkdownEditor } from '@/components/ui/MarkdownEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import QuestionBuilder from '@/components/questions/QuestionBuilder';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';
import { validateQuestionDrafts } from './choreFormValidation';
import { XP_BASE } from '@/xp/calculator';
import { buildXPPreview } from '@/xp/xpPreview';
import QuickAnswerSetModal from './QuickAnswerSetModal';
import { QUICK_ANSWER_SET_LIMIT } from '@/config';

interface Props {
  chore?: Chore;
  packId: string;
  onClose: () => void;
}

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly'];

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

interface FormErrors {
  title?: string;
  interval?: string;
  startDate?: string;
  questions?: string;
  pack?: string;
}

export default function ChoreFormModal({ chore, packId, onClose }: Props) {
  const addChore = useAppStore((s) => s.addChore);
  const updateChore = useAppStore((s) => s.updateChore);
  const saveQuestions = useAppStore((s) => s.saveQuestions);
  const packs = useAppStore((s) => s.packs);
  const allQuestions = useAppStore((s) => s.questions);
  const xpSettings = useAppStore((s) => s.xpSettings);
  const profile = useAppStore((s) => s.profile);
  const allQuickAnswerSets = useAppStore((s) => s.quickAnswerSets);
  const saveQuickAnswerSet = useAppStore((s) => s.saveQuickAnswerSet);
  const removeQuickAnswerSet = useAppStore((s) => s.removeQuickAnswerSet);
  const moveChore = useAppStore((s) => s.moveChore);
  const chores = useAppStore((s) => s.chores);

  const isEdit = chore !== undefined;

  const [title, setTitle] = useState(chore?.title ?? '');
  const [description, setDescription] = useState(chore?.description ?? '');
  const [xpSize, setXpSize] = useState<XPSize>((chore?.xpSize as XPSize | undefined) ?? 'S');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(chore?.recurrence.frequency ?? 'daily');
  const [interval, setInterval] = useState<string>(String(chore?.recurrence.interval ?? 1));
  const [startDate, setStartDate] = useState(chore?.recurrence.startDate ?? todayString());
  const [windowStartTime, setWindowStartTime] = useState(chore?.recurrence.windowStartTime ?? '00:00');
  const [repeatable, setRepeatable] = useState(chore?.repeatable ?? false);
  const [duePeriodValue, setDuePeriodValue] = useState<string>(
    chore?.duePeriod ? String(chore.duePeriod.value) : ''
  );
  const [duePeriodUnit, setDuePeriodUnit] = useState<DuePeriodUnit>(
    chore?.duePeriod?.unit ?? 'hours'
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState(packId);

  const activeSettings = xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];
  const xpPreview = activeSettings ? buildXPPreview(xpSize, activeSettings) : null;

  const choreKey = isEdit ? chore!.key : null;
  const initialQuestions = choreKey ? allQuestions.filter((q) => q.choreKey === choreKey) : [];
  const [questionDrafts, setQuestionDrafts] = useState<DraftQuestion[]>(() => initialQuestions.map((q) => ({ ...q })));
  const choreQuickSets = isEdit ? allQuickAnswerSets.filter((s) => s.choreKey === chore!.key) : [];
  const [editingSet, setEditingSet] = useState<QuickAnswerSet | null | 'new'>(null);

  function handlePackChange(newPackId: string) {
    setSelectedPackId(newPackId);
    if (!chore) return;
    const collision = chores.some((c) => c.packId === newPackId && c.choreId === chore.choreId && c.key !== chore.key);
    setErrors((prev) => ({ ...prev, pack: collision ? `A chore with ID "${chore.choreId}" already exists in this pack.` : undefined }));
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!title.trim()) errs.title = 'Title is required.';
    const intervalNum = Number(interval);
    if (!Number.isInteger(intervalNum) || intervalNum < 1) errs.interval = 'Interval must be a whole number of 1 or more.';
    if (!startDate) { errs.startDate = 'Start date is required.'; }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { errs.startDate = 'Start date must be in YYYY-MM-DD format.'; }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    const regexErr = validateQuestionDrafts(questionDrafts);
    if (regexErr) errs.questions = regexErr;
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);
    try {
      const duePeriod = duePeriodValue.trim() && Number(duePeriodValue) > 0
        ? { value: Number(duePeriodValue), unit: duePeriodUnit }
        : undefined;

      if (isEdit && chore) {
        const packChanged = selectedPackId !== chore.packId;
        if (packChanged) {
          const moved = await moveChore(chore.key, selectedPackId);
          if (!moved) { setErrors((prev) => ({ ...prev, pack: `A chore with ID "${chore.choreId}" already exists in this pack.` })); setSubmitting(false); return; }
        }
        const activeChoreKey = packChanged ? `${selectedPackId}/${chore.choreId}` : chore.key;
        await updateChore({ ...chore, key: activeChoreKey, packId: selectedPackId, title: title.trim(), description: description.trim() || undefined, xpSize, recurrence: { frequency, interval: Number(interval), startDate, windowStartTime }, repeatable, duePeriod });
        if (questionDrafts.length > 0 || initialQuestions.length > 0) {
          await saveQuestions(activeChoreKey, questionDrafts.map((d) => ({ ...d, choreKey: activeChoreKey })));
        }
      } else {
        const newChoreKey = await addChore({ packId: selectedPackId, title: title.trim(), description: description.trim() || undefined, xpSize, recurrence: { frequency, interval: Number(interval), startDate, windowStartTime }, repeatable, duePeriod, active: true });
        if (questionDrafts.some((d) => !d._deleted)) {
          await saveQuestions(newChoreKey, questionDrafts.map((d) => ({ ...d, choreKey: newChoreKey })));
        }
      }
      onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Chore' : 'New Chore'}</DialogTitle>
          </DialogHeader>

          <form id="chore-form" onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chore-title">Title <span className="text-destructive">*</span></Label>
              <Input id="chore-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Clean the bathroom" className={errors.title ? 'border-destructive' : ''} />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <MarkdownEditor value={description} onChange={setDescription} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chore-pack">Pack</Label>
              <Select value={selectedPackId} onValueChange={(v) => isEdit ? handlePackChange(v) : setSelectedPackId(v)}>
                <SelectTrigger id="chore-pack" className={errors.pack ? 'border-destructive' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {packs.map((p) => <SelectItem key={p.id} value={p.id}>{p.manifest.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.pack && <p className="text-xs text-destructive">{errors.pack}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="chore-xp-size">XP Size</Label>
              <Select value={xpSize} onValueChange={(v) => setXpSize(v as XPSize)}>
                <SelectTrigger id="chore-xp-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {XP_SIZES.map((size) => <SelectItem key={size} value={size}>{size} ({XP_BASE[size]} XP)</SelectItem>)}
                </SelectContent>
              </Select>
              {xpPreview && <p className="text-xs text-primary">{xpPreview}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="chore-frequency">Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
                <SelectTrigger id="chore-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chore-interval">Interval</Label>
              <Input id="chore-interval" type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} className={errors.interval ? 'border-destructive' : ''} />
              {errors.interval && <p className="text-xs text-destructive">{errors.interval}</p>}
              <p className="text-xs text-muted-foreground">e.g. interval 2 with "weekly" = every 2 weeks</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chore-start-date">Start Date <span className="text-destructive">*</span></Label>
              <Input id="chore-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={errors.startDate ? 'border-destructive' : ''} />
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="chore-window-start-time">Window Start Time</Label>
              <Input id="chore-window-start-time" type="time" value={windowStartTime} onChange={(e) => setWindowStartTime(e.target.value)} />
              <p className="text-xs text-muted-foreground">When does your day start for this chore? Default 00:00. E.g. 18:00 for evening routines.</p>
            </div>

            <div className="flex items-center gap-3">
              <input id="chore-repeatable" type="checkbox" checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
              <Label htmlFor="chore-repeatable" className="font-normal">Repeatable (allow multiple completions per window)</Label>
            </div>

            <div className="space-y-1">
              <Label>Due period</Label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={duePeriodValue}
                  onChange={(e) => setDuePeriodValue(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Select value={duePeriodUnit} onValueChange={(v) => setDuePeriodUnit(v as DuePeriodUnit)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minutes</SelectItem>
                    <SelectItem value="hours">hours</SelectItem>
                    <SelectItem value="days">days</SelectItem>
                    <SelectItem value="weeks">weeks</SelectItem>
                    <SelectItem value="months">months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Chore becomes due this long before the window ends. Leave blank to show as due from window open.
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">Questions</h3>
                <span className="text-xs text-muted-foreground">
                  {questionDrafts.filter((d) => !d._deleted).length > 0 ? `${questionDrafts.filter((d) => !d._deleted).length} question(s)` : 'None'}
                </span>
              </div>
              {errors.questions && <p className="mb-2 text-xs text-destructive">{errors.questions}</p>}
              <QuestionBuilder choreKey={isEdit ? chore!.key : ''} initialQuestions={isEdit ? initialQuestions : []} onChange={setQuestionDrafts} />
            </div>

            {isEdit && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Quick Answers</h3>
                  {choreQuickSets.length < QUICK_ANSWER_SET_LIMIT && (
                    <Button type="button" variant="link" size="sm" onClick={() => setEditingSet('new')}>+ Add</Button>
                  )}
                </div>
                {choreQuickSets.length === 0 && <p className="text-xs text-muted-foreground">No quick answers yet. Add up to {QUICK_ANSWER_SET_LIMIT}.</p>}
                {choreQuickSets.map((set) => (
                  <div key={set.id} className="mb-1 flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm">{set.label}</span>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingSet(set)}>Edit</Button>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeQuickAnswerSet(set.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" form="chore-form" disabled={submitting || !!errors.pack}>
                {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Chore'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editingSet && (
        <QuickAnswerSetModal
          choreKey={chore!.key}
          questions={initialQuestions}
          existingSet={editingSet === 'new' ? undefined : editingSet}
          onSave={async (qas) => { await saveQuickAnswerSet(qas); setEditingSet(null); }}
          onClose={() => setEditingSet(null)}
        />
      )}
    </>
  );
}
