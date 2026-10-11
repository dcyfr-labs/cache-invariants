// Static rules. Each one matches a single source line that looks like it
// changes the cached prefix of an LLM conversation after the first call.
// They are line-level heuristics, not a parser: cheap enough for pre-commit,
// with an inline allow comment for the deliberate cases.

const PROMPT_NAME = String.raw`(?:system_prompt|systemPrompt|SYSTEM_PROMPT|system_message|systemMessage)`;

// Values that differ on every run. One of these inside a system prompt makes
// every request a fresh cache key.
const NONDETERMINISTIC = String.raw`(?:Date\.now\(\)|new Date\(|\.toISOString\(\)|\.toLocaleString\(|\.toLocaleDateString\(|\.toLocaleTimeString\(|randomUUID\(\)|Math\.random\(\)|uuid\.uuid[14]\(|uuidv4\(|\buuid\(\)|time\.time\(\)|datetime\.now\(|datetime\.utcnow\(|date\.today\(|process\.pid|os\.getpid\(|\$\((?:date|uuidgen|openssl\s+rand)|\$RANDOM|\$\$)`;

const SYSTEM_SITE = String.raw`(?:${PROMPT_NAME}|\bsystem\s*[:=]|["']system["']\s*[:,])`;

export const RULES = [
  {
    id: 'system-prompt-append',
    // A warning: building a prompt up in steps before the first call is fine.
    severity: 'warn',
    message: 'system prompt is appended to; if this runs after the first call, every later call misses the cache',
    re: new RegExp(
      String.raw`(?:^|\W)(${PROMPT_NAME})\s*(?:\+=|=\s*(["'\x60]?)\$?\{?\1\}?\s*\+|=\s*f?["'\x60][^"'\x60]*\$?\{\1\}|\.(?:append|push|concat|extend)\()`,
    ),
  },
  {
    id: 'nondeterministic-system-prompt',
    severity: 'error',
    message: 'time, random or process-specific value in the system prompt; the prefix is unique per request',
    re: new RegExp(
      String.raw`${SYSTEM_SITE}[^\n]{0,240}${NONDETERMINISTIC}|${NONDETERMINISTIC}[^\n]{0,160}${SYSTEM_SITE}`,
    ),
  },
  {
    id: 'tool-list-mutation',
    // A warning: pushing tools into a list before the first call is fine.
    severity: 'warn',
    message: 'tool list changes mid-conversation; fix the tool set before the first call',
    re: /\b(tools|TOOLS|toolList|tool_list|toolSchemas?|tool_schemas?)\b\s*(?:\.(?:append|push|unshift|splice|extend|insert|pop|shift|remove)\(|\+=\s*\[|=\s*\[\s*\.\.\.\1\b|=\s*\1\s*\+|=\s*\1\.(?:filter|concat)\()/,
  },
  {
    id: 'history-rewrite',
    severity: 'error',
    message: 'an earlier message is edited or removed in place; cached history must be append-only',
    // An indexed write counts only with a numeric index or a content field:
    // `history[server.name] = []` is a map, not a transcript.
    re: /\b(messages|history|conversation|chatHistory|chat_history)(?:\[\s*-?\d+\s*\]\s*=(?!=)|\[[^\]]+\](?:\.content|\[['"](?:content|text)['"]\])\s*=(?!=)|\.(?:splice|shift)\(|\s*=\s*\1\.(?:filter|slice)\()/,
  },
];

export const RULE_IDS = RULES.map((r) => r.id);

const ALLOW_RE = /(?:#|\/\/|\/\*)\s*cache-invariants:\s*allow\s+([\w-]+(?:\s*,\s*[\w-]+)*)/;

// An allow comment on the line itself or on the line just above it.
export function allowedRules(line, prevLine = '') {
  const ids = new Set();
  for (const l of [line, prevLine]) {
    const m = l.match(ALLOW_RE);
    if (m) for (const id of m[1].split(',')) ids.add(id.trim());
  }
  return ids;
}
