export const builtinSkills: Record<string, string> = {
  'code-review': `---
name: code-review
description: Review code changes for correctness, regressions, security boundaries and missing validation. Use when the user requests a code review or assessment of a patch.
---
# Code review
Read the relevant code and its callers before making claims. Identify concrete defects with their trigger, effect, file and line. Prioritize correctness and behavior over cosmetic preferences. Check the existing tests and report which validation actually ran. If no actionable defects are found, say so and state any remaining coverage gaps. Do not change files unless the user requests fixes. Never infer a successful test from a plan or streamed output alone.
`,
  debugging: `---
name: debugging
description: Investigate errors, failing tests, crashes and unexpected behavior. Use for debugging and root-cause analysis before proposing a focused fix.
---
# Debugging
Establish the expected and observed behavior. Inspect the smallest relevant code path and reproduce the failure when feasible, obtaining approval for commands. Distinguish evidence from hypotheses. Test the most likely explanation, apply the smallest justified fix after write approval, then repeat the original reproduction. Report actual output, exit status, affected files and any remaining uncertainty. Do not hide a failure by weakening assertions or bypassing permissions.
`,
  testing: `---
name: testing
description: Design and run meaningful tests for code changes, regressions and edge cases. Use when the user asks to test behavior or verify a fix.
---
# Testing
Read existing test conventions and identify the observable behavior under test. Cover the original failure, boundary inputs and relevant integration behavior without mirroring the implementation. Request approval before writing tests or running commands. Run the narrowest meaningful check first; broaden only when the result or changed scope justifies it. Report exact commands, real exit statuses and limitations. Never claim a test passed without its successful result. Keep persistent development servers in the user's terminal.
`,
};
