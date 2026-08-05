import type { Plugin } from 'vite';

export function stripCspMetaTag(html: string): string {
  return html.replace(/<meta\s[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>\s*/i, '');
}

export function stripCspInDev(): Plugin {
  return {
    name: 'strip-csp-in-dev',
    apply: 'serve',
    transformIndexHtml: stripCspMetaTag,
  };
}
