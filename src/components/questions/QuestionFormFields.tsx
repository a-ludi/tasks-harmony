import { useState, useEffect } from 'react';
import type {
  QuestionType,
  TextQuestion, IntegerQuestion, BooleanQuestion, EnumQuestion, MultiplierQuestion,
  EnumChoice,
} from '@/types';
import { isSafeRegex } from '@/questions/validation';
import EnumChoicesEditor from './EnumChoicesEditor';
import { buildMultiplierXPPreview } from '@/xp/xpPreview';

export type DraftQuestion =
  | (TextQuestion     & { _isNew?: boolean; _deleted?: boolean })
  | (IntegerQuestion  & { _isNew?: boolean; _deleted?: boolean })
  | (BooleanQuestion  & { _isNew?: boolean; _deleted?: boolean })
  | (EnumQuestion     & { _isNew?: boolean; _deleted?: boolean })
  | (MultiplierQuestion & { _isNew?: boolean; _deleted?: boolean });

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'INTEGER', label: 'Integer' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'ENUM', label: 'Multiple Choice' },
];

interface Props {
  question: DraftQuestion;
  onChange: (updated: DraftQuestion) => void;
  hasOtherMultiplier?: boolean;
}

export default function QuestionFormFields({ question, onChange, hasOtherMultiplier = false }: Props) {
  const [regexError, setRegexError] = useState<string | undefined>(undefined);

  const regexPattern = question.type === 'TEXT' ? question.regexPattern : undefined;

  useEffect(() => {
    if (question.type === 'TEXT' && regexPattern) {
      const result = isSafeRegex(regexPattern);
      setRegexError(result.valid ? undefined : result.error);
    } else {
      setRegexError(undefined);
    }
  }, [question.type, regexPattern]);

  function update(partial: Partial<DraftQuestion>) {
    onChange({ ...question, ...partial } as DraftQuestion);
  }

  function handleTypeChange(newType: QuestionType) {
    const base = {
      id: question.id,
      choreKey: question.choreKey,
      prompt: question.prompt,
      required: question.required,
      order: question.order,
      _isNew: question._isNew,
      _deleted: question._deleted,
    };
    if (newType === 'TEXT') onChange({ ...base, type: 'TEXT' });
    else if (newType === 'INTEGER') onChange({ ...base, type: 'INTEGER' });
    else if (newType === 'BOOLEAN') onChange({ ...base, type: 'BOOLEAN' });
    else if (newType === 'ENUM') {
      const existingChoices = question.type === 'ENUM' ? question.choices : [];
      onChange({ ...base, type: 'ENUM', choices: existingChoices });
    } else if (newType === 'MULTIPLIER') {
      onChange({ ...base, type: 'MULTIPLIER', xpPerUnit: 1, multiplierAnswerType: 'integer', required: true });
    }
  }

  const allTypes = [
    ...QUESTION_TYPES,
    { value: 'MULTIPLIER' as QuestionType, label: 'Score Multiplier' },
  ];

  const isMultiplierDisabled = hasOtherMultiplier && question.type !== 'MULTIPLIER';

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
            {allTypes.map((t) => (
              <option
                key={t.value}
                value={t.value}
                disabled={t.value === 'MULTIPLIER' && isMultiplierDisabled}
                title={t.value === 'MULTIPLIER' && isMultiplierDisabled ? 'Only one multiplier per chore' : undefined}
              >
                {t.label}
                {t.value === 'MULTIPLIER' && isMultiplierDisabled ? ' (already set)' : ''}
              </option>
            ))}
          </select>
        </div>

        {question.type !== 'MULTIPLIER' && (
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
        )}
      </div>

      {question.type === 'TEXT' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Regex Pattern <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={question.regexPattern ?? ''}
            onChange={(e) => update({ regexPattern: e.target.value || undefined } as Partial<DraftQuestion>)}
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
              onChange={(e) => update({ minValue: e.target.value !== '' ? Number(e.target.value) : undefined } as Partial<DraftQuestion>)}
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
              onChange={(e) => update({ maxValue: e.target.value !== '' ? Number(e.target.value) : undefined } as Partial<DraftQuestion>)}
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
            onChange={(choices: EnumChoice[]) => update({ choices } as Partial<DraftQuestion>)}
          />
        </div>
      )}

      {question.type === 'MULTIPLIER' && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Weight <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={question.xpPerUnit}
              min="0.0001"
              step="any"
              onChange={(e) => update({ xpPerUnit: Number(e.target.value) } as Partial<DraftQuestion>)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {question.xpPerUnit > 0 && (
              <p className="mt-1 text-xs text-indigo-600">
                {buildMultiplierXPPreview(question.xpPerUnit)}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Answer type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name={`multiplier-type-${question.id}`}
                  value="integer"
                  checked={question.multiplierAnswerType === 'integer'}
                  onChange={() => update({ multiplierAnswerType: 'integer' } as Partial<DraftQuestion>)}
                  className="accent-blue-600"
                />
                Integer
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name={`multiplier-type-${question.id}`}
                  value="float"
                  checked={question.multiplierAnswerType === 'float'}
                  onChange={() => update({ multiplierAnswerType: 'float' } as Partial<DraftQuestion>)}
                  className="accent-blue-600"
                />
                Float
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
