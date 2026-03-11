import { parseEnvFile } from "./parser.js";
import { validate } from "./validator.js";
import { formatErrors, formatSuccess, formatSummary } from "./formatter.js";
import type {
  EnvSchema,
  CheckEnvOptions,
  ValidationResult,
  InferEnv,
} from "./types.js";

export type {
  EnvSchema,
  EnvVarSchema,
  EnvVarType,
  CheckEnvOptions,
  ValidationError,
  ValidationResult,
  InferValue,
  InferEnv,
} from "./types.js";

export { validate } from "./validator.js";
export { parseEnvFile, parseEnvString } from "./parser.js";

/**
 * Validate environment variables against a schema at app startup.
 *
 * Returns a **fully typed** object — key types are inferred directly from the
 * schema you pass in.  No separate type declaration needed.
 *
 * @example
 * ```ts
 * import { checkEnv } from 'env-check';
 *
 * const env = checkEnv({
 *   DATABASE_URL: { required: true,  type: 'url',  description: 'required for auth' },
 *   PORT:         { required: false, type: 'port', default: '3000' },
 *   NODE_ENV:     { required: true,  enum: ['development', 'production', 'test'] as const },
 *   API_KEY:      { required: true,  secret: true },
 * });
 *
 * // env.DATABASE_URL → string
 * // env.PORT         → number (auto-coerced)
 * // env.NODE_ENV     → 'development' | 'production' | 'test'
 * // env.API_KEY      → string  (masked in logs)
 * ```
 *
 * @param schema  - Variable definitions
 * @param options - Behaviour options
 * @returns       Typed, validated (and coerced) values — schema keys only
 */
export function checkEnv<T extends EnvSchema>(
  schema: T,
  options: CheckEnvOptions = {},
): InferEnv<T> {
  const {
    path: envPath = ".env",
    paths: envPaths,
    loadDotEnv = true,
    onError = "exit",
    exitCode = 1,
    quiet = false,
    printSummary = false,
  } = options;

  // ── Build the env to validate ──────────────────────────────────────────────
  // Priority: options.env / process.env  >  .env file values
  const base: Record<string, string | undefined> = options.env ?? {
    ...process.env,
  };

  let env: Record<string, string | undefined> = base;

  if (loadDotEnv) {
    // Normalise: first entry = highest priority
    const pathList = envPaths
      ? Array.isArray(envPaths)
        ? envPaths
        : [envPaths]
      : [envPath];

    // Process in reverse so highest-priority file wins final Object.assign
    let fileEnv: Record<string, string> = {};
    for (const p of [...pathList].reverse()) {
      Object.assign(fileEnv, parseEnvFile(p));
    }

    // Merge: base (process.env / options.env) takes precedence over file values
    const merged: Record<string, string | undefined> = { ...fileEnv };
    for (const key of Object.keys(base)) {
      if (base[key] !== undefined) merged[key] = base[key];
    }
    env = merged;
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const result = validate(env, schema);

  if (printSummary) {
    process.stdout.write(formatSummary(schema, result));
  }

  if (!result.valid) {
    const message = formatErrors(result.errors);

    if (onError === "throw") {
      throw new EnvValidationError(message, result);
    } else if (onError === "warn") {
      console.warn(message);
    } else {
      // 'exit' (default)
      process.stderr.write(message);
      process.exit(exitCode);
    }
  } else if (!quiet && !printSummary) {
    const count = Object.keys(schema).length;
    process.stdout.write(formatSuccess(count) + "\n");
  }

  return result.env as InferEnv<T>;
}

// ─── Error class ──────────────────────────────────────────────────────────────

/**
 * Thrown by `checkEnv` when `options.onError === 'throw'` and validation fails.
 */
export class EnvValidationError extends Error {
  /** Full validation result, including every individual error */
  public readonly result: ValidationResult;

  constructor(message: string, result: ValidationResult) {
    super(message);
    this.name = "EnvValidationError";
    this.result = result;
    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
