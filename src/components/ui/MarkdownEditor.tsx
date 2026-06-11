import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { nord } from '@milkdown/theme-nord';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { indent } from '@milkdown/plugin-indent';
import { block } from '@milkdown/plugin-block';
import { emoji } from '@milkdown/plugin-emoji';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import '@milkdown/theme-nord/style.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

function InnerEditor({ value, onChange }: Props) {
  useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChange(markdown);
        });
      })
      .use(gfm)
      .use(history)
      .use(indent)
      .use(block)
      .use(emoji)
      .use(listener)
  );
  return <Milkdown />;
}

export function MarkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <div className="milkdown-wrapper rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 min-h-[80px]">
        <InnerEditor {...props} />
      </div>
    </MilkdownProvider>
  );
}
