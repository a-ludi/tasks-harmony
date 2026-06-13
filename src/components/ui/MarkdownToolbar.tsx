import type { CmdKey } from '@milkdown/core';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { useInstance } from '@milkdown/react';
import { callCommand } from '@milkdown/utils';
import { Button } from '@/components/ui/button';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolbarButton = {
  type: 'button';
  label: string;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: { key: CmdKey<any> };
  payload?: unknown;
};
type ToolbarSeparator = { type: 'separator' };
export type ToolbarItem = ToolbarButton | ToolbarSeparator;

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  { type: 'button', label: 'B', title: 'Bold', command: toggleStrongCommand },
  { type: 'button', label: 'I', title: 'Italic', command: toggleEmphasisCommand },
  { type: 'button', label: '~~', title: 'Strikethrough', command: toggleStrikethroughCommand },
  { type: 'button', label: '`', title: 'Inline code', command: toggleInlineCodeCommand },
  { type: 'separator' },
  { type: 'button', label: 'H1', title: 'Heading 1', command: wrapInHeadingCommand, payload: 1 },
  { type: 'button', label: 'H2', title: 'Heading 2', command: wrapInHeadingCommand, payload: 2 },
  { type: 'button', label: 'H3', title: 'Heading 3', command: wrapInHeadingCommand, payload: 3 },
  { type: 'separator' },
  { type: 'button', label: '•', title: 'Bullet list', command: wrapInBulletListCommand },
  { type: 'button', label: '1.', title: 'Ordered list', command: wrapInOrderedListCommand },
  { type: 'button', label: '>', title: 'Blockquote', command: wrapInBlockquoteCommand },
  { type: 'button', label: '```', title: 'Code block', command: createCodeBlockCommand },
];

export function MarkdownToolbar() {
  const [loading, getInstance] = useInstance();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function dispatch(command: { key: CmdKey<any> }, payload?: unknown) {
    if (loading) return;
    getInstance()?.action(callCommand(command.key, payload));
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap gap-1 border-b border-input p-1"
    >
      {TOOLBAR_ITEMS.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={index} className="w-px self-stretch bg-border mx-1" />;
        }
        return (
          <Button
            key={index}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-mono"
            title={item.title}
            aria-label={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              dispatch(item.command, item.payload);
            }}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
