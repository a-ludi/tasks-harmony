import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ChoreIssue } from '@/chores/healthCheck';

const mockLinkCompletionToTarget = mock(async () => {});
const mockPatchCompletionTargetId = mock(async () => {});
const mockSaveTargets = mock(async () => {});

mock.module('@/store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      linkCompletionToTarget: mockLinkCompletionToTarget,
      patchCompletionTargetId: mockPatchCompletionTargetId,
      saveTargets: mockSaveTargets,
      completions: [],
      targets: [],
    }),
}));

// Import after mock.module is set up
const { default: ChoreFixDialog } = await import('./ChoreFixDialog');

beforeEach(() => {
  mockLinkCompletionToTarget.mockClear();
  mockPatchCompletionTargetId.mockClear();
  mockSaveTargets.mockClear();
});

describe('ChoreFixDialog', () => {
  it('calls linkCompletionToTarget when unmatched-completion fix is applied', async () => {
    const issues: ChoreIssue[] = [
      { kind: 'unmatched-completion', completionId: 'c1', targetId: 't1' },
    ];
    render(<ChoreFixDialog choreKey="pack/chore" issues={issues} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /apply fixes/i }));
    await waitFor(() => {
      expect(mockLinkCompletionToTarget).toHaveBeenCalledWith('c1', 't1');
    });
  });

  it('skips unchecked fix rows when applying', async () => {
    const issues: ChoreIssue[] = [
      { kind: 'unmatched-completion', completionId: 'c1', targetId: 't1' },
      { kind: 'orphaned-target-ref', completionId: 'c2' },
    ];
    render(<ChoreFixDialog choreKey="pack/chore" issues={issues} onClose={() => {}} />);

    // Uncheck the first fix
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    fireEvent.click(screen.getByRole('button', { name: /apply fixes/i }));
    await waitFor(() => {
      expect(mockLinkCompletionToTarget).not.toHaveBeenCalled();
      expect(mockPatchCompletionTargetId).toHaveBeenCalledWith('c2', undefined);
    });
  });
});
