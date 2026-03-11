import { describe, it, expect } from "vitest";
import { validate } from "../src/validator";

const env = (obj: Record<string, string>) =>
  obj as Record<string, string | undefined>;

describe("validate — required / optional", () => {
  it("errors on missing required variable", () => {
    const result = validate({}, { DB: { required: true } });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("missing");
    expect(result.errors[0].key).toBe("DB");
  });

  it("defaults required to true", () => {
    const result = validate({}, { DB: {} });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("missing");
  });

  it("passes when optional variable is absent", () => {
    const result = validate({}, { DB: { required: false } });
    expect(result.valid).toBe(true);
  });

  it("uses default when value is absent", () => {
    const result = validate({}, { PORT: { default: "3000" } });
    expect(result.valid).toBe(true);
    expect(result.env.PORT).toBe("3000");
  });

  it("includes description in missing message", () => {
    const result = validate({}, { DB: { description: "required for auth" } });
    expect(result.errors[0].message).toContain("required for auth");
  });

  it("shows example in missing message", () => {
    const result = validate({}, { DB: { example: "postgres://localhost/db" } });
    expect(result.errors[0].message).toContain("postgres://localhost/db");
  });
});

describe("validate — type: number", () => {
  it("accepts a valid number", () => {
    const result = validate(env({ X: "42" }), { X: { type: "number" } });
    expect(result.valid).toBe(true);
  });

  it("rejects a non-number string", () => {
    const result = validate(env({ X: "abc" }), { X: { type: "number" } });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("invalid");
  });

  it("rejects empty string", () => {
    const result = validate(env({ X: "" }), { X: { type: "number" } });
    expect(result.valid).toBe(false);
  });
});

describe("validate — type: boolean", () => {
  for (const val of ["true", "false", "1", "0", "yes", "no", "TRUE", "YES"]) {
    it(`accepts "${val}"`, () => {
      const result = validate(env({ FLAG: val }), {
        FLAG: { type: "boolean" },
      });
      expect(result.valid).toBe(true);
    });
  }

  it("rejects invalid boolean", () => {
    const result = validate(env({ FLAG: "maybe" }), {
      FLAG: { type: "boolean" },
    });
    expect(result.valid).toBe(false);
  });
});

describe("validate — type: url", () => {
  it("accepts http URL", () => {
    const result = validate(env({ URL: "http://example.com" }), {
      URL: { type: "url" },
    });
    expect(result.valid).toBe(true);
  });

  it("accepts https URL", () => {
    const result = validate(env({ URL: "https://example.com/path?q=1" }), {
      URL: { type: "url" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects non-URL string", () => {
    const result = validate(env({ URL: "not-a-url" }), {
      URL: { type: "url" },
    });
    expect(result.valid).toBe(false);
  });
});

describe("validate — type: email", () => {
  it("accepts valid email", () => {
    const result = validate(env({ EMAIL: "user@example.com" }), {
      EMAIL: { type: "email" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects string without @", () => {
    const result = validate(env({ EMAIL: "notanemail" }), {
      EMAIL: { type: "email" },
    });
    expect(result.valid).toBe(false);
  });
});

describe("validate — type: port", () => {
  it("accepts valid port", () => {
    const result = validate(env({ PORT: "8080" }), { PORT: { type: "port" } });
    expect(result.valid).toBe(true);
  });

  it("rejects port 0", () => {
    const result = validate(env({ PORT: "0" }), { PORT: { type: "port" } });
    expect(result.valid).toBe(false);
  });

  it("rejects port 65536", () => {
    const result = validate(env({ PORT: "65536" }), { PORT: { type: "port" } });
    expect(result.valid).toBe(false);
  });

  it("rejects non-integer", () => {
    const result = validate(env({ PORT: "80.5" }), { PORT: { type: "port" } });
    expect(result.valid).toBe(false);
  });
});

describe("validate — type: json", () => {
  it("accepts valid JSON", () => {
    const result = validate(env({ CFG: '{"key":"value"}' }), {
      CFG: { type: "json" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const result = validate(env({ CFG: "{bad json}" }), {
      CFG: { type: "json" },
    });
    expect(result.valid).toBe(false);
  });
});

describe("validate — enum", () => {
  const schema = {
    NODE_ENV: { enum: ["development", "production", "test"] as const },
  };

  it("accepts a value in the enum", () => {
    const result = validate(env({ NODE_ENV: "production" }), schema);
    expect(result.valid).toBe(true);
  });

  it("rejects a value not in the enum", () => {
    const result = validate(env({ NODE_ENV: "staging" }), schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("enum");
    expect(result.errors[0].message).toContain("staging");
    expect(result.errors[0].message).toContain("development");
  });
});

describe("validate — pattern", () => {
  it("accepts value matching regex string", () => {
    const result = validate(env({ CODE: "ABC-123" }), {
      CODE: { pattern: "^[A-Z]+-\\d+$" },
    });
    expect(result.valid).toBe(true);
  });

  it("accepts value matching RegExp object", () => {
    const result = validate(env({ CODE: "ABC-123" }), {
      CODE: { pattern: /^[A-Z]+-\d+$/ },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects value not matching pattern", () => {
    const result = validate(env({ CODE: "abc" }), {
      CODE: { pattern: "^[A-Z]+$" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("pattern");
  });
});

describe("validate — range", () => {
  it("respects min on number type", () => {
    const result = validate(env({ WORKERS: "0" }), {
      WORKERS: { type: "number", min: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("range");
  });

  it("respects max on number type", () => {
    const result = validate(env({ WORKERS: "100" }), {
      WORKERS: { type: "number", max: 10 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("range");
  });

  it("passes when value is within range", () => {
    const result = validate(env({ WORKERS: "5" }), {
      WORKERS: { type: "number", min: 1, max: 10 },
    });
    expect(result.valid).toBe(true);
  });
});

describe("validate — multiple errors", () => {
  it("collects all errors at once", () => {
    const result = validate(env({ FOO: "bad", BAR: "99" }), {
      FOO: { type: "number" }, // invalid
      BAR: { type: "number", max: 50 }, // range
      MISSING: { required: true }, // missing
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });
});

// ─── New features ─────────────────────────────────────────────────────────────

describe("validate — auto-coercion", () => {
  it("coerces type:number to a JS number", () => {
    const result = validate(env({ X: "42" }), { X: { type: "number" } });
    expect(result.valid).toBe(true);
    expect(result.env.X).toBe(42);
    expect(typeof result.env.X).toBe("number");
  });

  it("coerces type:port to a JS number", () => {
    const result = validate(env({ PORT: "8080" }), { PORT: { type: "port" } });
    expect(result.valid).toBe(true);
    expect(result.env.PORT).toBe(8080);
  });

  it("coerces type:boolean 'true' to true", () => {
    const result = validate(env({ FLAG: "true" }), {
      FLAG: { type: "boolean" },
    });
    expect(result.valid).toBe(true);
    expect(result.env.FLAG).toBe(true);
  });

  it("coerces type:boolean '0' to false", () => {
    const result = validate(env({ FLAG: "0" }), { FLAG: { type: "boolean" } });
    expect(result.valid).toBe(true);
    expect(result.env.FLAG).toBe(false);
  });

  it("coerces type:boolean 'yes' to true", () => {
    const result = validate(env({ FLAG: "yes" }), {
      FLAG: { type: "boolean" },
    });
    expect(result.valid).toBe(true);
    expect(result.env.FLAG).toBe(true);
  });

  it("keeps string type as string", () => {
    const result = validate(env({ NAME: "alice" }), {
      NAME: { type: "string" },
    });
    expect(result.env.NAME).toBe("alice");
    expect(typeof result.env.NAME).toBe("string");
  });
});

describe("validate — transform", () => {
  it("applies a custom transform and returns its result", () => {
    const result = validate(env({ PORT: "3000" }), {
      PORT: { transform: (v) => parseInt(v, 10) },
    });
    expect(result.valid).toBe(true);
    expect(result.env.PORT).toBe(3000);
  });

  it("transform wins over auto-coercion for type:number", () => {
    const result = validate(env({ X: "7" }), {
      X: { type: "number", transform: (v) => Number(v) * 2 },
    });
    expect(result.valid).toBe(true);
    expect(result.env.X).toBe(14);
  });

  it("transform can return an object", () => {
    const result = validate(env({ CFG: '{"a":1}' }), {
      CFG: { type: "json", transform: (v) => JSON.parse(v) as unknown },
    });
    expect(result.valid).toBe(true);
    expect(result.env.CFG).toEqual({ a: 1 });
  });

  it("transform runs after type validation passes", () => {
    // transform should NOT run when type validation fails
    let ran = false;
    const result = validate(env({ PORT: "not-a-port" }), {
      PORT: {
        type: "port",
        transform: () => {
          ran = true;
          return 0;
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(ran).toBe(false);
  });
});

describe("validate — custom validate function", () => {
  it("accepts value when validator returns true", () => {
    const result = validate(env({ KEY: "sk_live_abc" }), {
      KEY: { validate: (v) => v.startsWith("sk_") || "must start with sk_" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects value when validator returns an error string", () => {
    const result = validate(env({ KEY: "bad_key" }), {
      KEY: { validate: (v) => v.startsWith("sk_") || "must start with sk_" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("custom");
    expect(result.errors[0].message).toContain("must start with sk_");
  });

  it("runs after type validation — skips if type check already failed", () => {
    let ran = false;
    const result = validate(env({ PORT: "abc" }), {
      PORT: {
        type: "port",
        validate: () => {
          ran = true;
          return true;
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(ran).toBe(false); // type check failed first
  });
});

describe("validate — secret masking", () => {
  it("masks secret value in invalid-type error message", () => {
    const result = validate(env({ TOKEN: "not-a-url" }), {
      TOKEN: { type: "url", secret: true },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("****");
    expect(result.errors[0].message).not.toContain("not-a-url");
  });

  it("masks secret value in enum error message", () => {
    const result = validate(env({ ROLE: "admin" }), {
      ROLE: { enum: ["user", "guest"] as const, secret: true },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("****");
    expect(result.errors[0].message).not.toContain("admin");
  });

  it("masks secret value in range error message", () => {
    const result = validate(env({ PORT: "99999" }), {
      PORT: { type: "port", max: 9999, secret: true },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("****");
    expect(result.errors[0].message).not.toContain("99999");
  });

  it("non-secret value is shown in error message", () => {
    const result = validate(env({ PORT: "abc" }), { PORT: { type: "port" } });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('"abc"');
  });
});
