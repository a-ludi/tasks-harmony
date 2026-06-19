export function normalizePackUrl(url: string): string {
  // Strip /__pack__.yaml suffix first so provider patterns match the directory URL
  url = url.replace(/\/__pack__\.yaml$/, '');

  // GitHub.com: /tree/ or /blob/ → raw.githubusercontent.com with refs/heads/
  const ghMatch = url.match(
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(tree|blob)\/([^/]+)\/(.+)$/
  );
  if (ghMatch) {
    const [, repo, , branch, path] = ghMatch;
    return `https://raw.githubusercontent.com/${repo}/refs/heads/${branch}/${path}`;
  }

  // GitLab (any domain): /-/tree/ or /-/blob/ → /-/raw/ on the same host
  // The /-/ path prefix is unique to GitLab, so this is safe for any domain.
  if (/\/-\/(tree|blob)\//.test(url)) {
    return url.replace(/\/-\/(tree|blob)\//, '/-/raw/');
  }

  // GitHub Enterprise (any non-github.com domain): /blob/ or /tree/ → /raw/
  const gheMatch = url.match(
    /^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/(blob|tree)\/(.+)$/
  );
  if (gheMatch) {
    const [, base, , rest] = gheMatch;
    return `${base}/raw/${rest}`;
  }

  return url;
}
