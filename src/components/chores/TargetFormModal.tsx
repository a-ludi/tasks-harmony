import { useState } from 'react';
import type { Question, Completion, Answer } from '@/types';
import { validateAnswer } from '@/questions/validation';
import { getAnswerDisplay } from '@/questions/display';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AnswerForm from '@/components/completion/AnswerForm';
import type { DraftTarget } from '@/store';

interface Props {
  questions: Question[];
  unlinkedCompletions: Completion[]; // completions with no targetId, for import suggestions
  initialDraft?: DraftTarget;         // present when editing; absent when adding new
  onSave: (draft: DraftTarget) => void;
  onClose: () => void;
}

export default function TargetFormModal({ questions, unlinkedCompletions, initialDraft, onSave, onClose }: Props) {
  // Show step 1 only when adding new AND there are unlinked completions to suggest
  const showStep1 = !initialDraft && unlinkedCompletions.length > 0;
  const [step, setStep] = useState<1 | 2>(showStep1 ? 1 : 2);

  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(
      questions.map((q) => [q.id, initialDraft?.answers.find((a) => a.questionId === q.id)?.value ?? null]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkedCompletionId, setLinkedCompletionId] = useState<string | undefined>(initialDraft?.linkedCompletionId);

  function handleImport(completion: Completion) {
    const imported = Object.fromEntries(
      questions.map((q) => [q.id, completion.answers.find((a) => a.questionId === q.id)?.value ?? null]),
    );
    setAnswers(imported);
    setLinkedCompletionId(completion.id);
    setStep(2);
  }

  function handleChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  function handleSave() {
    const newErrors: Record<string, string> = {};
    // Validate non-null answers against their question constraints
    for (const q of questions) {
      const val = answers[q.id] ?? null;
      if (val !== null) {
        const answer: Answer = { questionId: q.id, value: val };
        const err = validateAnswer(answer, { ...q, required: true });
        if (err) newErrors[q.id] = err;
      }
    }
    // Require at least one filled answer
    const hasAny = questions.some((q) => answers[q.id] !== null);
    if (!hasAny) {
      newErrors[questions[0]?.id ?? ''] = 'At least one answer must be provided.';
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    const answerList: Answer[] = questions
      .filter((q) => answers[q.id] !== null)
      .map((q) => ({ questionId: q.id, value: answers[q.id]! }));

    onSave({
      id: initialDraft?.id ?? crypto.randomUUID(),
      order: initialDraft?.order ?? 0,
      answers: answerList,
      linkedCompletionId,
    });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initialDraft ? 'Edit Target' : 'Add Target'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select a past completion to pre-fill this target, or skip to enter manually.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">Completed at</th>
                      {questions.map((q) => (
                        <th key={q.id} className="py-2 pr-4 font-medium text-foreground">{q.prompt}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unlinkedCompletions.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border hover:bg-muted cursor-pointer"
                        onClick={() => handleImport(c)}
                      >
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{formatDate(c.completedAt)}</td>
                        {questions.map((q) => (
                          <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">Pre-fill at least one answer for this target. Leave others blank to have them filled at completion time.</p>
              <AnswerForm
                questions={questions}
                answers={answers}
                errors={errors}
                onChange={handleChange}
              />
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 mt-4">
          {step === 1 ? (
            <>
              <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
              <Button variant="outline" type="button" onClick={() => setStep(2)}>Skip — enter manually</Button>
            </>
          ) : (
            <>
              {showStep1 && (
                <Button variant="outline" type="button" onClick={() => setStep(1)}>← Back</Button>
              )}
              {!showStep1 && <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>}
              <Button type="button" onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white">
                Save target
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
