---
name: spec-driven-bugfix-loop
description: Use when running a bugfixing session where bugs should be discovered by comparing code to a spec, fixed with TDD, reviewed, and looped until the spec is fully satisfied.
---

# Spec-Driven Bugfix Loop

## Overview

Orchestrate three specialized subagents in a repeating loop — discoverer, fixer, reviewer — until the codebase fully satisfies its spec. Uses `superpowers:subagent-driven-development` for sequential handoffs.

## Role-to-Skill Mapping

| Role | Skill to invoke |
|------|----------------|
| Discoverer | `diagnose` |
| Fixer | `superpowers:test-driven-development` (NOT `tdd`) |
| Reviewer | `superpowers:requesting-code-review` + `superpowers:receiving-code-review` |
| Orchestrator (you) | `superpowers:subagent-driven-development` |

## Loop Structure

```dot
digraph bugfix_loop {
    Start [shape=doublecircle];
    Discoverer [label="Discoverer\n(diagnose)\nfinds all spec divergences"];
    AnyBugs [label="Bugs remaining?" shape=diamond];
    Fixer [label="Fixer\n(superpowers:test-driven-development)\nfixes one bug"];
    Reviewer [label="Reviewer\n(superpowers:requesting-code-review)"];
    ChangesRequested [label="Changes\nrequested?" shape=diamond];
    FixerWithFeedback [label="Fixer again\n(superpowers:receiving-code-review\nthen re-fix)"];
    Done [shape=doublecircle label="Done"];

    Start -> Discoverer;
    Discoverer -> AnyBugs;
    AnyBugs -> Fixer [label="yes: pick next bug"];
    AnyBugs -> Done [label="no bugs"];
    Fixer -> Reviewer;
    Reviewer -> ChangesRequested;
    ChangesRequested -> FixerWithFeedback [label="yes"];
    ChangesRequested -> AnyBugs [label="no: approved"];
    FixerWithFeedback -> Reviewer;
}
```

## Exit Condition

The loop is done when **all** of the following hold:
- Discoverer finds zero spec divergences
- Every fix applied in this session has reviewer approval

"Tests pass" from the fixer is **not** a stopping condition. Re-run the discoverer after all bugs in the current list are fixed — fixes can introduce new divergences.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `tdd` (mattpocock) instead of `superpowers:test-driven-development` | Always use the superpowers variant |
| Skipping `superpowers:receiving-code-review` when reviewer requests changes | Fixer must invoke it before re-attempting |
| Stopping after discoverer's first clean-ish pass | Re-run discoverer after each full fix cycle |
| Running discoverer in parallel with fixer | Discoverer must finish before fixer starts |

## Optimization: Parallel Fixes

If the discoverer returns a list of **independent** bugs (touching separate files with no shared state), switch from `superpowers:subagent-driven-development` to `superpowers:dispatching-parallel-agents` and fan out multiple fixer+reviewer pairs simultaneously. Merge all results before re-running the discoverer.
