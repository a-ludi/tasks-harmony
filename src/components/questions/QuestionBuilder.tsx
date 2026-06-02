import { useState } from 'react';
import type { Question } from '@/types';
import QuestionFormFields, { type DraftQuestion } from './QuestionFormFields';

interface Props {
  choreKey: string;
  initialQuestions: Question[];
  onChange: (drafts: DraftQuestion[]) => void;
}

const TYPE_LABELS: Record<string, string> = {
  TEXT: 'Text',
  INTEGER: 'Integer',
  BOOLEAN: 'Yes / No',
  ENUM: 'Multiple Choice',
  MULTIPLIER: 'Score Multiplier',
};

export default function QuestionBuilder({ choreKey, initialQuestions, onChange }: Props) {
  const [drafts, setDrafts] = useState<DraftQuestion[]>(() =>
    initialQuestions.slice().sort((a, b) => a.order - b.order).map((q) => ({ ...q })),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function commit(next: DraftQuestion[]) {
    setDrafts(next);
    onChange(next);
  }

  function handleAdd() {
    const activeDrafts = drafts.filter((d) => !d._deleted);
    const maxOrder = activeDrafts.length > 0 ? Math.max(...activeDrafts.map((d) => d.order)) : -1;

    const newQuestion: DraftQuestion = {
      id: crypto.randomUUID(),
      choreKey,
      prompt: '',
      type: 'TEXT',
      required: true,
      order: maxOrder + 1,
      _isNew: true,
    };

    const next = [...drafts, newQuestion];
    commit(next);
    setExpandedId(newQuestion.id);
  }

  function handleRemove(id: string) {
    const target = drafts.find((d) => d.id === id);
    if (!target) return;

    if (target._isNew) {
      commit(drafts.filter((d) => d.id !== id));
    } else {
      commit(drafts.map((d) => (d.id === id ? { ...d, _deleted: true } : d)));
    }

    if (expandedId === id) setExpandedId(null);
  }

  function handleRestore(id: string) {
    commit(drafts.map((d) => (d.id === id ? { ...d, _deleted: false } : d)));
  }

  function handleUpdate(updated: DraftQuestion) {
    commit(drafts.map((d) => (d.id === updated.id ? updated : d)));
  }

  function handleMoveUp(id: string) {
    const active = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
    const idx = active.findIndex((d) => d.id === id);
    if (idx <= 0) return;

    const prevOrder = active[idx - 1].order;
    const currOrder = active[idx].order;

    commit(
      drafts.map((d) => {
        if (d.id === active[idx - 1].id) return { ...d, order: currOrder };
        if (d.id === active[idx].id) return { ...d, order: prevOrder };
        return d;
      }),
    );
  }

  function handleMoveDown(id: string) {
    const active = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
    const idx = active.findIndex((d) => d.id === id);
    if (idx === -1 || idx === active.length - 1) return;

    const nextOrder = active[idx + 1].order;
    const currOrder = active[idx].order;

    commit(
      drafts.map((d) => {
        if (d.id === active[idx + 1].id) return { ...d, order: currOrder };
        if (d.id === active[idx].id) return { ...d, order: nextOrder };
        return d;
      }),
    );
  }

  const activeQuestions = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
  const deletedQuestions = drafts.filter((d) => d._deleted);

  return (
    <div className="space-y-2">
      {activeQuestions.length === 0 && deletedQuestions.length === 0 && (
        <p className="text-sm text-gray-400 italic py-2">No questions attached. Click "Add Question" to start.</p>
      )}

      {activeQuestions.map((draft, index) => (
        <div key={draft.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div
            className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
          >
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleMoveUp(draft.id); }}
                disabled={index === 0}
                title="Move up"
                className="rounded px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleMoveDown(draft.id); }}
                disabled={index === activeQuestions.length - 1}
                title="Move down"
                className="rounded px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                ▼
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {draft.prompt || <span className="text-gray-400 italic">Untitled question</span>}
              </p>
              <div className="flex gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{TYPE_LABELS[draft.type] ?? draft.type}</span>
                {draft.required && (
                  <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-1.5 py-0">Required</span>
                )}
                {draft._isNew && (
                  <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-1.5 py-0">New</span>
                )}
              </div>
            </div>

            <span className="text-gray-400 text-xs shrink-0">{expandedId === draft.id ? '▾' : '▸'}</span>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemove(draft.id); }}
              title="Remove question"
              className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              Remove
            </button>
          </div>

          {expandedId === draft.id && (
            <div className="border-t border-gray-100 p-3">
              <QuestionFormFields
                question={draft}
                onChange={handleUpdate}
                hasOtherMultiplier={drafts.some((d) => !d._deleted && d.type === 'MULTIPLIER' && d.id !== draft.id)}
              />
            </div>
          )}
        </div>
      ))}

      {deletedQuestions.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Pending removal</p>
          {deletedQuestions.map((draft) => (
            <div key={draft.id} className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 opacity-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-600 truncate line-through">{draft.prompt || 'Untitled question'}</p>
                <span className="text-xs text-gray-400">{TYPE_LABELS[draft.type] ?? draft.type}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(draft.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 hover:text-green-800 transition-colors"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + Add Question
      </button>
    </div>
  );
}
