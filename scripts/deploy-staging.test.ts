import { test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  chmodSync,
  symlinkSync,
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
