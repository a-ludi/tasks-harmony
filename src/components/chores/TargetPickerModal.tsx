import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { Question, Answer, Completion } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AnswerForm from '@/components/completion/AnswerForm';
import TargetsTable from './TargetsTable';

interface Props {
  choreKey: string;
  questions: Question[];
  onClose: () => void;
}

type Step = 'pick' | 'answer' | 'celebrate';

function CelebrationStep({ bonusXP, totalTargets, onClose }: { bonusXP?: number; totalTargets: number; onClose: () => void }) {
  useEffect(() => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <style>{`
        @keyframes trophy-bounce {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .trophy-bounce { animation: trophy-bounce 0.5s ease-out; }
      `}</style>
      <img
        src="/trophy.svg"
        alt="Trophy"
        className="w-32 h-32 trophy-bounce"
      />
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Set Complete!</h2>
        <p className="text-muted-foreground text-sm">
          You've completed all {totalTargets} target{totalTargets !== 1 ? 's' : ''}.
        </p>
        {bonusXP !== undefined && (
          <p className="mt-2 text-amber-600 dark:text-amber-400 font-semibold text-lg">
            +{bonusXP} XP bonus
          </p>
        )}
      </div>
    </div>
  );
}

export default function TargetPickerModal({ choreKey, questions, onClose }: Props) {
  const allTargets = useAppStore((s) => s.targets);
  const targets = allTargets.filter((t) => t.choreKey === choreKey);
  const allCompletions = useAppStore((s) => s.completions);
  const completions = allCompletions.filter((c) => c.choreKey === choreKey);
  const recordCompletion = useAppStore((s) => s.recordCompletion);

  const [step, setStep] = useState<Step>('pick');
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [bonusXP, setBonusXP] = useState<number | undefined>();

  const selectedTarget = targets.find((t) => t.id === selectedTargetId);

  // Questions that are NOT pre-filled by the selected target
  const unfilledQuestions = selectedTarget
    ? questions.filter((q) => !selectedTarget.answers.some((a) => a.questionId === q.id && a.value !== null))
    : [];

  function handleChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  }

  async function submitCompletion() {
    if (!selectedTarget) return;
    setSubmitting(true);
    try {
      // Merge pre-filled answers with user-entered answers
      const mergedAnswers: Answer[] = [
        ...selectedTarget.answers,
        ...unfilledQuestions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? null })),
      ];
      const result = await recordCompletion(choreKey, mergedAnswers, selectedTargetId);
      if (result.setCompletionBonus !== undefined) {
        setBonusXP(result.setCompletionBonus);
        setStep('celebrate');
      } else {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete() {
    if (!selectedTarget) return;
    if (unfilledQuestions.length > 0 && step === 'pick') {
      setStep('answer');
      return;
    }
    if (unfilledQuestions.length > 0 && step === 'answer') {
      const newErrors: Record<string, string> = {};
      for (const q of unfilledQuestions) {
        const answer: Answer = { questionId: q.id, value: answers[q.id] ?? null };
        const err = validateAnswer(answer, q);
        if (err) newErrors[q.id] = err;
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }
    await submitCompletion();
  }

  const title = step === 'pick' ? 'Complete Target' : step === 'answer' ? 'Fill in Answers' : 'Set Complete!';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && step !== 'celebrate') onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {step === 'pick' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Select a target to complete.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowCompleted((v) => !v)}
                >
                  {showCompleted ? 'Hide completed' : 'Show completed'}
                </Button>
              </div>
              <TargetsTable
                targets={targets}
                completions={completions}
                questions={questions}
                showCompleted={showCompleted}
                interactive
                selectedTargetId={selectedTargetId}
                onSelect={setSelectedTargetId}
              />
            </div>
          )}

          {step === 'answer' && (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">Fill in the remaining answers for this completion.</p>
              <AnswerForm
                questions={unfilledQuestions}
                answers={answers}
                errors={errors}
                onChange={handleChange}
              />
            </div>
          )}

          {step === 'celebrate' && (
            <CelebrationStep bonusXP={bonusXP} totalTargets={targets.length} onClose={onClose} />
          )}
        </div>

        <DialogFooter className="border-t pt-4 mt-4 sticky bottom-0 bg-background">
          {step === 'pick' && (
            <>
              <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
              <Button
                type="button"
                disabled={!selectedTargetId || submitting}
                onClick={handleComplete}
                className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Complete'}
              </Button>
            </>
          )}
          {step === 'answer' && (
            <>
              <Button variant="outline" type="button" onClick={() => setStep('pick')}>← Back</Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={handleComplete}
                className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Complete'}
              </Button>
            </>
          )}
          {step === 'celebrate' && (
            <Button type="button" onClick={onClose} className="w-full">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
