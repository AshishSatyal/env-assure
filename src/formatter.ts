import { EnvSchema, ValidationError, ValidationResult } from "./types.js";

// ANSI escape codes — only used when stderr/stdout supports colour
const isTTY =
  (typeof process !== "undefined" && process.stderr?.isTTY) ?? false;

const c = {
  red: isTTY ? "\x1b[31m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  green: isTTY ? "\x1b[32m" : "",
  dim: isTTY ? "\x1b[2m" : "",
  bold: isTTY ? "\x1b[1m" : "",
  reset: isTTY ? "\x1b[0m" : "",
};

export function formatErrors(errors: ValidationError[]): string {
  const lines: string[] = [
    "",
    `${c.bold}${c.red}[env-check] Environment validation failed (${errors.length} error${errors.length !== 1 ? "s" : ""})${c.reset}`,
    "",
  ];

  for (const error of errors) {
    const [first, ...rest] = error.message.split("\n");
    lines.push(`  ${c.red}✗${c.reset} ${first}`);
    for (const sub of rest) {
      lines.push(`    ${c.dim}${sub}${c.reset}`);
    }
  }

  lines.push("");
  lines.push(`  ${c.dim}Fix the above and restart your application.${c.reset}`);
  lines.push("");

  return lines.join("\n");
}

export function formatSuccess(count: number): string {
  const noun = count === 1 ? "variable" : "variables";
  return `${c.dim}[env-check] ${count} ${noun} validated.${c.reset}`;
}

/**
 * Print a compact summary table of every schema variable with its status and
 * (optionally masked) value.
 */
export function formatSummary(
  schema: EnvSchema,
  result: ValidationResult,
): string {
  const keys = Object.keys(schema);
  const errorMap = new Map(result.errors.map((e) => [e.key, e]));

  const passed = Object.keys(result.env).length;
  const total = keys.length;

  // Pad key column to the longest key name (minimum 8)
  const keyWidth = Math.max(8, ...keys.map((k) => k.length));

  const lines: string[] = [
    "",
    `${c.bold}[env-check] Validation summary (${passed}/${total} passed)${c.reset}`,
    "",
  ];

  for (const key of keys) {
    const varSchema = schema[key];
    const error = errorMap.get(key);
    const coerced = result.env[key];

    let icon: string;
    let valueStr: string;

    if (error) {
      icon = `${c.red}✗${c.reset}`;
      valueStr =
        error.type === "missing"
          ? `${c.dim}(missing)${c.reset}`
          : `${c.red}(invalid)${c.reset}`;
    } else if (coerced === undefined) {
      icon = `${c.dim}–${c.reset}`;
      valueStr = `${c.dim}(not set)${c.reset}`;
    } else {
      icon = `${c.green}✓${c.reset}`;
      const raw = String(coerced);
      valueStr = varSchema?.secret
        ? `${c.dim}****${c.reset}`
        : raw.length > 40
          ? raw.slice(0, 40) + "…"
          : raw;
    }

    lines.push(`  ${key.padEnd(keyWidth)}  ${icon}  ${valueStr}`);
  }

  lines.push("");
  return lines.join("\n");
}
