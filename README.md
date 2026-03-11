# env-check

> Validates your `.env` file against a schema on app startup — gives clear, human-friendly error messages instead of cryptic runtime crashes.

```
[env-check] Environment validation failed (3 errors)

  ✗ Missing: DATABASE_URL (required for auth)
    ↳ Example: DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
  ✗ Missing: REDIS_URL (required for caching)
  ✗ Invalid: NODE_ENV must be one of [development | production | test], got "prod"

  Fix the above and restart your application.
```

## Install

```bash
npm install env-check
# or
pnpm add env-check
# or
yarn add env-check
```

No runtime dependencies. Works with or without `dotenv`.

---

## Quick start

Call `checkEnv` **once, at the very top of your entry file**, before any other imports that use environment variables.

```ts
// src/index.ts  (or server.ts, app.ts, …)
import { checkEnv } from "env-check";

const env = checkEnv({
  DATABASE_URL: {
    required: true,
    type: "url",
    description: "required for auth",
    example: "postgresql://user:pass@localhost:5432/mydb",
  },
  REDIS_URL: {
    required: true,
    type: "url",
    description: "required for caching",
  },
  PORT: {
    required: false,
    type: "port",
    default: "3000",
  },
  NODE_ENV: {
    required: true,
    enum: ["development", "production", "test"] as const,
  },
  API_KEY: {
    required: true,
    secret: true, // ← masked in all logs and summaries
  },
  DEBUG: {
    required: false,
    type: "boolean",
    default: "false",
  },
});

// `env` is fully typed from the schema — no manual type declarations needed
// env.DATABASE_URL  →  string
// env.PORT          →  number  (auto-coerced)
// env.NODE_ENV      →  'development' | 'production' | 'test'
// env.DEBUG         →  boolean (auto-coerced)
```

`env-check` automatically loads your `.env` file (no `dotenv.config()` needed). Variables already present in `process.env` always take precedence.

---

## TypeScript inference

`checkEnv` is fully generic — the return type is inferred directly from the schema you pass in:

```ts
const env = checkEnv({
  PORT: { type: "port", default: "3000" }, // → number
  DEBUG: { type: "boolean", default: "false" }, // → boolean
  NODE_ENV: { enum: ["development", "production"] as const }, // → 'development' | 'production'
  SCORE: { transform: (v) => parseFloat(v) }, // → number (inferred from transform)
  OPTIONAL: { required: false }, // → string | undefined
});
```

No separate `z.infer<>` or manual interface needed.

---

## Schema reference

### `EnvVarSchema` options

| Option        | Type                                                                        | Default    | Description                                                    |
| ------------- | --------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| `required`    | `boolean`                                                                   | `true`     | Whether the variable must be present                           |
| `default`     | `string`                                                                    | —          | Fallback value when absent (makes the var optional implicitly) |
| `description` | `string`                                                                    | —          | Human-readable purpose shown in error messages                 |
| `example`     | `string`                                                                    | —          | Example value shown below missing-variable errors              |
| `type`        | `'string' \| 'number' \| 'boolean' \| 'url' \| 'email' \| 'port' \| 'json'` | `'string'` | Format validation + auto-coercion                              |
| `enum`        | `readonly string[]`                                                         | —          | Restrict to a fixed set of allowed values                      |
| `pattern`     | `string \| RegExp`                                                          | —          | Regex the value must satisfy                                   |
| `min`         | `number`                                                                    | —          | Minimum value (`number` / `port` types)                        |
| `max`         | `number`                                                                    | —          | Maximum value (`number` / `port` types)                        |
| `secret`      | `boolean`                                                                   | `false`    | Mask value with `****` in all output and logs                  |
| `validate`    | `(value: string) => true \| string`                                         | —          | Custom validation: return `true` or an error message           |
| `transform`   | `(value: string) => T`                                                      | —          | Transform the raw string — return type is inferred by TS       |

### Type details & auto-coercion

| Type      | Validates                                                 | Returns   |
| --------- | --------------------------------------------------------- | --------- |
| `string`  | Any non-empty string (default)                            | `string`  |
| `number`  | Parseable as a finite number                              | `number`  |
| `boolean` | `true`, `false`, `1`, `0`, `yes`, `no` (case-insensitive) | `boolean` |
| `url`     | Starts with `http://` or `https://`                       | `string`  |
| `email`   | Basic `user@domain.tld` format                            | `string`  |
| `port`    | Integer between 1–65535                                   | `number`  |
| `json`    | Valid `JSON.parse`-able string                            | `unknown` |

---

## `checkEnv` options

```ts
checkEnv(schema, options?)
```

| Option         | Type                          | Default       | Description                                                                  |
| -------------- | ----------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `path`         | `string`                      | `'.env'`      | Path to the `.env` file                                                      |
| `paths`        | `string \| string[]`          | —             | Multiple `.env` files in priority order (first = highest). Overrides `path`. |
| `loadDotEnv`   | `boolean`                     | `true`        | Whether to load and merge the `.env` file(s)                                 |
| `onError`      | `'exit' \| 'throw' \| 'warn'` | `'exit'`      | What to do when validation fails                                             |
| `exitCode`     | `number`                      | `1`           | Exit code used when `onError === 'exit'`                                     |
| `env`          | `Record<string, string>`      | `process.env` | Override the env object (useful in tests)                                    |
| `quiet`        | `boolean`                     | `false`       | Suppress the success log line                                                |
| `printSummary` | `boolean`                     | `false`       | Print a table of all variables and their (masked) values                     |

### `onError` behaviours

- **`'exit'`** (default) — prints errors to `stderr` and calls `process.exit(1)`. Ideal for production servers that must not start with bad config.
- **`'throw'`** — throws an `EnvValidationError`. Good for test suites and programmatic use.
- **`'warn'`** — prints errors to `stderr` and continues. Useful during local development.

---

## `secret` — masking sensitive values

Mark any variable as `secret: true` to prevent its value from appearing in error output or the `printSummary` table.

```ts
checkEnv({
  DATABASE_URL: { required: true, type: "url", secret: true },
  API_KEY: { required: true, secret: true },
});
```

If `API_KEY` is set to the wrong type, the error reads:

```
✗ Invalid: API_KEY must be a valid URL (http/https), got "****"
```

---

## `transform` — return any type

Use `transform` to convert the raw string to any value. TypeScript infers the return type automatically.

```ts
const env = checkEnv({
  PORT: { type: "port", transform: (v) => parseInt(v, 10) }, // → number
  ALLOWED_IPS: { transform: (v) => v.split(",") }, // → string[]
  CONFIG: { type: "json", transform: (v) => JSON.parse(v) as MyConfig }, // → MyConfig
});
```

`transform` runs **after** all built-in validations pass, so the value is guaranteed to be valid before it reaches your function.

---

## `validate` — custom logic

Return `true` to pass, or a string to fail with a custom message:

```ts
checkEnv({
  API_KEY: {
    validate: (v) =>
      v.startsWith("sk_live_") || "must be a live key (starts with sk_live_)",
  },
  JWT_SECRET: {
    validate: (v) => v.length >= 32 || "must be at least 32 characters",
  },
});
```

---

## Multiple `.env` files

Use `paths` to load several files, merged in priority order (first = highest):

```ts
checkEnv(schema, {
  paths: [".env.local", ".env"], // .env.local overrides .env
});
```

Variables already set in `process.env` always win over any file.

---

## `printSummary` — startup table

Print a compact summary of all validated variables at startup:

```ts
checkEnv(schema, { printSummary: true });
```

```
[env-check] Validation summary (5/6 passed)

  DATABASE_URL    ✓  ****
  REDIS_URL       ✓  ****
  PORT            ✓  3000
  NODE_ENV        ✓  production
  API_KEY         ✗  (missing)
  DEBUG           ✓  false
```

---

## CLI — `npx env-check`

Validate a `.env` file from the command line (useful in CI):

```bash
npx env-check --schema schema.json --env .env.production
```

```
Usage: env-check [options]

Options:
  --schema <path>       Path to schema JSON file (required)
  --env    <path>       Path to a single .env file (default: .env)
  --paths  <p1,p2,...>  Comma-separated .env files in priority order
  --help, -h            Show this help message
```

**schema.json**:

```json
{
  "DATABASE_URL": {
    "required": true,
    "type": "url",
    "description": "main database"
  },
  "PORT": { "required": false, "type": "port", "default": "3000" },
  "NODE_ENV": { "enum": ["development", "production", "test"] }
}
```

> Note: The `validate` and `transform` function options are only available via the programmatic API — they cannot be expressed in a JSON file.

---

## Using with dotenv

You don't need `dotenv` — `env-check` loads `.env` itself. But if you already use it, disable the built-in loader:

```ts
import "dotenv/config";
import { checkEnv } from "env-check";

checkEnv(schema, { loadDotEnv: false });
```

---

## Using in tests

Pass a custom `env` object and `onError: 'throw'` to keep tests hermetic:

```ts
import { checkEnv, EnvValidationError } from "env-check";

it("rejects missing DATABASE_URL", () => {
  expect(() =>
    checkEnv(
      { DATABASE_URL: { required: true } },
      { env: {}, loadDotEnv: false, onError: "throw", quiet: true },
    ),
  ).toThrow(EnvValidationError);
});
```

---

## Lower-level API

```ts
import { validate } from "env-check";

const result = validate(process.env, {
  PORT: { type: "port", default: "3000" },
});

if (!result.valid) {
  for (const err of result.errors) {
    console.error(err.message);
  }
}

// result.env values are coerced (PORT is a number here)
console.log(result.env.PORT); // 3000
```

---

## `.env` file syntax support

- `KEY=value`
- `KEY="quoted value"` and `KEY='single quoted'`
- Multi-line double-quoted values
- `export KEY=value`
- `# comment` lines and inline ` # comments` on unquoted values
- Escape sequences inside double-quoted values: `\n`, `\r`, `\t`, `\\`, `\"`
- CRLF line endings

---

## License

MIT

> Validates your `.env` file against a schema on app startup — gives clear, human-friendly error messages instead of cryptic runtime crashes.

```
[env-check] Environment validation failed (3 errors)

  ✗ Missing: DATABASE_URL (required for auth)
    ↳ Example: DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
  ✗ Missing: REDIS_URL (required for caching)
  ✗ Invalid: NODE_ENV must be one of [development | production | test], got "prod"

  Fix the above and restart your application.
```

## Install

```bash
npm install env-check
# or
pnpm add env-check
# or
yarn add env-check
```

No runtime dependencies. Works with or without `dotenv`.

---

## Quick start

Call `checkEnv` **once, at the very top of your entry file**, before any other imports that use environment variables.

```ts
// src/index.ts  (or server.ts, app.ts, …)
import { checkEnv } from "env-check";

const env = checkEnv({
  DATABASE_URL: {
    required: true,
    type: "url",
    description: "required for auth",
    example: "postgresql://user:pass@localhost:5432/mydb",
  },
  REDIS_URL: {
    required: true,
    type: "url",
    description: "required for caching",
  },
  PORT: {
    required: false,
    type: "port",
    default: "3000",
  },
  NODE_ENV: {
    required: true,
    enum: ["development", "production", "test"],
  },
  DEBUG: {
    required: false,
    type: "boolean",
    default: "false",
  },
});

// `env` is a type-safe Record<string, string> of validated keys only
console.log(env.DATABASE_URL);
```

`env-check` automatically loads your `.env` file (no `dotenv.config()` needed). Variables already present in `process.env` always take precedence.

---

## Schema reference

### `EnvVarSchema` options

| Option        | Type                                                                        | Default    | Description                                                    |
| ------------- | --------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| `required`    | `boolean`                                                                   | `true`     | Whether the variable must be present                           |
| `default`     | `string`                                                                    | —          | Fallback value when absent (makes the var optional implicitly) |
| `description` | `string`                                                                    | —          | Human-readable purpose shown in error messages                 |
| `example`     | `string`                                                                    | —          | Example value shown below missing-variable errors              |
| `type`        | `'string' \| 'number' \| 'boolean' \| 'url' \| 'email' \| 'port' \| 'json'` | `'string'` | Format / type validation                                       |
| `enum`        | `string[]`                                                                  | —          | Restrict to a fixed set of allowed values                      |
| `pattern`     | `string \| RegExp`                                                          | —          | Regex the value must satisfy                                   |
| `min`         | `number`                                                                    | —          | Minimum value (`number` / `port` types)                        |
| `max`         | `number`                                                                    | —          | Maximum value (`number` / `port` types)                        |

### Type details

| Type      | What it checks                                            |
| --------- | --------------------------------------------------------- |
| `string`  | Any non-empty string (default)                            |
| `number`  | Parseable as a finite number                              |
| `boolean` | `true`, `false`, `1`, `0`, `yes`, `no` (case-insensitive) |
| `url`     | Starts with `http://` or `https://`                       |
| `email`   | Basic `user@domain.tld` format                            |
| `port`    | Integer between 1–65535                                   |
| `json`    | Valid `JSON.parse`-able string                            |

---

## `checkEnv` options

```ts
checkEnv(schema, options?)
```

| Option       | Type                          | Default       | Description                               |
| ------------ | ----------------------------- | ------------- | ----------------------------------------- |
| `path`       | `string`                      | `'.env'`      | Path to the `.env` file                   |
| `loadDotEnv` | `boolean`                     | `true`        | Whether to load and merge the `.env` file |
| `onError`    | `'exit' \| 'throw' \| 'warn'` | `'exit'`      | What to do when validation fails          |
| `exitCode`   | `number`                      | `1`           | Exit code used when `onError === 'exit'`  |
| `env`        | `Record<string, string>`      | `process.env` | Override the env object (useful in tests) |
| `quiet`      | `boolean`                     | `false`       | Suppress the success log line             |

### `onError` behaviours

- **`'exit'`** (default) — prints errors to `stderr` and calls `process.exit(1)`. Ideal for production servers that must not start with bad config.
- **`'throw'`** — throws an `EnvValidationError`. Good for test suites and programmatic use.
- **`'warn'`** — prints errors to `stderr` and continues. Useful during local development.

---

## Using with dotenv

You don't need `dotenv` — `env-check` loads `.env` itself. But if you already use it, just disable the built-in loader:

```ts
import "dotenv/config";
import { checkEnv } from "env-check";

checkEnv(schema, { loadDotEnv: false });
```

---

## Using in tests

Pass a custom `env` object and `onError: 'throw'` to keep tests hermetic:

```ts
import { checkEnv, EnvValidationError } from "env-check";

it("rejects missing DATABASE_URL", () => {
  expect(() =>
    checkEnv(
      { DATABASE_URL: { required: true } },
      { env: {}, loadDotEnv: false, onError: "throw", quiet: true },
    ),
  ).toThrow(EnvValidationError);
});
```

---

## Lower-level API

If you need more control, use the `validate` function directly:

```ts
import { validate } from "env-check";

const result = validate(process.env, {
  PORT: { type: "port", default: "3000" },
});

if (!result.valid) {
  for (const err of result.errors) {
    console.error(err.message);
  }
}

console.log(result.env); // validated key/value record
```

---

## `.env` file syntax support

- `KEY=value`
- `KEY="quoted value"` and `KEY='single quoted'`
- Multi-line double-quoted values
- `export KEY=value`
- `# comment` lines and inline ` # comments` on unquoted values
- Escape sequences inside double-quoted values: `\n`, `\r`, `\t`, `\\`, `\"`
- CRLF line endings

---

## License

MIT
