import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core';
import { nord } from '@milkdown/theme-nord';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { cn } from '@/lib/utils';
import '@milkdown/theme-nord/style.css';

// URL sanitisation for security (SEC-000019)
const SAFE_SCHEME_RE = /^(https?:|mailto:)/i;
const BLOCKED_HREF = 'about:blank#blocked';

/**
 * Returns a safe href for use in rendered markdown.
 * Allows: http(s), mailto, relative URLs (starting with /, #, ?, or with no scheme).
 * Blocks: javascript:, data:, vbscript:, file:, and any other/unknown scheme.
 */
export function safeHref(rawHref: string): string {
  const trimmed = rawHref.trim();
  if (trimmed === '') return BLOCKED_HREF;
  // Reject control chars and whitespace inside the scheme portion — these are
  // classic bypass tricks like "java\tscript:" or "java\nscript:".
  // eslint-disable-next-line no-control-regex
  const decontrolled = trimmed.replace(/[\s\x00-\x1f]/g, '');
  if (SAFE_SCHEME_RE.test(decontrolled)) return trimmed;
  // Relative / same-document URLs (no scheme).
  if (/^[/#?]/.test(decontrolled)) return trimmed;
  // If there is a colon before the first '/', '?', or '#', it is a scheme —
  // and since it did not match the allowlist above, it is unsafe.
  const firstColon = decontrolled.indexOf(':');
  const firstSlash = decontrolled.search(/[/?#]/);
  const hasScheme = firstColon !== -1 && (firstSlash === -1 || firstColon < firstSlash);
  if (hasScheme) return BLOCKED_HREF;
  // No scheme, no leading slash — treat as relative.
  return trimmed;
}

/**
 * Rewrites unsafe URLs inside CommonMark link syntax in the given markdown string.
 * Covers:
 *   - inline links:  [text](URL "title")     → [text](safeHref(URL) "title")
 *   - autolinks:     <URL>                   → <safeHref(URL)>
 *   - link refs:     [id]: URL "title"       → [id]: safeHref(URL) "title"
 *
 * Exported for unit-testing.
 */
export function sanitizeMarkdownLinks(content: string): string {
  // 1. Inline links: [text](URL) or [text](URL "title")
  //    Find ]( and then locate the matching ) considering balanced parentheses.
  let out = '';
  let i = 0;
  while (i < content.length) {
    // Look for ](
    const linkStart = content.indexOf('](', i);
    if (linkStart === -1) {
      out += content.substring(i);
      break;
    }

    out += content.substring(i, linkStart + 2); // Include ](

    // Find the matching ) by counting parentheses
    let j = linkStart + 2;
    let parenDepth = 0;
    let inAngleBrackets = false;
    let foundEnd = false;

    while (j < content.length) {
      const char = content[j];
      if (char === '<') inAngleBrackets = true;
      else if (char === '>') inAngleBrackets = false;
      else if (char === '(' && !inAngleBrackets) parenDepth++;
      else if (char === ')' && !inAngleBrackets) {
        if (parenDepth === 0) {
          foundEnd = true;
          break;
        }
        parenDepth--;
      }
      j++;
    }

    if (!foundEnd) {
      // No matching ), skip this potential link
      i = linkStart + 2;
      continue;
    }

    // Extract content between ]( and )
    const urlPart = content.substring(linkStart + 2, j);
    const trimmed = urlPart.trim();

    // Extract URL and optional title
    let url: string;
    let trailingPart = '';
    let isAngleBracketed = false;

    // Try angle-bracket URL first: <url>
    const angleMatch = trimmed.match(/^<([^>]*)>(.*)/);
    if (angleMatch) {
      url = angleMatch[1];
      trailingPart = angleMatch[2];
      isAngleBracketed = true;
    } else {
      // Regular URL: look for space followed by quote (title delimiter)
      // Everything before that is the URL, everything after is title/trailing
      const spaceQuoteIdx = trimmed.search(/\s+["']/);
      if (spaceQuoteIdx > 0) {
        url = trimmed.substring(0, spaceQuoteIdx);
        trailingPart = trimmed.substring(spaceQuoteIdx);
      } else {
        // No title, entire trimmed part is the URL
        url = trimmed;
        trailingPart = '';
      }
    }

    if (!url) {
      // No URL found, preserve original
      out += urlPart + ')';
      i = j + 1;
      continue;
    }

    // Sanitize the URL
    const safe = safeHref(url);
    const safedUrl = isAngleBracketed ? `<${safe}>` : safe;
    out += safedUrl + trailingPart + ')';
    i = j + 1;
  }

  // 2. Autolinks: <scheme:...>. Only touch tokens that look like a URL (contain ':').
  out = out.replace(/<([a-zA-Z][a-zA-Z0-9+.\-]*:[^>\s]*)>/g, (_m, url: string) => {
    return `<${safeHref(url)}>`;
  });

  // 3. Reference-style link definitions at start-of-line: [id]: URL "title"
  out = out.replace(
    /^(\s{0,3}\[[^\]]+\]:\s*)(<[^>]*>|[^\s]+)/gm,
    (_m, prefix: string, urlToken: string) => {
      let urlStr = urlToken;
      let isBracketed = false;
      if (urlStr.startsWith('<') && urlStr.endsWith('>')) {
        isBracketed = true;
        urlStr = urlStr.slice(1, -1);
      }
      const safe = safeHref(urlStr);
      const safedUrl = isBracketed ? `<${safe}>` : safe;
      return prefix + safedUrl;
    },
  );

  return out;
}

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
        ctx.set(defaultValueCtx, sanitizeMarkdownLinks(content));
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
