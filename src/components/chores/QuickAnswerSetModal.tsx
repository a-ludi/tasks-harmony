import { useState } from 'react';
import type { Question, Answer, QuickAnswerSet } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import AnswerField from '@/components/completion/AnswerField';

interface Props {
  choreKey: string;
  questions: Question[];
  existingSet?: QuickAnswerSet;
  onSave: (qas: QuickAnswerSet) => void;
  onClose: () => void;
}

export default function QuickAnswerSetModal({ choreKey, questions, existingSet, onSave, onClose }: Props) {
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const [label, setLabel] = useState(existingSet?.label ?? '');
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(() => {
    const initial: Record<string, string | number | boolean | null> = {};
    for (const q of sortedQuestions) {
      const existing = existingSet?.answers.find((a) => a.questionId === q.id);
      initial[q.id] = existing?.value ?? null;
    }
    return initial;
  });
  const [labelError, setLabelError] = useState<string | null>(null);

  function handleSave() {
    if (!label.trim()) { setLabelError('Name is required.'); return; }
    const answerList: Answer[] = sortedQuestions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? null }));
    onSave({ id: existingSet?.id ?? crypto.randomUUID(), choreKey, label: label.trim(), answers: answerList });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingSet ? 'Edit Quick Answer' : 'New Quick Answer'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setLabelError(null); }}
              placeholder="e.g. Default, Quick, Minimal"
              autoFocus
              className={labelError ? 'border-destructive' : ''}
            />
            {labelError && <p className="text-xs text-destructive">{labelError}</p>}
          </div>
          {sortedQuestions.map((q) => (
            <AnswerField
              key={q.id}
              question={q}
              value={answers[q.id] ?? null}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
