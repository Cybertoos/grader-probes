# jsonl-lines

Two parsing tasks taken from real bugs in our own agent tooling, graded by hidden tests.

- **split-jsonl**: split a JSONL stream on "\n" only. The real bug was node:readline also breaking on U+2028 and U+2029, which cut 114 records in a transcript reader of ours. Five hidden cases: separators inside strings, CRLF, a multibyte character across chunks, a missing final newline, blank lines, records across chunks.
- **parse-item**: parse a flat frontmatter block, the item format of our desk. Four hidden cases.

## How it grades

`hidden_tests` takes the last ```python block from the reply and scores the share of hidden cases it passes, from 0 to 1. The model's code runs in a child process (`python -I`, empty temp directory, only PATH in the environment, 10 s per case) that returns outputs as JSON. The parent compares the sha256 of each output with the one stored for that case. Printing "passed" earns nothing, and so does finding this file on disk: it holds the inputs and the digests, not the answers.

Until 2026-09-27 the expected values sat in this file. A solution with no parsing logic, which walked `sys.path`, found the grader and looked up its own inputs, scored 1.0 on both tasks. It is kept as `probe/examples/env-tasks/cheat-read-grader.py` and now scores 0.

Known limits:
- The digests still work as an answer check. A solution that writes several candidate implementations can test each against the stored digest and return the one that matches. It has to produce the right output itself, but it gets hidden-test feedback it should not have.
- The child can read any file the user can and has network access. A reference solution published anywhere it can reach could be copied. Closing this needs a sandbox with no network and no read access outside its temp directory.

## Proof that the grader cannot be passed without doing the task

From the repo root, `node probe/probe.mjs probe/examples/env-tasks/probe-split-jsonl.json probe/examples/env-tasks/probe-parse-item.json`:

| task | no-op | reference | planted bugs |
|---|---|---|---|
| split-jsonl | 0.00 | 1.00 | str.splitlines 0.80, decoding each chunk alone 0.80, dropping the last line 0.60 |
| parse-item | 0.00 | 1.00 | splitting on the last ": " 0.75, keeping unknown keys 0.75, no default priority 0.75 |

The first probe run found that doing nothing scored 0.17 on split-jsonl, because one case expected [] for an empty file. That case was removed.

## Local run

```
vf-eval jsonl-lines -m qwen/qwen3.8-27b -b http://localhost:1234/v1 -k LMSTUDIO_KEY -n 2 -r 2 --max-tokens 3000 --sampling-args '{"reasoning_effort":"none"}'
```

qwen3.8-27b on LM Studio, 2026-09-27: split-jsonl 1.0 and 1.0, parse-item 1.0 and 0.25, mean 0.81.

## Hub

Pushed private as `cybertoos/jsonl-lines` 0.1.0 on 2026-09-27: `prime env push --path environments/jsonl_lines --visibility PRIVATE --runtime v0`. The code uses the v0 API; without `--runtime v0` the push infers v1 from `verifiers>=0.2.0`.

Install into a project environment with `prime env install cybertoos/jsonl-lines --with pip` (with the venv active and pip in it). The default `--with uv` installed into the prime CLI's own tool environment instead. A clean install from the Hub scored 1.0 on both tasks with qwen3.8-27b.
