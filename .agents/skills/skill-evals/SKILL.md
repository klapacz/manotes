---
name: skill-evals
description: Evaluate and improve skill wording with repeated OMP runs, realistic prompts, and reviewed tool traces.
---

# Skill evals

- Use realistic, loose user prompts. Do not coach tool choices, minimize-tool strategies, or answer formats unless that is part of the real request.
- Start with a few tasks covering normal use and known failures, repeated three times. Keep the model, reasoning level, fixtures, and tool settings fixed.
- Snapshot each candidate skill. Give every run a fresh fixture and session; keep expected answers outside the agent's working directory.
- Use disposable synthetic data without live credentials. Parallel runs must not share mutable fixtures or indexes.
- Leave installed skills unchanged during experiments.

## Run with OMP

Tested with OMP 18.0.11. Check `omp --help` and `omp config list --json` if options change.

Create a temporary experiment directory containing `candidates/a/my-skill/SKILL.md`. Use absolute paths in a per-run config overlay:

```json
{
  "autoResume": false,
  "skills": {
    "enabled": true,
    "enableCodexUser": false,
    "enableClaudeUser": false,
    "enableClaudeProject": false,
    "enablePiUser": false,
    "enablePiProject": false,
    "enableAgentsUser": false,
    "enableAgentsProject": false,
    "customDirectories": ["/absolute/eval/candidates/a"],
    "includeSkills": ["my-skill"],
    "ignoredSkills": []
  },
  "memory": { "backend": "off" },
  "retry": { "modelFallback": false },
  "advisor": { "enabled": false },
  "prewalk": { "enabled": false }
}
```

Launch each run with its own fixture directory and session directory:

```sh
omp --model luna --thinking high \
  --config /absolute/eval/a.json --skills my-skill \
  --cwd /absolute/eval/run-1/fixture \
  --session-dir /absolute/eval/run-1/sessions \
  --no-extensions --no-rules --no-lsp --no-pty --no-title \
  --tools read,bash,grep,glob --mode json --max-time 180 \
  -p "Use the my-skill skill (read skill://my-skill). USER TASK"
```

- `--skills` filters skill names, not paths. Do not use `--no-skills`; it disables candidate loading too.
- In print mode, explicitly request `read skill://my-skill`. The `/skill:my-skill` shorthand did not expand in our probe. The URI is singular: `skill://`.
- Probe one run and inspect the skill read result before starting a batch. Confirm the candidate and actual model, not just the requested flags.
- Adapt `--tools` to the task. This restricts tools, not filesystem or network permissions.
- Use a small runner to capture JSON stdout and stderr per run. Completed messages are `message_end` events; do not count streaming deltas as separate messages.
- In this project, launch development commands through `scripts/nix-develop -c` from the workspace.

## Review results

- Check answers against fixture ground truth, including ordering, identifiers, metadata associations, and completeness. Verify expected results independently before judging the model.
- Review final answers and tool traces manually. Accept valid natural-language answers; a filenames-only grader can reject a correct title-only answer.
- Score correctness and unintended changes first. Record tool calls, tokens, latency, errors, and truncation separately. Extra verification after an empty result is not automatically a failure.
- Preserve prompts, candidate snapshots, settings, transcripts, and review notes. Distinguish observed results from explanations; small samples and changed task sets do not establish reliable rankings.
- Use observed failures to choose the next wording improvement. Do not change the candidate halfway through a batch.
