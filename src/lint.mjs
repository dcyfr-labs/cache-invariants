import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { RULES, allowedRules } from './rules.mjs';

export const DEFAULT_EXTENSIONS = [
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.py', '.sh', '.bash',
];

export const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.cache',
  '__pycache__', '.venv', 'venv', '.turbo', 'vendor',
];

// Test files build fake transcripts on purpose; pass --include-tests to scan them.
const TEST_FILE = /(?:^|[/\\])(?:__tests__|__mocks__|test|tests|fixtures)[/\\]|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|[/\\])test_[^/\\]*\.py$|_test\.py$/;

const COMMENT_ONLY = /^\s*(#|\/\/|\*|\/\*)/;

// Check one file's text. Returns findings sorted by line.
export function lintSource(text, file = '<input>', { rules = RULES } = {}) {
  const lines = text.split('\n');
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (COMMENT_ONLY.test(line)) continue;
    const allowed = allowedRules(line, lines[i - 1] ?? '');
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      if (allowed.has(rule.id) || allowed.has('all')) continue;
      findings.push({
        file,
        line: i + 1,
        column: m.index + 1,
        rule: rule.id,
        severity: rule.severity,
        message: rule.message,
        source: line.trim().slice(0, 200),
      });
    }
  }
  return findings;
}

async function* walk(path, opts, top = true) {
  const { extensions, ignore, includeTests } = opts;
  const info = await stat(path).catch(() => null);
  if (!info) throw new Error(`no such file or directory: ${path}`);
  if (info.isFile()) {
    // A file named on the command line is always checked.
    if (top || (extensions.includes(extname(path)) && (includeTests || !TEST_FILE.test(path)))) yield path;
    return;
  }
  const entries = await readdir(path, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    // Hidden directories (.git, .claude worktrees, editor state) are skipped.
    if (ignore.includes(e.name) || (e.isDirectory() && e.name.startsWith('.'))) continue;
    const full = join(path, e.name);
    if (e.isDirectory()) yield* walk(full, opts, false);
    else if (e.isFile()) yield* walk(full, opts, false);
  }
}

// Check every matching file under the given paths.
export async function lintPaths(paths, {
  cwd = process.cwd(),
  extensions = DEFAULT_EXTENSIONS,
  ignore = DEFAULT_IGNORE,
  includeTests = false,
} = {}) {
  const findings = [];
  let files = 0;
  for (const p of paths) {
    for await (const file of walk(resolve(cwd, p), { extensions, ignore, includeTests })) {
      files++;
      const text = await readFile(file, 'utf8');
      findings.push(...lintSource(text, relative(cwd, file) || p));
    }
  }
  return { files, findings };
}
