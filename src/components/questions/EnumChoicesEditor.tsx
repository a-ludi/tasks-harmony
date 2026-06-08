import type { EnumChoice } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    onChange(choices.map((c) => {
      if (c.id === next[index - 1].id) return { ...c, order: currOrder };
      if (c.id === next[index].id) return { ...c, order: prevOrder };
      return c;
    }));
  }

  function handleMoveDown(index: number) {
    if (index === sorted.length - 1) return;
    const next = [...sorted];
    const nextOrder = next[index + 1].order;
    const currOrder = next[index].order;
    onChange(choices.map((c) => {
      if (c.id === next[index + 1].id) return { ...c, order: currOrder };
      if (c.id === next[index].id) return { ...c, order: nextOrder };
      return c;
    }));
  }

  function handleRemove(id: string) { onChange(choices.filter((c) => c.id !== id)); }

  function handleAddChoice() {
    const maxOrder = choices.length > 0 ? Math.max(...choices.map((c) => c.order)) : -1;
    onChange([...choices, { id: crypto.randomUUID(), label: '', order: maxOrder + 1 }]);
  }

  return (
    <div className="space-y-2">
      {sorted.length === 0 && <p className="text-xs text-muted-foreground italic">No choices yet. Add at least one.</p>}
      {sorted.map((choice, index) => (
        <div key={choice.id} className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleMoveUp(index)} disabled={index === 0} title="Move up">▲</Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleMoveDown(index)} disabled={index === sorted.length - 1} title="Move down">▼</Button>
          <Input value={choice.label} onChange={(e) => handleLabelChange(choice.id, e.target.value)} placeholder="Choice label…" className="h-8 text-sm" />
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => handleRemove(choice.id)} title="Remove choice">✕</Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={handleAddChoice} className="mt-1 border-dashed w-full text-muted-foreground">
        + Add Choice
      </Button>
    </div>
  );
}
