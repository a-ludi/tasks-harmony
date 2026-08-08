import { useState } from 'react';
import type { Chore, Question, Answer } from '@/types';
import type { EligibleWindow } from '@/chores/eligiblePastWindows';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AnswerField from './AnswerField';

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWindowLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

interface Props {
  chore: Chore;
  eligibleWindows: EligibleWindow[];
  questions: Question[];
  onClose: () => void;
}

export default function LogPastCompletionModal({ chore, eligibleWindows, questions, onClose }: Props) {
  const recordRetroactiveCompletion = useAppStore((s) => s.recordRetroactiveCompletion);
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const globalMin = toDatetimeLocal(eligibleWindows[0].start);
  const globalMax = toDatetimeLocal(new Date(eligibleWindows[eligibleWindows.length - 1].end.getTime() - 1000));

  const [completedAt, setCompletedAt] = useState(globalMax);

  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(sortedQuestions.map((q) => [q.id, null])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const selectedDate = new Date(completedAt);
  const t = selectedDate.getTime();
  const containingWindow: EligibleWindow | undefined = eligibleWindows.find(
    (w) => w.start.getTime() <= t && t < w.end.getTime(),
  );

  function handleAnswerChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!containingWindow) return;
    const newErrors: Record<string, string> = {};
    for (const question of sortedQuestions) {
      const answer: Answer = { questionId: question.id, value: answers[question.id] ?? null };
      const error = validateAnswer(answer, question);
      if (error) newErrors[question.id] = error;
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setSubmitting(true);
    try {
      const answerList: Answer[] = sortedQuestions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? null }));
      await recordRetroactiveCompletion(chore.key, {
        completedAt: new Date(completedAt).toISOString(),
        answers: answerList,
      });
      onClose();
    } catch (err) {
      console.error('Failed to log past completion:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log past completion</DialogTitle>
        </DialogHeader>
        <form id="log-past-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1">
            <Label>Completed at</Label>
            <input
              type="datetime-local"
              value={completedAt}
              min={globalMin}
              max={globalMax}
              disabled={submitting}
              onChange={(e) => setCompletedAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {!containingWindow && (
              <p className="text-sm text-destructive">This date is already recorded in another completion</p>
            )}
            {containingWindow && (
              <p className="text-sm text-muted-foreground">Window: {formatWindowLabel(containingWindow.start, containingWindow.end)}</p>
            )}
          </div>
          {sortedQuestions.map((question) => (
            <AnswerField
              key={question.id}
              question={question}
              value={answers[question.id] ?? null}
              error={errors[question.id]}
              onChange={(value) => handleAnswerChange(question.id, value)}
            />
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-past-form" disabled={submitting || !containingWindow} className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Log completion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
