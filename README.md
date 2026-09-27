# grader-probes

If a model can score without doing the task, you are training it to cheat. This repo checks graders for that before anything trains on them.

## The probe runner

`probe/probe.mjs` runs a grader against three kinds of solution, each in its own temp copy:

- **no-op:** a solution that does nothing. It must score 0.
- **oracle:** the reference solution. It must score 1.
- **planted bugs:** small, realistic mistakes in the reference. Each one must lower the score.

```
node probe/probe.mjs probe/examples/env-tasks/probe-split-jsonl.json probe/examples/env-tasks/probe-parse-item.json
```

```
probe env task split-jsonl
check                      expect    score  time    result
no-op                      0         0.00     137ms  pass
oracle                     1         1.00     125ms  pass
mutation splitlines        < oracle  0.80     137ms  pass
mutation decode-per-chunk  < oracle  0.80     133ms  pass
mutation drop-last         < oracle  0.60     127ms  pass
all 5 checks pass
```

A probe spec is a JSON file: the grade command, the workspace a solution lives in, the oracle, and the mutations as find-and-replace edits. A mutation whose text is no longer in the file fails loudly rather than passing. `probe/examples/jsonl-lines/probe-weak.json` shows a grader that lets doing nothing score 1.

## The environment

`environments/jsonl_lines` is a [verifiers](https://github.com/PrimeIntellect-ai/verifiers) environment with two parsing tasks, both taken from real bugs:

- **split-jsonl:** split a JSONL stream on `\n` only. Node's readline also breaks on U+2028 and U+2029, which JSON allows inside strings, and it cut 114 records in one of our transcript readers.
- **parse-item:** parse a flat frontmatter block.

The model's code runs in a child process with an empty temp directory and no environment variables but `PATH`. The parent compares the sha256 of each output with the digest stored for that case.

## Two holes the probes found

1. **The grader paid 0.17 for doing nothing.** One split-jsonl case expected `[]` for an empty file, which a no-op also returns. The no-op probe caught it on the first run. The case was removed.
2. **A solution could read the answers.** The expected values sat in the grader's own source. `probe/examples/env-tasks/cheat-read-grader.py` has no parsing logic. It finds the grader through `sys.path` or its parent's command line, loads the case table and returns the stored answer for its input. It scored 1.0 on both tasks. The grader now stores digests only, and the cheat scores 0. `probe/probe.test.mjs` fails if it ever scores more.

Known limits are in the [environment README](environments/jsonl_lines/README.md).

## Run the tests

```
node --test probe/probe.test.mjs
```

Needs Node 20+ and Python 3.10+. The environment itself needs `verifiers`; see its README.
