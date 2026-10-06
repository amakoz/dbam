# PR notes: agent-stop-hook

Sections to carry into the PR description.

## Manual checks

For the human before merge (impl-review F4):

- [ ] Open `/hooks` in a live worker pane, confirm the project `Stop` entry (`node "$CLAUDE_PROJECT_DIR/scripts/stop-lint.mjs"`) is listed, and watch a block land on a `STATUS: done` turn while a changed file has an ESLint error.
- [ ] Confirm the `cc-status` Stop hook updates the iTerm status on a real turn end (the worker could only see it fire outside iTerm: `Set status failed: No such session cc-status`).
