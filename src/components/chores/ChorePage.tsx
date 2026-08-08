import { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
import AmendCompletionModal from '@/components/completion/AmendCompletionModal';
import CompleteButton from '@/components/chores/CompleteButton';
import QuickCompleteButtonList from '@/components/chores/QuickCompleteButtonList';
import ChoreActionsDropdown from '@/components/chores/ChoreActionsDropdown';
import CompletionsTable from '@/components/chores/CompletionsTable';
import type { Completion } from '@/types';

export default function ChorePage() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  const navigate = useNavigate();
  const [editingCompletion, setEditingCompletion] = useState<Completion | null>(null);

  const choreKey = encodedChoreKey ? decodeURIComponent(encodedChoreKey) : '';
  const chores = useAppStore((s) => s.chores);
  const allCompletions = useAppStore((s) => s.completions);
  const questions = useAppStore((s) => s.questions);

  const chore = chores.find((c) => c.key === choreKey);
  if (!chore) return <Navigate to="/" replace />;

  const choreQuestions = questions
    .filter((q) => q.choreKey === choreKey)
    .sort((a, b) => a.order - b.order);

  const completions = allCompletions
    .filter((c) => c.choreKey === choreKey)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  return (
    <div className="py-4">
      <Button variant="link" onClick={() => navigate(-1)} className="mb-4 px-0">← Back</Button>

      <h1 className="mb-2 text-2xl font-bold text-foreground">{chore.title}</h1>

      {chore.description && (
        <MarkdownDisplay key={chore.description} content={chore.description} className="mb-4 text-sm text-muted-foreground" />
      )}

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <CompleteButton chore={chore} />
        <QuickCompleteButtonList chore={chore} />
        <ChoreActionsDropdown chore={chore} />
      </div>

      <h2 className="mb-3 text-lg font-semibold text-foreground">Completion History</h2>

      {completions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No completions yet.</p>
      ) : (
        <CompletionsTable completions={completions} questions={choreQuestions} choreTitle={chore.title} />
      )}

      {editingCompletion && (
        <AmendCompletionModal
          completion={editingCompletion}
          chore={chore}
          choreCompletions={completions}
          questions={choreQuestions}
          onClose={() => setEditingCompletion(null)}
        />
      )}
    </div>
  );
}
