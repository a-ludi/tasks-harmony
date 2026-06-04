Always apply TDD when fixing bugs: write a failing test first, watch it fail,
then fix the code until the test passes, finally, refactor the new test and
code if appropriate.

Always choose Subagent-Driven for implementation tasks.

The default remote is called `public`. Push and pull permissions are configured.

Version numbers are set manually in `package.json`. Bump the version there before being instructed to cut a release.

## Git hooks

Local hooks are managed via [lefthook](https://github.com/evilmartians/lefthook).
Run `bun install` to install them. Hooks installed:

- **pre-commit**: runs `bun run typecheck`
- **pre-push**: runs `bun run test`
