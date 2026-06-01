import type { ChoreStatus } from '@/types';

interface Props {
  status: ChoreStatus;
}

const STATUS_CONFIG: Record<ChoreStatus, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800' },
  due: { label: 'Due', className: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  upcoming: { label: 'Upcoming', className: 'bg-slate-100 text-slate-600' },
};

export default function StatusBadge({ status }: Props) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}
