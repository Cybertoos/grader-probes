import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyMutation, loadSpec, probe, scoreOf } from './probe.mjs';

const example = (f) => fileURLToPath(new URL(`./examples/jsonl-lines/${f}`, import.meta.url));

test('tap score is passed over total, exit score is 1 or 0', () => {
  assert.equal(scoreOf('tap', 1, '# tests 3\n# pass 2\n'), 2 / 3);
  assert.equal(scoreOf('exit', 0, ''), 1);
  assert.equal(scoreOf('exit', 1, ''), 0);
});

test('the real grader passes every probe', () => {
  assert.ok(probe(loadSpec(example('probe.json'))).every((r) => r.ok));
});

test('the weak grader lets doing nothing score 1', () => {
  const rows = probe(loadSpec(example('probe-weak.json')));
  assert.equal(rows.find((r) => r.probe === 'no-op').ok, false);
});

test('a mutation whose text is no longer in the file fails instead of passing', () => {
  const spec = loadSpec(example('probe.json'));
  spec.mutations = [{ name: 'rotted', file: 'src/lines.mjs', find: 'text that is not there', replace: '' }];
  const row = probe(spec).find((r) => r.probe === 'mutation rotted');
  assert.equal(row.ok, false);
  assert.match(row.note, /found it 0 times/);
});

test('replace text with $ patterns is inserted as written', () => {
  for (const rep of ["x = '$&'", "y = f'$$'", "s = '$`'", "t = \"$'\""]) {
    assert.equal(applyMutation('a\nold\nb\n', { name: 'm', file: 'f', find: 'old', replace: rep }), `a\n${rep}\nb\n`);
  }
});

test('a solution that reads the answers from the grader file scores 0', () => {
  const grader = fileURLToPath(new URL('../environments/jsonl_lines/jsonl_lines.py', import.meta.url));
  const cheat = fileURLToPath(new URL('./examples/env-tasks/cheat-read-grader.py', import.meta.url));
  for (const task of ['split-jsonl', 'parse-item']) {
    const r = spawnSync('python3', [grader, 'grade', cheat, task], { encoding: 'utf8' });
    assert.equal(scoreOf('tap', r.status, r.stdout), 0, `${task}: ${r.stdout}${r.stderr}`);
  }
});
