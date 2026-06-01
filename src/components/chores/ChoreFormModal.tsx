import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Chore, XPSize, RecurrenceFrequency } from '@/types';

interface Props {
  chore?: Chore;
  packId: string;
  onClose: () => void;
}

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly'];

function todayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface FormErrors {
  title?: string;
  interval?: string;
  startDate?: string;
}

export default function ChoreFormModal({ chore, packId, onClose }: Props) {
  const addChore = useAppStore((s) => s.addChore);
  const updateChore = useAppStore((s) => s.updateChore);

  const isEdit = chore !== undefined;

  const [title, setTitle] = useState(chore?.title ?? '');
  const [description, setDescription] = useState(chore?.description ?? '');
  const [xpSize, setXpSize] = useState<XPSize>(chore?.xpSize ?? 'S');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    chore?.recurrence.frequency ?? 'daily',
  );
  const [interval, setInterval] = useState<string>(
    String(chore?.recurrence.interval ?? 1),
  );
  const [startDate, setStartDate] = useState(
    chore?.recurrence.startDate ?? todayString(),
  );
  const [windowStartTime, setWindowStartTime] = useState(
    chore?.recurrence.windowStartTime ?? '00:00',
  );
  const [repeatable, setRepeatable] = useState(chore?.repeatable ?? false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!title.trim()) errs.title = 'Title is required.';
    const intervalNum = Number(interval);
    if (!Number.isInteger(intervalNum) || intervalNum < 1) {
      errs.interval = 'Interval must be a whole number of 1 or more.';
    }
    if (!startDate) {
      errs.startDate = 'Start date is required.';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errs.startDate = 'Start date must be in YYYY-MM-DD format.';
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);
    try {
      if (isEdit && chore) {
        await updateChore({
          ...chore,
          title: title.trim(),
          description: description.trim() || undefined,
          xpSize,
          recurrence: { frequency, interval: Number(interval), startDate, windowStartTime },
          repeatable,
        });
      } else {
        await addChore({
          packId,
          title: title.trim(),
          description: description.trim() || undefined,
          xpSize,
          recurrence: { frequency, interval: Number(interval), startDate, windowStartTime },
          repeatable,
          active: true,
        });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {isEdit ? 'Edit Chore' : 'New Chore'}
        </h2>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-title">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="chore-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.title ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
              placeholder="e.g. Clean the bathroom"
            />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-description">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="chore-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Add extra details…"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-xp-size">
              XP Size
            </label>
            <select
              id="chore-xp-size"
              value={xpSize}
              onChange={(e) => setXpSize(e.target.value as XPSize)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {XP_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-frequency">
              Frequency
            </label>
            <select
              id="chore-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-interval">
              Interval
            </label>
            <input
              id="chore-interval"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.interval ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {errors.interval && <p className="mt-1 text-xs text-red-600">{errors.interval}</p>}
            <p className="mt-1 text-xs text-gray-500">e.g. interval 2 with "weekly" = every 2 weeks</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-start-date">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              id="chore-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.startDate ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {errors.startDate && <p className="mt-1 text-xs text-red-600">{errors.startDate}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-window-start-time">
              Window Start Time
            </label>
            <input
              id="chore-window-start-time"
              type="time"
              value={windowStartTime}
              onChange={(e) => setWindowStartTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <p className="mt-1 text-xs text-gray-500">
              When does your day start for this chore? Default 00:00 (midnight). E.g. 18:00 for evening routines.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="chore-repeatable"
              type="checkbox"
              checked={repeatable}
              onChange={(e) => setRepeatable(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300"
            />
            <label className="text-sm font-medium text-gray-700" htmlFor="chore-repeatable">
              Repeatable (allow multiple completions per window)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                submitting ? 'cursor-not-allowed bg-blue-300' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Chore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
