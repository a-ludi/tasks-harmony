import { useState } from 'react';
import type { Question, Answer, QuickAnswerSet } from '@/types';
import AnswerField from '@/components/completion/AnswerField';

interface Props {
  choreKey: string;
  questions: Question[];
  existingSet?: QuickAnswerSet;
  onSave: (qas: QuickAnswerSet) => void;
  onClose: () => void;
}

export default function QuickAnswerSetModal({
  choreKey,
  questions,
  existingSet,
  onSave,
  onClose,
}: Props) {
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const [label, setLabel] = useState(existingSet?.label ?? '');
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => {
      const initial: Record<string, string | number | boolean | null> = {};
      for (const q of sortedQuestions) {
        const existing = existingSet?.answers.find((a) => a.questionId === q.id);
        initial[q.id] = existing?.value ?? null;
      }
      return initial;
    },
  );
  const [labelError, setLabelError] = useState<string | null>(null);

  function handleSave() {
    if (!label.trim()) {
      setLabelError('Name is required.');
      return;
    }
    const answerList: Answer[] = sortedQuestions.map((q) => ({
      questionId: q.id,
      value: answers[q.id] ?? null,
    }));
    onSave({
      id: existingSet?.id ?? crypto.randomUUID(),
      choreKey,
      label: label.trim(),
      answers: answerList,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {existingSet ? 'Edit Quick Answer' : 'New Quick Answer'}
        </h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => { setLabel(e.target.value); setLabelError(null); }}
            placeholder="e.g. Default, Quick, Minimal"
            autoFocus
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              labelError ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
            }`}
          />
          {labelError && <p className="mt-1 text-xs text-red-600">{labelError}</p>}
        </div>

        {sortedQuestions.length > 0 && (
          <div className="mb-4 space-y-4">
            <p className="text-sm text-gray-500">
              Pre-fill answers below. Optional questions can be left blank.
            </p>
            {sortedQuestions.map((question) => (
              <AnswerField
                key={question.id}
                question={question}
                value={answers[question.id] ?? null}
                onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
              />
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
