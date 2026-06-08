import { Badge } from '@/components/ui/badge';
import type { ChoreStatus } from '@/types';

interface Props {
  status: ChoreStatus;
}

const STATUS_CONFIG: Record<ChoreStatus, { label: string; variant: 'destructive' | 'default' | 'secondary' | 'outline' }> = {
  overdue: { label: 'Overdue', variant: 'destructive' },
  due: { label: 'Due', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  upcoming: { label: 'Upcoming', variant: 'outline' },
};

export default function StatusBadge({ status }: Props) {
  const { label, variant } = STATUS_CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
