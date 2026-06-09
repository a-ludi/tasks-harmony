import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { getAnswerDisplay } from '@/questions/display';
import { Button } from '@/components/ui/button';

export default function ChorePage() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  const navigate = useNavigate();

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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="py-4">
      <Button variant="link" onClick={() => navigate(-1)} className="mb-4 px-0">← Back</Button>

      <h1 className="mb-2 text-2xl font-bold text-foreground">{chore.title}</h1>

      {chore.description && (
        <p className="mb-4 text-sm text-muted-foreground">{chore.description}</p>
      )}

      <h2 className="mb-3 text-lg font-semibold text-foreground">Completion History</h2>

      {completions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No completions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">Completed at</th>
                {choreQuestions.map((q) => (
                  <th key={q.id} className="py-2 pr-4 font-medium text-foreground">{q.prompt}</th>
                ))}
                <th className="py-2 font-medium text-foreground text-right">XP earned</th>
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-muted">
                  <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">{formatDate(c.completedAt)}</th>
                  {choreQuestions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-muted-foreground">
                      {getAnswerDisplay(c.answers, q)}
                    </td>
                  ))}
                  <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
