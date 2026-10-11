import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// Key order must not change a hash, or identical requests would look mutated.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    // cache_control marks where a cache breakpoint sits; moving it is normal
    // and does not change the cached content.
    return `{${keys.filter((k) => k !== 'cache_control').map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// One row per model call, for `cache-invariants audit`. Pass the exact
// request you send: `system`, `tools` and `messages`. Only hashes are kept,
// so rows hold no prompt text.
//
// `history_chain[i]` hashes messages 0..i, so a later row whose chain does
// not start with an earlier row's chain proves an earlier message changed.
export function callRow({ conversationId, model, system, tools, messages, ts = new Date().toISOString() }) {
  if (!conversationId) throw new TypeError('callRow: conversationId is required');
  const history = Array.isArray(messages) ? messages : [];
  const chain = [];
  let prev = '';
  for (const m of history) {
    prev = sha(prev + canonical(m));
    chain.push(prev);
  }
  return {
    kind: 'call',
    ts,
    conversation_id: String(conversationId),
    model: model ?? 'unknown',
    system_sha: sha(canonical(system ?? '')),
    tools_sha: sha(canonical(tools ?? [])),
    history_len: history.length,
    history_chain: chain,
  };
}
