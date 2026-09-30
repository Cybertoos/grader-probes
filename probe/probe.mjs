#!/usr/bin/env node
// Probe a grader: the reference solution must score 1, doing nothing must score 0,
// and every planted mutation must lower the score. Each run gets its own temp copy.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export function loadSpec(path) {
  const file = resolve(path);
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  return { ...spec, dir: dirname(file), timeoutMs: spec.timeoutMs ?? 60_000, score: spec.score ?? 'exit' };
}

// tap: passed tests over all tests; exit: 1 on exit code 0, else 0.
export function scoreOf(kind, status, stdout) {
  if (kind === 'exit') return status === 0 ? 1 : 0;
  const pass = Number(stdout.match(/^# pass (\d+)/m)?.[1] ?? 0);
  const total = Number(stdout.match(/^# tests (\d+)/m)?.[1] ?? 0);
  return total ? pass / total : 0;
}

// The replace text is inserted as written: a function replacer keeps $&, $', $` and $$ from being expanded.
export function applyMutation(src, m) {
  const hits = src.split(m.find).length - 1;
  if (hits !== 1) throw new Error(`mutation "${m.name}": expected the find text once in ${m.file}, found it ${hits} times`);
  return src.replace(m.find, () => m.replace);
}

function mutate(ws, m) {
  const path = join(ws, m.file);
  writeFileSync(path, applyMutation(readFileSync(path, 'utf8'), m));
}

// A grader must not inherit a surrounding node --test run, or it reports in that run's format.
function graderEnv(ws) {
  const env = { ...process.env, WORKSPACE: ws };
  for (const k of Object.keys(env)) if (k.startsWith('NODE_TEST')) delete env[k];
  return env;
}

export function run(spec, { oracle = false, mutation = null } = {}) {
  const ws = mkdtempSync(join(tmpdir(), 'probe-'));
  try {
    cpSync(join(spec.dir, spec.workspace), ws, { recursive: true });
    if (oracle || mutation) cpSync(join(spec.dir, spec.oracle), ws, { recursive: true });
    if (mutation) mutate(ws, mutation);
    const argv = spec.grade.map((a) => a.replaceAll('{task}', spec.dir).replaceAll('{ws}', ws));
    const t0 = Date.now();
    const r = spawnSync(argv[0], argv.slice(1), { cwd: ws, encoding: 'utf8', timeout: spec.timeoutMs, env: graderEnv(ws) });
    const timedOut = r.error?.code === 'ETIMEDOUT';
    return { score: timedOut ? 0 : scoreOf(spec.score, r.status, r.stdout ?? ''), ms: Date.now() - t0, timedOut };
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}

export function probe(spec) {
  const rows = [];
  const noop = run(spec);
  rows.push({ probe: 'no-op', expect: '0', ...noop, ok: noop.score === 0 });
  const ref = run(spec, { oracle: true });
  rows.push({ probe: 'oracle', expect: '1', ...ref, ok: ref.score === 1 });
  for (const m of spec.mutations ?? []) {
    let r;
    try { r = run(spec, { mutation: m }); } catch (e) { rows.push({ probe: `mutation ${m.name}`, expect: '< oracle', score: NaN, ms: 0, ok: false, note: e.message }); continue; }
    rows.push({ probe: `mutation ${m.name}`, expect: '< oracle', ...r, ok: r.score < ref.score, note: r.score < ref.score ? '' : 'survived: the grader did not notice' });
  }
  return rows;
}

function table(name, rows) {
  const fmt = (n) => (Number.isNaN(n) ? '  -  ' : n.toFixed(2));
  const w = Math.max(...rows.map((r) => r.probe.length), 5);
  const lines = [`probe ${name}`, `${'check'.padEnd(w)}  expect    score  time    result`];
  for (const r of rows) {
    lines.push(`${r.probe.padEnd(w)}  ${r.expect.padEnd(8)}  ${fmt(r.score)}   ${String(r.ms).padStart(5)}ms  ${r.ok ? 'pass' : 'FAIL'}${r.timedOut ? ' (timed out)' : ''}${r.note ? `  ${r.note}` : ''}`);
  }
  const bad = rows.filter((r) => !r.ok).length;
  lines.push(bad ? `${bad} of ${rows.length} checks failed: this grader can be passed without doing the task, or cannot tell broken work apart.` : `all ${rows.length} checks pass`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length || !files.every(existsSync)) {
    console.error('usage: probe.mjs <probe.json> [...]');
    process.exit(2);
  }
  let failed = 0;
  for (const f of files) {
    const spec = loadSpec(f);
    const rows = probe(spec);
    console.log(table(spec.name ?? f, rows) + '\n');
    if (rows.some((r) => !r.ok)) failed += 1;
  }
  process.exit(failed ? 1 : 0);
}
