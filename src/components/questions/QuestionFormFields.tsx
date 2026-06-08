import { useState, useEffect } from 'react';
import type { QuestionType, TextQuestion, IntegerQuestion, BooleanQuestion, EnumQuestion, MultiplierQuestion, EnumChoice } from '@/types';
import { isSafeRegex } from '@/questions/validation';
import EnumChoicesEditor from './EnumChoicesEditor';
import { buildMultiplierXPPreview, toRepetitionFactor } from '@/xp/xpPreview';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    } else { setRegexError(undefined); }
  }, [question.type, regexPattern]);

  function update(partial: Partial<DraftQuestion>) { onChange({ ...question, ...partial } as DraftQuestion); }

  function handleTypeChange(newType: QuestionType) {
    const base = { id: question.id, choreKey: question.choreKey, prompt: question.prompt, required: question.required, order: question.order, _isNew: question._isNew, _deleted: question._deleted };
    if (newType === 'TEXT') onChange({ ...base, type: 'TEXT' });
    else if (newType === 'INTEGER') onChange({ ...base, type: 'INTEGER' });
    else if (newType === 'BOOLEAN') onChange({ ...base, type: 'BOOLEAN' });
    else if (newType === 'ENUM') { const existingChoices = question.type === 'ENUM' ? question.choices : []; onChange({ ...base, type: 'ENUM', choices: existingChoices }); }
    else if (newType === 'MULTIPLIER') onChange({ ...base, type: 'MULTIPLIER', xpPerUnit: 1, multiplierAnswerType: 'integer', required: true });
  }

  const allTypes = [...QUESTION_TYPES, { value: 'MULTIPLIER' as QuestionType, label: 'Score Multiplier' }];
  const isMultiplierDisabled = hasOtherMultiplier && question.type !== 'MULTIPLIER';

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label className="text-xs">Question Prompt <span className="text-destructive">*</span></Label>
        <Input value={question.prompt} onChange={(e) => update({ prompt: e.target.value })} placeholder="e.g. How many minutes did it take?" />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-32 space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={question.type} onValueChange={(v) => handleTypeChange(v as QuestionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allTypes.map((t) => (
                <SelectItem key={t.value} value={t.value} disabled={t.value === 'MULTIPLIER' && isMultiplierDisabled}>
                  {t.label}{t.value === 'MULTIPLIER' && isMultiplierDisabled ? ' (already set)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {question.type !== 'MULTIPLIER' && (
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={question.required} onChange={(e) => update({ required: e.target.checked })} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
              Required
            </label>
          </div>
        )}
      </div>

      {question.type === 'TEXT' && (
        <div className="space-y-1">
          <Label className="text-xs">Regex Pattern <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input value={question.regexPattern ?? ''} onChange={(e) => update({ regexPattern: e.target.value || undefined } as Partial<DraftQuestion>)} placeholder="e.g. ^\d{4}$" className={`font-mono${regexError ? ' border-destructive' : ''}`} />
          {regexError && <p className="text-xs text-destructive">{regexError}</p>}
          {!regexError && question.regexPattern && <p className="text-xs text-green-600">Pattern is valid</p>}
        </div>
      )}

      {question.type === 'INTEGER' && (
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Min Value <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input type="number" value={question.minValue ?? ''} onChange={(e) => update({ minValue: e.target.value !== '' ? Number(e.target.value) : undefined } as Partial<DraftQuestion>)} placeholder="None" />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Max Value <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input type="number" value={question.maxValue ?? ''} onChange={(e) => update({ maxValue: e.target.value !== '' ? Number(e.target.value) : undefined } as Partial<DraftQuestion>)} placeholder="None" />
          </div>
        </div>
      )}

      {question.type === 'ENUM' && (
        <div className="space-y-1">
          <Label className="text-xs">Choices</Label>
          <EnumChoicesEditor choices={question.choices ?? []} onChange={(choices: EnumChoice[]) => update({ choices } as Partial<DraftQuestion>)} />
        </div>
      )}

      {question.type === 'MULTIPLIER' && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Repetition Factor <span className="text-destructive">*</span></Label>
            <Input type="number" value={toRepetitionFactor(question.xpPerUnit)} min="1" step="1"
              onChange={(e) => { const n = Math.max(1, Math.floor(Number(e.target.value) || 1)); update({ xpPerUnit: 1 / n } as Partial<DraftQuestion>); }} />
            <p className="text-xs text-indigo-600">{buildMultiplierXPPreview(toRepetitionFactor(question.xpPerUnit))}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Answer type</Label>
            <div className="flex gap-4">
              {(['integer', 'float'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name={`multiplier-type-${question.id}`} value={t} checked={question.multiplierAnswerType === t} onChange={() => update({ multiplierAnswerType: t } as Partial<DraftQuestion>)} className="accent-blue-600" />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
