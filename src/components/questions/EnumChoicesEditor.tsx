import type { EnumChoice } from '@/types';

interface Props {
  choices: EnumChoice[];
  onChange: (choices: EnumChoice[]) => void;
}

export default function EnumChoicesEditor({ choices, onChange }: Props) {
  const sorted = [...choices].sort((a, b) => a.order - b.order);

  function handleLabelChange(id: string, label: string) {
    onChange(choices.map((c) => (c.id === id ? { ...c, label } : c)));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...sorted];
    const prevOrder = next[index - 1].order;
    const currOrder = next[index].order;
    onChange(
      choices.map((c) => {
        if (c.id === next[index - 1].id) return { ...c, order: currOrder };
        if (c.id === next[index].id) return { ...c, order: prevOrder };
        return c;
      }),
    );
  }

  function handleMoveDown(index: number) {
    if (index === sorted.length - 1) return;
    const next = [...sorted];
    const nextOrder = next[index + 1].order;
    const currOrder = next[index].order;
    onChange(
      choices.map((c) => {
        if (c.id === next[index + 1].id) return { ...c, order: currOrder };
        if (c.id === next[index].id) return { ...c, order: nextOrder };
        return c;
      }),
    );
  }

  function handleRemove(id: string) {
    onChange(choices.filter((c) => c.id !== id));
  }

  function handleAddChoice() {
    const maxOrder = choices.length > 0 ? Math.max(...choices.map((c) => c.order)) : -1;
    const newChoice: EnumChoice = {
      id: crypto.randomUUID(),
      label: '',
      order: maxOrder + 1,
    };
    onChange([...choices, newChoice]);
  }

  return (
    <div className="space-y-2">
      {sorted.length === 0 && (
        <p className="text-xs text-gray-400 italic">No choices yet. Add at least one.</p>
      )}

      {sorted.map((choice, index) => (
        <div key={choice.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleMoveUp(index)}
            disabled={index === 0}
            title="Move up"
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => handleMoveDown(index)}
            disabled={index === sorted.length - 1}
            title="Move down"
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ▼
          </button>
          <input
            type="text"
            value={choice.label}
            onChange={(e) => handleLabelChange(choice.id, e.target.value)}
            placeholder="Choice label…"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            type="button"
            onClick={() => handleRemove(choice.id)}
            title="Remove choice"
            className="rounded p-1 text-red-400 hover:text-red-700 transition-colors"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddChoice}
        className="mt-1 rounded border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + Add Choice
      </button>
    </div>
  );
}
