import { test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  chmodSync,
  symlinkSync,
  readFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

let tmpDir: string;
const projectRoot = join(import.meta.dir, "..");

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "deploy-staging-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

function run(args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync("bash", ["scripts/deploy-staging.sh", ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

function validEnvFile(): string {
  const path = join(tmpDir, ".env.staging");
  writeFileSync(
    path,
    [
      "SSH_USER=test",
      "SSH_HOST=test.example.com",
      "STAGING_SYNC_URL=https://staging.example.com/sync",
      "STAGING_WEB_ROOT=/var/www/tasks-harmony-staging",
      "STAGING_SERVER_DIR=/home/test/tasks-harmony-staging",
      "STAGING_SOCKET_DIR=/run/tasks-harmony-staging",
      "STAGING_NGINX_INCLUDE_DIR=/etc/nginx/includes/staging",
      "STAGING_BASIC_AUTH_FILE=/etc/nginx/.htpasswd-staging",
    ].join("\n")
  );
  return path;
}

function fakeSecretTool(output: string): string {
  const binDir = join(tmpDir, "bin");
  mkdirSync(binDir);
  const tool = join(binDir, "secret-tool");
  writeFileSync(tool, `#!/bin/bash\nprintf '%s\\n' ${JSON.stringify(output)}\n`);
  chmodSync(tool, 0o755);
  return binDir;
}

test("exits 1 with helpful message when .env.staging is missing", () => {
  const result = run([], {
    DEPLOY_STAGING_ENV_FILE: join(tmpDir, ".env.staging"),
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(".env.staging");
});

test("exits 1 with helpful message when keyring entry is missing", () => {
  const envFile = validEnvFile();
  const binDir = fakeSecretTool("");

  const result = run([], {
    DEPLOY_STAGING_ENV_FILE: envFile,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("basic auth password not found");
});

test("exits 1 with helpful message on unknown argument", () => {
  const result = run(["--unknown-flag"], {
    DEPLOY_STAGING_ENV_FILE: join(tmpDir, ".env.staging"),
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unknown argument");
});

test("build command includes VITE_BASIC_AUTH derived from BASIC_AUTH_PASSWORD for staging basic auth", () => {
  const script = readFileSync(join(projectRoot, "scripts/deploy-staging.sh"), "utf-8");
  // The staging site is behind HTTP basic auth. Sync API calls must include the
  // credentials so nginx doesn't reject them before they reach the sync server.
  const buildLine = script.match(/^.*bun run build.*$/m)?.[0] ?? "";
  expect(buildLine).toContain("VITE_BASIC_AUTH");
  expect(script).toContain("BASIC_AUTH_PASSWORD");
});

test("VITE_SYNC_URL does not end with /sync - client code appends /sync/ paths itself", () => {
  const script = readFileSync(join(projectRoot, "scripts/deploy-staging.sh"), "utf-8");
  // Client calls ${VITE_SYNC_URL}/sync/challenge etc.; if VITE_SYNC_URL ends with
  // /sync the paths become /sync/sync/challenge → 404.
  const viteUrlLine = script.match(/^VITE_SYNC_URL=.*$/m)?.[0] ?? "";
  expect(viteUrlLine).not.toContain("STAGING_SYNC_URL");
  expect(viteUrlLine).not.toMatch(/\/sync["'\s]/);
});

test("deploy script ensures socket directory is owned by bun user (UID 1000) before starting container", () => {
  // Without this step Docker auto-creates the bind-mounted directory as root,
  // and the container's bun user (UID 1000) gets EACCES when trying to
  // create the socket file inside it.
  const script = readFileSync(join(projectRoot, "scripts/deploy-staging.sh"), "utf-8");
  expect(script).toMatch(/chown.*1000.*STAGING_SOCKET_DIR|chown.*bun.*STAGING_SOCKET_DIR/s);
  expect(script).toMatch(/mkdir.*STAGING_SOCKET_DIR|install.*-d.*STAGING_SOCKET_DIR/s);
});

test("deploy script rebuilds the sync-server Docker image before restarting the service so code changes take effect", () => {
  // The Dockerfile bakes source into the image at build time (COPY . .).
  // Rsyncing new source to the host has no effect unless the image is rebuilt.
  // Without a rebuild step the container keeps running the old cached image.
  const script = readFileSync(join(projectRoot, "scripts/deploy-staging.sh"), "utf-8");
  expect(script).toMatch(/REMOTE_DC_CMD.*build/);
  const buildIdx = script.search(/REMOTE_DC_CMD.*build/);
  const restartIdx = script.indexOf("systemctl restart tasks-harmony-sync-staging");
  expect(buildIdx).toBeGreaterThan(0);
  expect(buildIdx).toBeLessThan(restartIdx);
});

test("exits 1 with helpful message when secret-tool is not installed", () => {
  const envFile = validEnvFile();
  // Use a PATH that has bash and required utilities but no secret-tool
  const binDir = join(tmpDir, "empty-bin");
  mkdirSync(binDir);
  // Symlink only the binaries the script needs before the secret-tool check
  symlinkSync("/usr/bin/bash", join(binDir, "bash"));
  symlinkSync("/usr/bin/dirname", join(binDir, "dirname"));

  const result = run([], {
    DEPLOY_STAGING_ENV_FILE: envFile,
    PATH: binDir,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("secret-tool is not installed");
});
