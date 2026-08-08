import { useState } from 'react';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import CompletionModal from '@/components/completion/CompletionModal';

interface Props {
  choreKey: string;
  label?: string;
  disabled?: boolean;
}

export default function CompleteButton({ choreKey, label = 'Complete', disabled: disabledProp }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const questions = useAppStore(
    useShallow((s) => s.questions.filter((q) => q.choreKey === choreKey)),
  );
  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function handleClick() {
    if (processing || disabledProp) return;
    if (questions.length > 0) { setShowModal(true); return; }
    setProcessing(true);
    try { await recordCompletion(choreKey); } finally { setProcessing(false); }
  }

  return (
    <>
      <Button onClick={handleClick} disabled={processing || !!disabledProp} size="sm" className="bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50">
        {processing ? 'Saving…' : label}
      </Button>
      {showModal && (
        <CompletionModal choreKey={choreKey} questions={questions} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
