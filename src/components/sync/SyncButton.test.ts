import { describe, it, expect } from 'bun:test';

// Pure logic: determines whether the URL input section should be shown
function shouldShowUrlInput(webdavUrl: string | undefined, showUrlInput: boolean): boolean {
  return !webdavUrl || showUrlInput;
}

describe('SyncButton - URL input visibility', () => {
  it('shows input when no WebDAV URL is configured', () => {
    expect(shouldShowUrlInput(undefined, false)).toBe(true);
  });

  it('shows input when showUrlInput is forced true', () => {
    expect(shouldShowUrlInput('https://dav.example.com/state.json', true)).toBe(true);
  });

  it('hides input when URL is set and showUrlInput is false', () => {
    expect(shouldShowUrlInput('https://dav.example.com/state.json', false)).toBe(false);
  });
});
