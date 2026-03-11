import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Matches: [export] KEY=VALUE
const KEY_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Parse a .env file from disk.
 * Returns an empty object if the file does not exist.
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) return {};
  const content = readFileSync(resolved, "utf8");
  return parseEnvString(content);
}

/**
 * Parse a .env-formatted string into a key/value map.
 *
 * Supported syntax:
 *  - `KEY=value`
 *  - `KEY="quoted value"` / `KEY='single quoted'`
 *  - Multi-line double-quoted values
 *  - `export KEY=value`
 *  - `# comment` lines and inline ` # comments` on unquoted values
 *  - Escape sequences inside double-quoted values: \n \r \t \\ \"
 */
export function parseEnvString(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line.startsWith("#")) continue;

    const match = KEY_RE.exec(line);
    if (!match) continue;

    const key = match[1];
    const raw = match[2] ?? "";

    const [value, nextIndex] = extractValue(raw, lines, i);
    i = nextIndex;

    result[key] = value;
  }

  return result;
}

function extractValue(
  raw: string,
  lines: string[],
  lineIndex: number,
): [string, number] {
  const trimmed = raw.trim();

  if (!trimmed) return ["", lineIndex];

  const quote = trimmed[0];

  // ── Unquoted ─────────────────────────────────────────────────────────────
  if (quote !== '"' && quote !== "'") {
    // Strip trailing inline comment: anything after whitespace + '#'
    const commentMatch = trimmed.match(/^(.*?)\s+#.*$/);
    return [commentMatch ? commentMatch[1].trim() : trimmed, lineIndex];
  }

  // Single-line: starts AND ends with the same quote (and length > 1)
  if (trimmed.length > 1 && trimmed.endsWith(quote)) {
    return [processQuoted(trimmed.slice(1, -1), quote), lineIndex];
  }

  // Multi-line (only double-quoted in practice)
  let value = trimmed.slice(1); // strip opening quote
  let i = lineIndex;
  let closed = false;

  while (++i < lines.length) {
    const nextLine = lines[i];
    if (nextLine.endsWith(quote)) {
      value += "\n" + nextLine.slice(0, -1);
      closed = true;
      break;
    }
    value += "\n" + nextLine;
  }

  if (!closed) {
    // Unterminated quote — return what we have
    return [processQuoted(value, quote), i];
  }

  return [processQuoted(value, quote), i];
}

function processQuoted(value: string, quote: string): string {
  if (quote !== '"') return value;
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"');
}
