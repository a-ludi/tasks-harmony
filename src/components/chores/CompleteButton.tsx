import { useState } from 'react';
import { useAppStore } from '@/store';

interface Props {
  choreKey: string;
  label?: string;
}

export default function CompleteButton({ choreKey, label = 'Complete' }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const [processing, setProcessing] = useState(false);

  async function handleClick() {
    if (processing) return;
    setProcessing(true);
    try {
      await recordCompletion(choreKey);
    } finally {
      setProcessing(false);
    }
  }

  return (
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
  );
}
