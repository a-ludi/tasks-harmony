import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useChoreIssues } from '@/hooks/useChoreIssues';
import type { ChoreIssue } from '@/chores/healthCheck';
import ChoreFixDialog from './ChoreFixDialog';

function buildSummaryLines(issues: ChoreIssue[]): string[] {
  const lines: string[] = [];
  const dups = issues.find((i) => i.kind === 'duplicate-targets');
  if (dups && dups.kind === 'duplicate-targets') {
    const count = dups.groups.reduce((sum, g) => sum + g.remove.length, 0);
    lines.push(`${count} duplicate target${count === 1 ? '' : 's'}`);
  }
  const unmatchedCount = issues.filter((i) => i.kind === 'unmatched-completion').length;
  if (unmatchedCount > 0) lines.push(`${unmatchedCount} unmatched completion${unmatchedCount === 1 ? '' : 's'}`);
  const orphanCount = issues.filter((i) => i.kind === 'orphaned-target-ref').length;
  if (orphanCount > 0) lines.push(`${orphanCount} orphaned link${orphanCount === 1 ? '' : 's'}`);
  return lines;
}

interface Props {
  choreKey: string;
}

export default function ChoreHealthTooltip({ choreKey }: Props) {
  const { issues, hasIssues } = useChoreIssues(choreKey);
  const [fixOpen, setFixOpen] = useState(false);

  if (!hasIssues) return null;

  const summaryLines = buildSummaryLines(issues);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center text-amber-500 hover:text-amber-600 transition-colors"
              aria-label="Chore has data issues"
            >
              <TriangleAlert className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            className="bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-md p-3 space-y-2 max-w-56 text-left"
          >
            <p className="font-medium text-xs">Data issues found</p>
            <ul className="space-y-0.5">
              {summaryLines.map((line) => (
                <li key={line} className="text-xs text-muted-foreground">{line}</li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={() => setFixOpen(true)}
            >
              Fix issues
            </Button>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {fixOpen && (
        <ChoreFixDialog choreKey={choreKey} issues={issues} onClose={() => setFixOpen(false)} />
      )}
    </>
  );
}
