import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core';
import { nord } from '@milkdown/theme-nord';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { cn } from '@/lib/utils';
import '@milkdown/theme-nord/style.css';

interface Props {
  content: string;
  className?: string;
}

function InnerDisplay({ content }: { content: string }) {
  useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.update(editorViewOptionsCtx, (prev) => ({ ...prev, editable: () => false }));
      })
      .use(commonmark)
      .use(gfm)
  );
  return <Milkdown />;
}

export function MarkdownDisplay({ content, className }: Props) {
  if (!content) return null;
  return (
    <MilkdownProvider>
      <div className={cn('prose prose-sm max-w-none dark:prose-invert', className)}>
        <InnerDisplay content={content} />
      </div>
    </MilkdownProvider>
  );
}
