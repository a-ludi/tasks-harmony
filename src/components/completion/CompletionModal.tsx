import { useState } from 'react';
import type { Question, Answer } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
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
    if (errors[questionId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    for (const question of sortedQuestions) {
      const answer: Answer = { questionId: question.id, value: answers[question.id] ?? null };
      const error = validateAnswer(answer, question);
      if (error) {
        newErrors[question.id] = error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const answerList: Answer[] = sortedQuestions.map((q) => ({
        questionId: q.id,
        value: answers[q.id] ?? null,
      }));
      await recordCompletion(choreKey, answerList);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Complete Chore</h2>
        <p className="mb-4 text-sm text-gray-500">
          Please answer the following questions to record your completion.
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {sortedQuestions.map((question) => (
            <AnswerField
              key={question.id}
              question={question}
              value={answers[question.id] ?? null}
              error={errors[question.id]}
              onChange={(value) => handleChange(question.id, value)}
            />
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                submitting ? 'cursor-not-allowed bg-green-300' : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
              }`}
            >
              {submitting ? 'Saving…' : 'Submit & Complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
