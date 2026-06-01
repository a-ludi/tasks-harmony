import type { Question } from '@/types';

interface Props {
  question: Question;
  value: string | number | boolean | null;
  error?: string;
  onChange: (value: string | number | boolean | null) => void;
}

export default function AnswerField({ question, value, error, onChange }: Props) {
  const { type, prompt, required, regexPattern, minValue, maxValue, choices } = question;

  const baseInputClass = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
    error ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
  }`;

  function renderInput() {
    if (type === 'TEXT') {
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={regexPattern ? `Must match: ${regexPattern}` : undefined}
          className={baseInputClass}
        />
      );
    }

    if (type === 'INTEGER') {
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={minValue}
          max={maxValue}
          onChange={(e) => onChange(e.target.value !== '' ? Number(e.target.value) : null)}
          className={baseInputClass}
        />
      );
    }

    if (type === 'BOOLEAN') {
      return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-blue-600"
          />
          <span className="text-sm text-gray-700">Yes</span>
        </label>
      );
    }

    if (type === 'ENUM') {
      const sortedChoices = [...(choices ?? [])].sort((a, b) => a.order - b.order);
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={baseInputClass}
        >
          <option value="">— Select —</option>
          {sortedChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>{choice.label}</option>
          ))}
        </select>
      );
    }

    return null;
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {prompt}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {renderInput()}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
