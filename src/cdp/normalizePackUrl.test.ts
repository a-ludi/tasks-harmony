import { describe, it, expect } from 'bun:test';
import { normalizePackUrl } from './normalizePackUrl';

describe('normalizePackUrl', () => {
  // ── suffix stripping ──────────────────────────────────────────────────
  it('strips /__pack__.yaml suffix from an already-raw URL', () => {
    expect(normalizePackUrl(
      'https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness/__pack__.yaml'
    )).toBe('https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness');
  });

  it('strips /__pack__.yaml before applying provider transformation', () => {
    expect(normalizePackUrl(
      'https://github.com/user/repo/blob/main/fitness/__pack__.yaml'
    )).toBe('https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness');
  });

  // ── GitHub.com ────────────────────────────────────────────────────────
  it('transforms GitHub tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.com/a-ludi/harmony-tasks/tree/main/fitness'
    )).toBe('https://raw.githubusercontent.com/a-ludi/harmony-tasks/refs/heads/main/fitness');
  });

  it('transforms GitHub blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.com/a-ludi/harmony-tasks/blob/main/fitness/chore.yaml'
    )).toBe('https://raw.githubusercontent.com/a-ludi/harmony-tasks/refs/heads/main/fitness/chore.yaml');
  });

  it('passes through GitHub raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness'
    )).toBe('https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness');
  });

  // ── GitLab.com ────────────────────────────────────────────────────────
  it('transforms GitLab tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://gitlab.com/user/repo/-/tree/main/fitness'
    )).toBe('https://gitlab.com/user/repo/-/raw/main/fitness');
  });

  it('transforms GitLab blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://gitlab.com/user/repo/-/blob/main/fitness/__pack__.yaml'
    )).toBe('https://gitlab.com/user/repo/-/raw/main/fitness');
  });

  it('passes through GitLab raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://gitlab.com/user/repo/-/raw/main/fitness'
    )).toBe('https://gitlab.com/user/repo/-/raw/main/fitness');
  });

  // ── self-hosted GitLab ────────────────────────────────────────────────
  it('transforms self-hosted GitLab tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://git.mycompany.com/user/repo/-/tree/main/fitness'
    )).toBe('https://git.mycompany.com/user/repo/-/raw/main/fitness');
  });

  it('transforms self-hosted GitLab blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://git.mycompany.com/user/repo/-/blob/main/fitness/__pack__.yaml'
    )).toBe('https://git.mycompany.com/user/repo/-/raw/main/fitness');
  });

  it('passes through self-hosted GitLab raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://git.mycompany.com/user/repo/-/raw/main/fitness'
    )).toBe('https://git.mycompany.com/user/repo/-/raw/main/fitness');
  });

  // ── GitHub Enterprise (custom domain) ────────────────────────────────
  it('transforms GitHub Enterprise blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.mycompany.com/user/repo/blob/main/fitness/__pack__.yaml'
    )).toBe('https://github.mycompany.com/user/repo/raw/main/fitness');
  });

  it('transforms GitHub Enterprise tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.mycompany.com/user/repo/tree/main/fitness'
    )).toBe('https://github.mycompany.com/user/repo/raw/main/fitness');
  });

  it('passes through GitHub Enterprise raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://github.mycompany.com/user/repo/raw/main/fitness'
    )).toBe('https://github.mycompany.com/user/repo/raw/main/fitness');
  });

  // ── unknown / already correct ─────────────────────────────────────────
  it('passes through unknown URLs unchanged', () => {
    expect(normalizePackUrl('https://example.com/some/pack'))
      .toBe('https://example.com/some/pack');
  });

  it('passes through an empty string unchanged', () => {
    expect(normalizePackUrl('')).toBe('');
  });
});
