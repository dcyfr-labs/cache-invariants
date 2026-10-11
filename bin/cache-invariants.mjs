#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { lintPaths } from '../src/lint.mjs';
import { auditRows, parseNdjson } from '../src/audit.mjs';
import { RULES } from '../src/rules.mjs';

const HELP = `cache-invariants: find code that breaks LLM prompt caching

Usage:
  cache-invariants lint [paths...]   scan source files (default: .)
  cache-invariants audit <files...>  replay call logs written with callRow()
  cache-invariants rules             list the lint rules

Options:
  --json           machine-readable output
  --strict         lint: fail on warnings too
  --include-tests  lint: also scan test files and fixtures
  -h, --help       show this help

Exit codes: 0 clean, 1 problems found, 2 usage or runtime error.`;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('-')));
const [cmd, ...rest] = argv.filter((a) => !a.startsWith('-'));
const json = flags.has('--json');

async function lint() {
  const { files, findings } = await lintPaths(rest.length ? rest : ['.'], { includeTests: flags.has('--include-tests') });
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  if (json) {
    console.log(JSON.stringify({ files, errors, warnings, findings }, null, 2));
  } else {
    for (const f of findings) {
      console.log(`${f.file}:${f.line}:${f.column}  ${f.severity === 'error' ? 'error' : 'warn '}  ${f.message}  [${f.rule}]`);
      console.log(`    ${f.source}`);
    }
    console.log(`${files} file(s) checked: ${errors} error(s), ${warnings} warning(s)`);
  }
  return errors > 0 || (flags.has('--strict') && warnings > 0) ? 1 : 0;
}

async function audit() {
  if (!rest.length) throw new Error('audit needs at least one .ndjson file');
  const rows = [];
  for (const f of rest) rows.push(...parseNdjson(await readFile(f, 'utf8'), f));
  const { calls, conversations, violations } = auditRows(rows);
  if (json) {
    console.log(JSON.stringify({ calls, conversations, violations }, null, 2));
  } else {
    for (const v of violations) {
      console.log(`${v.file}:${v.line}  ${v.kind}  ${v.conversation_id ?? ''} ${v.model ?? ''}  ${v.detail}`.replace(/ {3,}/g, '  '));
    }
    console.log(`${calls} call(s) in ${conversations} conversation(s): ${violations.length} problem(s)`);
  }
  return violations.length ? 1 : 0;
}

function rules() {
  for (const r of RULES) console.log(`${r.id.padEnd(32)} ${r.severity.padEnd(6)} ${r.message}`);
  return 0;
}

try {
  if (flags.has('-h') || flags.has('--help') || !cmd) {
    console.log(HELP);
    process.exit(cmd || flags.size ? 0 : 2);
  }
  const run = { lint, audit, rules }[cmd];
  if (!run) throw new Error(`unknown command "${cmd}"`);
  process.exit(await run());
} catch (e) {
  console.error(`cache-invariants: ${e.message}`);
  process.exit(2);
}
