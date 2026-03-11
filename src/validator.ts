import {
  EnvSchema,
  EnvVarSchema,
  ValidationError,
  ValidationResult,
} from "./types.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;

/**
 * Validate an env object against a schema.
 * Does NOT read any files — pure logic, easy to unit-test.
 */
export function validate(
  env: Record<string, string | undefined>,
  schema: EnvSchema,
): ValidationResult {
  const errors: ValidationError[] = [];
  const validated: Record<string, unknown> = {};

  for (const [key, varSchema] of Object.entries(schema)) {
    const required = varSchema.required !== false; // default: true
    let value: string | undefined = env[key];

    // ── Apply default ──────────────────────────────────────────────────────
    if (
      (value === undefined || value === "") &&
      varSchema.default !== undefined
    ) {
      value = varSchema.default;
    }

    // ── Missing check ──────────────────────────────────────────────────────
    if (value === undefined || value === "") {
      if (required) {
        errors.push({
          key,
          type: "missing",
          message: buildMissingMessage(key, varSchema),
          schema: varSchema,
        });
      }
      continue;
    }

    // ── Type validation ────────────────────────────────────────────────────
    if (varSchema.type) {
      const typeErr = validateType(key, value, varSchema);
      if (typeErr) {
        errors.push(typeErr);
        continue;
      }
    }

    // ── Enum validation ────────────────────────────────────────────────────
    if (varSchema.enum && !varSchema.enum.includes(value)) {
      errors.push({
        key,
        type: "enum",
        message: buildEnumMessage(key, value, varSchema),
        schema: varSchema,
      });
      continue;
    }

    // ── Pattern validation ─────────────────────────────────────────────────
    if (varSchema.pattern !== undefined) {
      const re =
        varSchema.pattern instanceof RegExp
          ? varSchema.pattern
          : new RegExp(varSchema.pattern);
      if (!re.test(value)) {
        const desc = varSchema.description ? ` (${varSchema.description})` : "";
        errors.push({
          key,
          type: "pattern",
          message: `Invalid: ${key} does not match required pattern${desc}`,
          schema: varSchema,
        });
        continue;
      }
    }

    // ── Range validation (number / port) ───────────────────────────────────
    if (varSchema.type === "number" || varSchema.type === "port") {
      const num = Number(value);
      const desc = varSchema.description ? ` (${varSchema.description})` : "";
      if (varSchema.min !== undefined && num < varSchema.min) {
        errors.push({
          key,
          type: "range",
          message: `Invalid: ${key} must be >= ${varSchema.min}, got ${masked(value, varSchema)}${desc}`,
          schema: varSchema,
        });
        continue;
      }
      if (varSchema.max !== undefined && num > varSchema.max) {
        errors.push({
          key,
          type: "range",
          message: `Invalid: ${key} must be <= ${varSchema.max}, got ${masked(value, varSchema)}${desc}`,
          schema: varSchema,
        });
        continue;
      }
    }

    // ── Custom validate ────────────────────────────────────────────────────
    if (typeof varSchema.validate === "function") {
      const customResult = varSchema.validate(value);
      if (customResult !== true) {
        const desc = varSchema.description ? ` (${varSchema.description})` : "";
        errors.push({
          key,
          type: "custom",
          message: `Invalid: ${key} — ${customResult}${desc}`,
          schema: varSchema,
        });
        continue;
      }
    }

    // ── Transform / auto-coerce ────────────────────────────────────────────
    if (typeof varSchema.transform === "function") {
      validated[key] = varSchema.transform(value);
    } else {
      switch (varSchema.type) {
        case "number":
        case "port":
          validated[key] = Number(value);
          break;
        case "boolean":
          validated[key] = ["true", "1", "yes"].includes(value.toLowerCase());
          break;
        default:
          validated[key] = value;
      }
    }
  }

  return { valid: errors.length === 0, errors, env: validated };
}

// ─── Type validators ──────────────────────────────────────────────────────────

function validateType(
  key: string,
  value: string,
  schema: EnvVarSchema,
): ValidationError | null {
  const desc = schema.description ? ` (${schema.description})` : "";

  switch (schema.type) {
    case "number": {
      if (value.trim() === "" || isNaN(Number(value))) {
        return err(
          key,
          schema,
          `Invalid: ${key} must be a number, got ${masked(value, schema)}${desc}`,
        );
      }
      break;
    }
    case "boolean": {
      const BOOL_VALUES = new Set(["true", "false", "1", "0", "yes", "no"]);
      if (!BOOL_VALUES.has(value.toLowerCase())) {
        return err(
          key,
          schema,
          `Invalid: ${key} must be a boolean (true/false/1/0/yes/no), got ${masked(value, schema)}${desc}`,
        );
      }
      break;
    }
    case "url": {
      if (!URL_RE.test(value)) {
        return err(
          key,
          schema,
          `Invalid: ${key} must be a valid URL (http/https), got ${masked(value, schema)}${desc}`,
        );
      }
      break;
    }
    case "email": {
      if (!EMAIL_RE.test(value)) {
        return err(
          key,
          schema,
          `Invalid: ${key} must be a valid email address, got ${masked(value, schema)}${desc}`,
        );
      }
      break;
    }
    case "port": {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return err(
          key,
          schema,
          `Invalid: ${key} must be a valid port (1–65535), got ${masked(value, schema)}${desc}`,
        );
      }
      break;
    }
    case "json": {
      try {
        JSON.parse(value);
      } catch {
        const display = schema.secret
          ? '"****"'
          : `"${value.length > 50 ? value.slice(0, 50) + "…" : value}"`;
        return err(
          key,
          schema,
          `Invalid: ${key} must be valid JSON, got ${display}${desc}`,
        );
      }
      break;
    }
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a quoted, optionally masked display string for a value */
function masked(value: string, schema: EnvVarSchema): string {
  return schema.secret ? '"****"' : `"${value}"`;
}

function buildMissingMessage(key: string, schema: EnvVarSchema): string {
  let msg = `Missing: ${key}`;
  if (schema.description) msg += ` (${schema.description})`;
  if (schema.example) msg += `\n    ↳ Example: ${key}=${schema.example}`;
  return msg;
}

function buildEnumMessage(
  key: string,
  value: string,
  schema: EnvVarSchema,
): string {
  const allowed = schema.enum!.join(" | ");
  const desc = schema.description ? ` (${schema.description})` : "";
  return `Invalid: ${key} must be one of [${allowed}], got ${masked(value, schema)}${desc}`;
}

function err(
  key: string,
  schema: EnvVarSchema,
  message: string,
): ValidationError {
  return { key, type: "invalid", message, schema };
}
