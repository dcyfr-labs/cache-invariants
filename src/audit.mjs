// Replays call rows (from callRow) and reports every place a conversation's
// cached prefix changed between two calls. Rows are grouped per
// (conversation_id, model): a fallback to another model starts its own cache,
// so a different prompt there is not a mutation.

export function parseNdjson(text, file = '<input>') {
  const rows = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      rows.push({ row: JSON.parse(line), file, line: i + 1 });
    } catch {
      rows.push({ row: null, file, line: i + 1 });
    }
  });
  return rows;
}

const REQUIRED = ['conversation_id', 'system_sha', 'tools_sha', 'history_len', 'history_chain'];

export function auditRows(rows) {
  const violations = [];
  const scopes = new Map();
  const conversations = new Set();
  let calls = 0;

  for (const { row, file, line } of rows) {
    const at = { file, line };
    if (row === null) {
      violations.push({ ...at, kind: 'bad-row', detail: 'line is not valid JSON' });
      continue;
    }
    if (row.kind !== 'call') continue;
    const missing = REQUIRED.filter((k) => row[k] === undefined || row[k] === null);
    if (missing.length) {
      violations.push({ ...at, kind: 'bad-row', detail: `missing ${missing.join(', ')}` });
      continue;
    }
    calls++;
    const id = row.conversation_id;
    const model = row.model ?? 'unknown';
    conversations.add(id);
    const key = `${id}\u0000${model}`;
    const prev = scopes.get(key);
    scopes.set(key, row);
    if (!prev) continue;

    const where = { ...at, conversation_id: id, model };
    if (row.system_sha !== prev.system_sha) {
      violations.push({ ...where, kind: 'system-changed', detail: 'system prompt differs from the previous call' });
    }
    if (row.tools_sha !== prev.tools_sha) {
      violations.push({ ...where, kind: 'tools-changed', detail: 'tool definitions differ from the previous call' });
    }
    if (row.history_len < prev.history_len) {
      violations.push({ ...where, kind: 'history-rewritten', detail: `history shrank from ${prev.history_len} to ${row.history_len} messages` });
    } else if (prev.history_len > 0) {
      const i = prev.history_len - 1;
      if (row.history_chain[i] !== prev.history_chain[i]) {
        const first = prev.history_chain.findIndex((h, j) => row.history_chain[j] !== h);
        violations.push({ ...where, kind: 'history-rewritten', detail: `message ${first} changed after it was sent` });
      }
    }
  }
  return { calls, conversations: conversations.size, violations };
}
