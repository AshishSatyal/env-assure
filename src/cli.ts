import { readFileSync, existsSync } from "fs";
import { checkEnv } from "./index.js";
import type { CheckEnvOptions, EnvSchema } from "./types.js";

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp(exitCode = 0): never {
  process.stdout.write(
    `
Usage: env-check [options]

Options:
  --schema <path>       Path to schema JSON file (required)
  --env    <path>       Path to a single .env file  (default: .env)
  --paths  <p1,p2,...>  Comma-separated .env files in priority order (first = highest)
  --help, -h            Show this help message

Schema JSON format:
  {
    "DATABASE_URL": { "required": true,  "type": "url",  "description": "for auth" },
    "PORT":         { "required": false, "type": "port", "default": "3000" },
    "NODE_ENV":     { "enum": ["development", "production", "test"] }
  }

Supported per-variable options (JSON):
  required, default, description, type, enum, pattern, example, min, max, secret

Note: The 'validate' and 'transform' function options are only available via the
      programmatic API — they cannot be expressed in a JSON schema file.

Exit codes:
  0  All variables valid
  1  Validation failed or bad arguments

`.trimStart(),
  );
  process.exit(exitCode);
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp(args.length === 0 ? 1 : 0);
}

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) {
    process.stderr.write(`Error: ${flag} requires a value\n`);
    process.exit(1);
  }
  return val;
}

const schemaPath = getArgValue("--schema");
const envPath = getArgValue("--env");
const pathsArg = getArgValue("--paths");

if (!schemaPath) {
  process.stderr.write("Error: --schema <path> is required\n\n");
  printHelp(1);
}

// ─── Load schema ──────────────────────────────────────────────────────────────

if (!existsSync(schemaPath)) {
  process.stderr.write(`Error: schema file not found: ${schemaPath}\n`);
  process.exit(1);
}

let schema: EnvSchema;
try {
  const raw = readFileSync(schemaPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    process.stderr.write("Error: schema must be a JSON object\n");
    process.exit(1);
  }
  schema = parsed as EnvSchema;
} catch (e) {
  if (e instanceof SyntaxError) {
    process.stderr.write(`Error: invalid JSON in schema file: ${e.message}\n`);
  } else {
    process.stderr.write(
      `Error: could not read schema file: ${(e as Error).message}\n`,
    );
  }
  process.exit(1);
}

// ─── Run validation ───────────────────────────────────────────────────────────

const opts: CheckEnvOptions = { onError: "exit", printSummary: true };

if (pathsArg) {
  opts.paths = pathsArg.split(",").map((p) => p.trim());
} else if (envPath) {
  opts.path = envPath;
}

checkEnv(schema, opts);
