import type { Question } from '@/types';
import AnswerField from './AnswerField';

interface Props {
  questions: Question[];
  answers: Record<string, string | number | boolean | null>;
  errors: Record<string, string>;
  onChange: (questionId: string, value: string | number | boolean | null) => void;
}

export default function AnswerForm({ questions, answers, errors, onChange }: Props) {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-4">
      {sorted.map((question) => (
        <AnswerField
          key={question.id}
          question={question}
          value={answers[question.id] ?? null}
          error={errors[question.id]}
          onChange={(value) => onChange(question.id, value)}
        />
      ))}
    </div>
  );
}
