import type { Question } from '@/types';
import { toRepetitionFactor } from '@/xp/xpPreview';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  question: Question;
  value: string | number | boolean | null;
  error?: string;
  onChange: (value: string | number | boolean | null) => void;
}

export default function AnswerField({ question, value, error, onChange }: Props) {
  const { prompt, required } = question;

  function renderInput() {
    if (question.type === 'TEXT') {
      return (
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.regexPattern ? `Must match: ${question.regexPattern}` : undefined}
          className={error ? 'border-destructive' : ''}
        />
      );
    }
    if (question.type === 'INTEGER') {
      return (
        <Input
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={question.minValue}
          max={question.maxValue}
          onChange={(e) => onChange(e.target.value !== '' ? Number(e.target.value) : null)}
          className={error ? 'border-destructive' : ''}
        />
      );
    }
    if (question.type === 'BOOLEAN') {
      return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
          <span className="text-sm">Yes</span>
        </label>
      );
    }
    if (question.type === 'ENUM') {
      const sortedChoices = [...(question.choices ?? [])].sort((a, b) => a.order - b.order);
      return (
        <Select value={typeof value === 'string' ? value : ''} onValueChange={(v) => onChange(v || null)}>
          <SelectTrigger className={error ? 'border-destructive' : ''}>
            <SelectValue placeholder="— Select —" />
          </SelectTrigger>
          <SelectContent>
            {sortedChoices.map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>{choice.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (question.type === 'MULTIPLIER') {
      const isFloat = question.multiplierAnswerType === 'float';
      return (
        <div>
          <Input
            type="number"
            value={typeof value === 'number' ? value : ''}
            min={isFloat ? '0.0001' : '1'}
            step={isFloat ? 'any' : '1'}
            onChange={(e) => onChange(e.target.value !== '' ? Number(e.target.value) : null)}
            className={error ? 'border-destructive' : ''}
          />
          <p className="mt-1 text-xs text-muted-foreground">÷ {toRepetitionFactor(question.xpPerUnit)}</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-1">
      <Label>{prompt}{required && <span className="ml-1 text-destructive">*</span>}</Label>
      {renderInput()}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
