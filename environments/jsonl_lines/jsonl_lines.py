"""Two small parsing tasks taken from real bugs in our own tools, graded by hidden tests.

The model's code runs in a child process that only returns outputs as JSON; the
parent compares their sha256 with the one stored per case. The expected values are
not in this file, so a solution that finds it on disk has no answers to copy.
"""

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

TIMEOUT_S = 10

RUNNER = r"""
import base64, importlib.util, json, sys
req = json.loads(sys.stdin.read())
spec = importlib.util.spec_from_file_location("solution", req["path"])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
def dec(a):
    if isinstance(a, dict) and "b64" in a:
        return base64.b64decode(a["b64"])
    if isinstance(a, list):
        return [dec(x) for x in a]
    return a
out = getattr(mod, req["func"])(*[dec(a) for a in req["args"]])
sys.stdout.write("\n@@RESULT@@" + json.dumps(out if not hasattr(out, "__next__") else list(out)))
"""


def b(data: bytes) -> dict:
    return {"b64": base64.b64encode(data).decode()}


EURO = "€".encode()

TASKS = [
    {
        "id": "split-jsonl",
        "func": "split_jsonl",
        "prompt": """Write a Python function `split_jsonl(chunks: list[bytes]) -> list[str]`.

`chunks` is a JSONL file read from disk in arbitrary pieces. Return the lines as decoded UTF-8 strings, in order.

- Split on "\\n" only. JSON allows U+2028 and U+2029 raw inside strings; they are not line breaks.
- Strip one trailing "\\r" from each line (CRLF files).
- A multibyte character may be split across two chunks.
- If the file does not end with "\\n", the last line still counts.
- A blank line between records is returned as "".

Reply with one ```python code block containing the function and any imports.""",
        "cases": [
            ([[b('{"t":"a b c"}\n{"x":1}\n'.encode())]], "6dfaae713e3f12bc5c14213729647d8be3728af9d0e40b5fab0ad92c8ca681c5"),
            ([[b(b'{"a":1}\r\n{"b":2}')]], "c5ef08c25e1a1af0d149d7d737c03d6bcfc80e38f31185dc2d3359d58f0bac7e"),
            ([[b(b'{"t":"' + EURO[:1]), b(EURO[1:2]), b(EURO[2:] + b'"}\n')]], "2bc6aadb815b09447b546070620f1c72bead88955022bdcc9b3351d80ba6dcde"),
            ([[b(b'{"a":1}\n\n{"b":2}\n')]], "19129979faec4fc28ea3363a014dbbe2d234e10fce656c45067a430ae2d21351"),
            ([[b(b'{"a"'), b(b':1}\n{"b":'), b(b"2}")]], "c5ef08c25e1a1af0d149d7d737c03d6bcfc80e38f31185dc2d3359d58f0bac7e"),
        ],
    },
    {
        "id": "parse-item",
        "func": "parse_item",
        "prompt": """Write a Python function `parse_item(text: str) -> dict` for Markdown files with a flat frontmatter block:

```
---
title: Apply to Mercor: RL roles
status: waiting
priority: 1
---

Body text, which may contain blank lines and --- lines.
```

- If the text does not start with a "---" line followed later by a closing "---" line, return {"body": text}.
- Each frontmatter line is `key: value`; split on the first ": " only, so values may contain ": ". Skip lines without ": ".
- Keep only these keys: title, kind, lane, status, who, priority, link.
- `priority` becomes an int; when it is missing or not a number, use 3.
- "body" is the text after the closing "---" line, exactly as it appears (including its final newline), with at most one leading blank line removed.

Reply with one ```python code block containing the function and any imports.""",
        "cases": [
            (["---\ntitle: Apply to Mercor: RL roles\nstatus: waiting\npriority: 1\n---\n\nBody.\n"],
             "a0a2691829cacb77d219ea0ba36f40fb486f532225f12a153aa2fee6a3cfc36b"),
            (["no frontmatter here\n"], "25aec60eb8826f27e30867cbbd76481b6351242a202b711582afd509f766f0b9"),
            (["---\ntitle: x\nsecret: y\nnot a pair\n---\n\nA\n\n---\nB\n"], "93800cab457ddb8bbe9483f172bb1201670594fb1a0261e879a50a05975ae789"),
            (["---\npriority: soon\nwho: \n---\nno blank line\n"], "7f279495621ca14722368e95adc5f893f2f75aab2b5a428b3ee4269dd14de2f3"),
        ],
    },
]

TASKS_BY_ID = {t["id"]: t for t in TASKS}


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def run_cases(source: str, task: dict) -> tuple[int, int]:
    """Run the hidden cases against `source`; return (passed, total)."""
    passed = 0
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "solution.py")
        with open(path, "w") as f:
            f.write(source)
        for args, expected in task["cases"]:
            req = json.dumps({"path": path, "func": task["func"], "args": args})
            try:
                r = subprocess.run([sys.executable, "-I", "-c", RUNNER], input=req, capture_output=True,
                                   text=True, timeout=TIMEOUT_S, cwd=tmp, env={"PATH": os.environ.get("PATH", "")})
            except subprocess.TimeoutExpired:
                continue
            tail = r.stdout.rpartition("\n@@RESULT@@")[2] if "\n@@RESULT@@" in r.stdout else None
            try:
                if tail is not None and r.returncode == 0 and digest(json.loads(tail)) == expected:
                    passed += 1
            except json.JSONDecodeError:
                pass
    return passed, len(task["cases"])


def extract_code(completion) -> str:
    text = completion[-1]["content"] if isinstance(completion, list) and completion else str(completion or "")
    if not isinstance(text, str):
        text = str(text)
    blocks = re.findall(r"```(?:python|py)?\s*\n(.*?)```", text, flags=re.S)
    return blocks[-1] if blocks else ""


def hidden_tests(completion, info, **kwargs) -> float:
    code = extract_code(completion)
    if not code.strip():
        return 0.0
    passed, total = run_cases(code, TASKS_BY_ID[info["task_id"]])
    return passed / total


def load_environment(**kwargs):
    import verifiers as vf
    from datasets import Dataset

    rows = [{"question": t["prompt"], "answer": "", "info": {"task_id": t["id"]}} for t in TASKS]
    return vf.SingleTurnEnv(dataset=Dataset.from_list(rows), eval_dataset=Dataset.from_list(rows),
                            rubric=vf.Rubric(funcs=[hidden_tests], weights=[1.0]), **kwargs)


if __name__ == "__main__":
    # python jsonl_lines.py grade <solution.py> <task-id>: prints a TAP-style tally for the probe runner.
    if len(sys.argv) == 4 and sys.argv[1] == "grade":
        with open(sys.argv[2]) as f:
            p, n = run_cases(f.read(), TASKS_BY_ID[sys.argv[3]])
        print(f"# tests {n}\n# pass {p}")
    else:
        print("usage: jsonl_lines.py grade <solution.py> <task-id>", file=sys.stderr)
        sys.exit(2)
