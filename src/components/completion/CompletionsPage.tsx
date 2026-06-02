import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';

export default function CompletionsPage() {
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
    return new Date(iso).toLocaleString();
  }

  function getAnswerValue(completionAnswers: { questionId: string; value: string | number | boolean | null }[], questionId: string): string {
    const ans = completionAnswers.find((a) => a.questionId === questionId);
    if (!ans || ans.value === null || ans.value === '') return '';
    return String(ans.value);
  }

  return (
    <div className="py-4">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-blue-600 hover:underline"
      >
        ← Back
      </button>

      <h1 className="mb-4 text-2xl font-bold text-gray-900">{chore.title}</h1>

      {completions.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No completions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Completed at</th>
                {choreQuestions.map((q) => (
                  <th key={q.id} className="py-2 pr-4 font-medium text-gray-700">{q.prompt}</th>
                ))}
                <th className="py-2 font-medium text-gray-700 text-right">XP earned</th>
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{formatDate(c.completedAt)}</td>
                  {choreQuestions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-gray-600">
                      {getAnswerValue(c.answers, q.id)}
                    </td>
                  ))}
                  <td className="py-2 text-gray-700 font-medium text-right">{c.xpEarned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
