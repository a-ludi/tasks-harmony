import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('docker-compose.yml socket path configuration', () => {
  const compose = readFileSync(join(import.meta.dir, '../docker-compose.yml'), 'utf8');
  const nginxTemplate = readFileSync(
    join(import.meta.dir, '../nginx/sync-location.conf.template'),
    'utf8',
  );

  it('SYNC_SOCKET is derived from ${SOCKET_DIR}, not hardcoded as /run/sync/sync.sock', () => {
    // A hardcoded /run/sync/sync.sock conflicts with production when both
    // run on the same host. SYNC_SOCKET must follow SOCKET_DIR so each
    // environment gets a unique socket path.
    expect(compose).not.toContain('SYNC_SOCKET=/run/sync/sync.sock');
    expect(compose).toContain('SYNC_SOCKET=${SOCKET_DIR}/sync.sock');
  });

  it('mounts ${SOCKET_DIR} at its own path so container and host socket paths agree', () => {
    // The nginx template uses __SOCKET_DIR__/sync.sock (the HOST path).
    // If the container mounts ${SOCKET_DIR} to a different path (e.g. /run/sync),
    // nginx points at the host path while the container writes to a different one.
    expect(compose).not.toMatch(/\$\{SOCKET_DIR\}:\/run\/sync/);
    expect(compose).toMatch(/\$\{SOCKET_DIR\}:\$\{SOCKET_DIR\}/);
  });

  it('nginx template socket path pattern matches compose SYNC_SOCKET pattern', () => {
    // Both must derive the path from the same variable (SOCKET_DIR).
    expect(nginxTemplate).toContain('__SOCKET_DIR__/sync.sock');
    expect(compose).toContain('${SOCKET_DIR}/sync.sock');
  });
});
