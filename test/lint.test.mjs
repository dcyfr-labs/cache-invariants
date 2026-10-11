import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintSource } from '../src/index.mjs';

const rules = (src) => lintSource(src).map((f) => f.rule);

test('flags a timestamp in an SDK system field', () => {
  assert.deepEqual(rules('  system: `You are helpful. Now: ${new Date().toISOString()}`,'), ['nondeterministic-system-prompt']);
  assert.deepEqual(rules('system=SYSTEM_PROMPT + f"\\nToday is {datetime.date.today()}",'), ['nondeterministic-system-prompt']);
  assert.deepEqual(rules('system_prompt="$base Run at $(date +%s)"'), ['nondeterministic-system-prompt']);
});

test('a stable system prompt is clean', () => {
  assert.deepEqual(rules('  system: SYSTEM_PROMPT,'), []);
  assert.deepEqual(rules('const systemPrompt = loadPrompt("support.md");'), []);
  assert.deepEqual(rules('const created = new Date().toISOString(); // log line'), []);
});

test('flags appending to a system prompt as a warning', () => {
  for (const src of ['system_prompt += extra', 'this.systemPrompt += note;', 'systemPrompt = `${systemPrompt}\\n${note}`', 'SYSTEM_PROMPT = SYSTEM_PROMPT + x']) {
    const [f] = lintSource(src);
    assert.equal(f?.rule, 'system-prompt-append', src);
    assert.equal(f.severity, 'warn');
  }
});

test('flags tool list mutation as a warning', () => {
  for (const src of ['tools.push(billingTool);', 'tools.append(t)', 'tools = [...tools, extra];', 'tools += [extra]', 'tools = tools.filter(t => t.name !== "x")']) {
    assert.deepEqual(rules(src), ['tool-list-mutation'], src);
  }
  assert.deepEqual(rules('const tools = [search, fetch];'), []);
});

test('flags edits to earlier messages as errors', () => {
  for (const src of ['messages[0].content = redact(messages[0].content);', 'history[2]["content"] = ""', 'messages.splice(1, 2);', 'history = history.slice(-10)', 'messages = messages.filter(m => m.role !== "tool")']) {
    const [f] = lintSource(src);
    assert.equal(f?.rule, 'history-rewrite', src);
    assert.equal(f.severity, 'error');
  }
  assert.deepEqual(rules('messages.push({ role: "user", content: input });'), []);
  assert.deepEqual(rules('if (messages[0] === undefined) return;'), []);
});

test('an allow comment silences one rule on its own line or the line above', () => {
  assert.deepEqual(rules('history = history.slice(-10) // cache-invariants: allow history-rewrite'), []);
  assert.deepEqual(rules('# cache-invariants: allow history-rewrite\nhistory = history[-10:]\nhistory[0] = x'), ['history-rewrite']);
  assert.deepEqual(rules('tools.push(x) // cache-invariants: allow history-rewrite'), ['tool-list-mutation']);
});

test('comment lines are skipped', () => {
  assert.deepEqual(rules('// messages[0].content = x\n# tools.append(y)'), []);
});

test('findings carry file, line and column', () => {
  const [f] = lintSource('ok\n  messages.splice(0, 1)', 'a.ts');
  assert.equal(f.file, 'a.ts');
  assert.equal(f.line, 2);
  assert.ok(f.column > 1);
});

test('a keyed map named history is not a transcript', () => {
  assert.deepEqual(rules('history[server.name] = [];'), []);
  assert.deepEqual(rules('messages[0] = { role: "user", content: "x" };'), ['history-rewrite']);
});
