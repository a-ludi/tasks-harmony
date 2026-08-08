import { useState } from 'react';
import type { Chore, Completion, Question, Answer } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { getCurrentWindowIndex, getWindowStart, getWindowEnd } from '@/chores/recurrence';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AnswerField from './AnswerField';

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Props {
  completion: Completion;
  chore: Chore;
  choreCompletions: Completion[];
  questions: Question[];
  onClose: () => void;
}

export default function AmendCompletionModal({ completion, chore, choreCompletions, questions, onClose }: Props) {
  const amendCompletion = useAppStore((s) => s.amendCompletion);
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const completedAtDate = new Date(completion.completedAt);
  const windowIdx = getCurrentWindowIndex(chore.recurrence, completedAtDate) ?? 0;
  const windowStart = getWindowStart(chore.recurrence, windowIdx);
  const windowEnd = getWindowEnd(chore.recurrence, windowIdx);

  const sortedSiblings = choreCompletions
    .filter((c) => c.id !== completion.id)
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  const prev = sortedSiblings.filter((c) => new Date(c.completedAt) < completedAtDate).at(-1);
  const next = sortedSiblings.find((c) => new Date(c.completedAt) > completedAtDate);

  const minDate = prev
    ? new Date(Math.max(windowStart.getTime(), new Date(prev.completedAt).getTime() + 1000))
    : windowStart;
  const maxDate = next
    ? new Date(Math.min(windowEnd.getTime() - 1000, new Date(next.completedAt).getTime() - 1000))
    : new Date(windowEnd.getTime() - 1000);

  const [completedAt, setCompletedAt] = useState(toDatetimeLocal(completedAtDate));
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(sortedQuestions.map((q) => {
      const existing = completion.answers.find((a) => a.questionId === q.id);
      return [q.id, existing?.value ?? null];
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      await amendCompletion(completion.id, {
        completedAt: new Date(completedAt).toISOString(),
        answers: answerList,
      });
      onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Completion</DialogTitle>
        </DialogHeader>
        <form id="amend-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1">
            <Label>Completed at</Label>
            <input
              type="datetime-local"
              value={completedAt}
              min={toDatetimeLocal(minDate)}
              max={toDatetimeLocal(maxDate)}
              onChange={(e) => setCompletedAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {sortedQuestions.map((question) => (
            <AnswerField
              key={question.id}
              question={question}
              value={answers[question.id] ?? null}
              error={errors[question.id]}
              onChange={(value) => handleChange(question.id, value)}
            />
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="amend-form" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
