// ─── Schema definition ────────────────────────────────────────────────────────

/** Supported type coercions / format checks */
export type EnvVarType =
  | "string"
  | "number"
  | "boolean"
  | "url"
  | "email"
  | "port"
  | "json";

/** Per-variable schema entry */
export interface EnvVarSchema {
  /** Whether this variable must be present. Defaults to `true`. */
  required?: boolean;
  /** Fallback value when the variable is absent. Marks the var as optional. */
  default?: string;
  /** Human-readable purpose, shown in error messages, e.g. "required for auth" */
  description?: string;
  /** Format/type validation and auto-coercion */
  type?: EnvVarType;
  /** Restrict the value to a fixed set of strings */
  enum?: readonly string[];
  /** Regex the value must satisfy */
  pattern?: string | RegExp;
  /** Example value shown alongside missing-variable errors */
  example?: string;
  /** Minimum value (number / port types) */
  min?: number;
  /** Maximum value (number / port types) */
  max?: number;
  /**
   * Mask the value with `****` in all output and logs.
   * Use for passwords, tokens, API keys, and other secrets.
   */
  secret?: boolean;
  /**
   * Custom validation function. Return `true` to pass, or a string error message.
   * Runs after built-in type / enum / pattern checks.
   * @example validate: (v) => v.startsWith('sk_') || 'must start with sk_'
   */
  validate?: (value: string) => true | string;
  /**
   * Transform the raw string value into any type before it is returned.
   * The return type is reflected in the inferred type of `checkEnv`.
   * @example transform: (v) => parseInt(v, 10)
   * @example transform: (v) => JSON.parse(v) as MyConfig
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform?: (value: string) => any;
}

/** Full schema: a plain object mapping env var names to their rules */
export interface EnvSchema {
  [key: string]: EnvVarSchema;
}

// ─── Type inference ───────────────────────────────────────────────────────────

/** Infer the output value type for a single schema entry */
export type InferValue<S extends EnvVarSchema> =
  // Custom transform wins → infer its return type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  S extends { transform: (...args: any[]) => infer R }
    ? R
    : // Auto-coerce number / port → number
      S extends { type: "number" | "port" }
      ? number
      : // Auto-coerce boolean → boolean
        S extends { type: "boolean" }
        ? boolean
        : // json → unknown (caller must cast)
          S extends { type: "json" }
          ? unknown
          : // Enum → narrow to the union of allowed string literals
            S extends { enum: readonly (infer E extends string)[] }
            ? E
            : string;

/** `true` when the key is guaranteed to appear in the validated output */
type IsDefinitelyPresent<S extends EnvVarSchema> = S extends { required: false }
  ? S extends { default: string }
    ? true
    : false
  : true;

/**
 * Infer the full return type of `checkEnv` from a schema.
 *
 * Keys that are `required: false` without a `default` are typed as `T | undefined`.
 *
 * @example
 * const env = checkEnv({ PORT: { type: 'port', default: '3000' } });
 * // typeof env  →  { PORT: number }
 */
export type InferEnv<T extends EnvSchema> = {
  [K in keyof T]: IsDefinitelyPresent<T[K]> extends true
    ? InferValue<T[K]>
    : InferValue<T[K]> | undefined;
};

// ─── Options ─────────────────────────────────────────────────────────────────

export interface CheckEnvOptions {
  /**
   * Path to the .env file.
   * @default '.env'
   */
  path?: string;
  /**
   * Paths to multiple .env files, merged in priority order (first = highest priority).
   * When provided, overrides `path`.
   * @example paths: ['.env.local', '.env']
   */
  paths?: string | string[];
  /**
   * Load and merge the .env file(s) before validating.
   * Variables already set in `process.env` (or `options.env`) take precedence.
   * @default true
   */
  loadDotEnv?: boolean;
  /**
   * What to do when validation fails.
   * - `'exit'`  — print errors and call `process.exit(exitCode)` (default)
   * - `'throw'` — throw an `EnvValidationError`
   * - `'warn'`  — print errors and continue
   * @default 'exit'
   */
  onError?: "exit" | "throw" | "warn";
  /**
   * Exit code used when `onError === 'exit'`.
   * @default 1
   */
  exitCode?: number;
  /**
   * Custom env object to validate (instead of `process.env`).
   * Useful in tests.
   */
  env?: Record<string, string | undefined>;
  /**
   * Suppress the success message.
   * @default false
   */
  quiet?: boolean;
  /**
   * Print a summary table of all validated variables and their values on startup.
   * Secret values are masked automatically.
   * @default false
   */
  printSummary?: boolean;
}

// ─── Validation result ────────────────────────────────────────────────────────

export type ValidationErrorType =
  | "missing"
  | "invalid"
  | "pattern"
  | "enum"
  | "range"
  | "custom";

export interface ValidationError {
  key: string;
  type: ValidationErrorType;
  message: string;
  schema: EnvVarSchema;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** Validated (and optionally transformed / coerced) values */
  env: Record<string, unknown>;
}
