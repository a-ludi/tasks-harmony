import { useState, useEffect } from 'react';
import type { QuestionType, EnumChoice } from '@/types';
import { isSafeRegex } from '@/questions/validation';
import EnumChoicesEditor from './EnumChoicesEditor';

export type DraftQuestion = {
  id: string;
  choreKey: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  order: number;
  regexPattern?: string;
  minValue?: number;
  maxValue?: number;
  choices?: EnumChoice[];
  _isNew?: boolean;
  _deleted?: boolean;
};

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'INTEGER', label: 'Integer' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'ENUM', label: 'Multiple Choice' },
];

interface Props {
  question: DraftQuestion;
  onChange: (updated: DraftQuestion) => void;
}

export default function QuestionFormFields({ question, onChange }: Props) {
  const [regexError, setRegexError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (question.type === 'TEXT' && question.regexPattern) {
      const result = isSafeRegex(question.regexPattern);
      setRegexError(result.valid ? undefined : result.error);
    } else {
      setRegexError(undefined);
    }
  }, [question.type, question.regexPattern]);

  function update(partial: Partial<DraftQuestion>) {
    onChange({ ...question, ...partial });
  }

  function handleTypeChange(newType: QuestionType) {
    update({
      type: newType,
      regexPattern: undefined,
      minValue: undefined,
      maxValue: undefined,
      choices: newType === 'ENUM' ? (question.choices ?? []) : undefined,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Question Prompt <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={question.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="e.g. How many minutes did it take?"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-32">
          <label className="mb-1 block text-xs font-medium text-gray-700">Type</label>
          <select
            value={question.type}
            onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) => update({ required: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 accent-blue-600"
            />
            Required
          </label>
        </div>
      </div>

      {question.type === 'TEXT' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Regex Pattern <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={question.regexPattern ?? ''}
            onChange={(e) => update({ regexPattern: e.target.value || undefined })}
            placeholder="e.g. ^\d{4}$"
            className={`w-full rounded border px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 ${
              regexError ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
            }`}
          />
          {regexError && <p className="mt-1 text-xs text-red-600">{regexError}</p>}
          {!regexError && question.regexPattern && (
            <p className="mt-1 text-xs text-green-600">Pattern is valid</p>
          )}
        </div>
      )}

      {question.type === 'INTEGER' && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Min Value <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={question.minValue ?? ''}
              onChange={(e) => update({ minValue: e.target.value !== '' ? Number(e.target.value) : undefined })}
              placeholder="None"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Max Value <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={question.maxValue ?? ''}
              onChange={(e) => update({ maxValue: e.target.value !== '' ? Number(e.target.value) : undefined })}
              placeholder="None"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
      )}

      {question.type === 'ENUM' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Choices</label>
          <EnumChoicesEditor
            choices={question.choices ?? []}
            onChange={(choices) => update({ choices })}
          />
        </div>
      )}
    </div>
  );
}
