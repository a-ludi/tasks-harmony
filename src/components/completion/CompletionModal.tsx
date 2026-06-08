import { useState } from 'react';
import type { Question, Answer } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AnswerField from './AnswerField';

interface Props {
  choreKey: string;
  questions: Question[];
  onClose: () => void;
}

export default function CompletionModal({ choreKey, questions, onClose }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(sortedQuestions.map((q) => [q.id, null])),
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
      await recordCompletion(choreKey, answerList);
      onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Chore</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Please answer the following questions to record your completion.</p>
        <form id="completion-form" onSubmit={handleSubmit} noValidate className="space-y-4">
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
          <Button type="submit" form="completion-form" disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Submit & Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
