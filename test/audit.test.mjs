import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditRows, callRow, parseNdjson } from '../src/index.mjs';

const SYSTEM = [{ type: 'text', text: 'You are helpful.' }];
const TOOLS = [{ name: 'search', input_schema: { type: 'object' } }];
const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });
const row = (messages, over = {}) => callRow({ conversationId: 'c1', model: 'm', system: SYSTEM, tools: TOOLS, messages, ...over });
const run = (...rows) => auditRows(rows.map((r, i) => ({ row: r, file: 'calls.ndjson', line: i + 1 })));
const kinds = (res) => res.violations.map((v) => v.kind);

test('a growing, append-only conversation is clean', () => {
  const res = run(row([u('hi')]), row([u('hi'), a('hello'), u('more')]), row([u('hi'), a('hello'), u('more'), a('ok'), u('end')]));
  assert.equal(res.calls, 3);
  assert.deepEqual(kinds(res), []);
});

test('key order and cache_control placement do not count as changes', () => {
  const r1 = row([u('hi')], { system: [{ type: 'text', text: 'You are helpful.' }] });
  const r2 = row([u('hi'), a('x'), u('y')], { system: [{ text: 'You are helpful.', type: 'text', cache_control: { type: 'ephemeral' } }] });
  assert.deepEqual(kinds(run(r1, r2)), []);
});

test('reports a changed system prompt and tool list', () => {
  const res = run(row([u('hi')]), row([u('hi'), a('x'), u('y')], { system: 'other', tools: [] }));
  assert.deepEqual(kinds(res), ['system-changed', 'tools-changed']);
});

test('reports an earlier message edited after it was sent', () => {
  const res = run(row([u('hi'), a('x'), u('y')]), row([u('HI'), a('x'), u('y'), a('z'), u('w')]));
  assert.deepEqual(kinds(res), ['history-rewritten']);
  assert.match(res.violations[0].detail, /message 0 changed/);
});

test('reports a truncated history', () => {
  const res = run(row([u('1'), a('2'), u('3')]), row([u('3')]));
  assert.deepEqual(kinds(res), ['history-rewritten']);
});

test('a different model or conversation starts its own baseline', () => {
  const res = run(row([u('hi')]), row([u('hi'), a('x'), u('y')], { model: 'fallback', system: 'small' }), row([u('new')], { conversationId: 'c2', system: 'other' }));
  assert.deepEqual(kinds(res), []);
  assert.equal(res.conversations, 2);
});

test('rows hold hashes, not prompt text', () => {
  const r = row([u('my secret')]);
  assert.doesNotMatch(JSON.stringify(r), /secret|helpful/);
});

test('bad lines and incomplete rows are reported', () => {
  const rows = parseNdjson('{"kind":"call"}\nnot json\n\n{"kind":"other"}', 'x.ndjson');
  assert.deepEqual(auditRows(rows).violations.map((v) => [v.kind, v.line]), [['bad-row', 1], ['bad-row', 2]]);
});

test('callRow requires a conversation id', () => {
  assert.throws(() => callRow({ messages: [] }), /conversationId/);
});
