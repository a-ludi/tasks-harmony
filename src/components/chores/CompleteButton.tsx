import { useState } from 'react';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/shallow';
import CompletionModal from '@/components/completion/CompletionModal';

interface Props {
  choreKey: string;
  label?: string;
}

export default function CompleteButton({ choreKey, label = 'Complete' }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const questions = useAppStore(
    useShallow((s) => s.questions.filter((q) => q.choreKey === choreKey)),
  );

  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const hasQuestions = questions.length > 0;

  async function handleClick() {
    if (processing) return;

    if (hasQuestions) {
      setShowModal(true);
      return;
    }

    setProcessing(true);
    try {
      await recordCompletion(choreKey);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={processing}
        className={`rounded px-3 py-1 text-sm font-medium text-white transition-colors ${
          processing
            ? 'cursor-not-allowed bg-green-300'
            : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
        }`}
      >
        {processing ? 'Saving…' : label}
      </button>

      {showModal && (
        <CompletionModal
          choreKey={choreKey}
          questions={questions}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
