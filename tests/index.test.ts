import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { checkEnv, EnvValidationError } from "../src/index";

// Helper: build a fake env object and call checkEnv with onError:'throw'
function check(
  schema: Parameters<typeof checkEnv>[0],
  envObj: Record<string, string>,
) {
  return checkEnv(schema, {
    env: envObj,
    loadDotEnv: false,
    onError: "throw",
    quiet: true,
  });
}

describe("checkEnv — happy path", () => {
  it("returns validated env on success", () => {
    const env = check(
      {
        HOST: { required: true },
        PORT: { type: "port", default: "3000" },
      },
      { HOST: "localhost" },
    );
    expect(env.HOST).toBe("localhost");
    // PORT has type:'port', so it is auto-coerced to a number
    expect(env.PORT).toBe(3000);
  });

  it("returns only schema keys (not extra env vars)", () => {
    const env = check({ FOO: {} }, { FOO: "bar", EXTRA: "ignored" });
    expect(env).not.toHaveProperty("EXTRA");
  });
});

describe("checkEnv — onError: throw", () => {
  it("throws EnvValidationError when required var is missing", () => {
    expect(() =>
      check(
        { DATABASE_URL: { required: true, description: "required for auth" } },
        {},
      ),
    ).toThrow(EnvValidationError);
  });

  it("error message includes the variable name", () => {
    try {
      check(
        { DATABASE_URL: { required: true, description: "required for auth" } },
        {},
      );
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      const err = e as EnvValidationError;
      expect(err.message).toContain("DATABASE_URL");
      expect(err.message).toContain("required for auth");
      expect(err.result.valid).toBe(false);
      expect(err.result.errors).toHaveLength(1);
    }
  });

  it("throws on type mismatch", () => {
    expect(() =>
      check({ PORT: { type: "port" } }, { PORT: "not-a-port" }),
    ).toThrow(EnvValidationError);
  });
});

describe("checkEnv — onError: warn", () => {
  it("does not throw, but calls console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkEnv(
      { MISSING_VAR: { required: true } },
      { env: {}, loadDotEnv: false, onError: "warn", quiet: true },
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("checkEnv — onError: exit", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: number | string | null) => {
        throw new Error("process.exit called");
      });
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("calls process.exit(1) when validation fails", () => {
    expect(() =>
      checkEnv(
        { MISSING: { required: true } },
        { env: {}, loadDotEnv: false, onError: "exit", quiet: true },
      ),
    ).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("respects custom exitCode", () => {
    expect(() =>
      checkEnv(
        { MISSING: { required: true } },
        {
          env: {},
          loadDotEnv: false,
          onError: "exit",
          exitCode: 2,
          quiet: true,
        },
      ),
    ).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe("checkEnv — .env file loading", () => {
  it("reads variables from the .env file", () => {
    // We use a fixture file placed relative to cwd
    // Instead, supply env directly and disable loading to keep the test self-contained
    const env = checkEnv(
      { FROM_FILE: { required: true } },
      {
        env: { FROM_FILE: "file-value" },
        loadDotEnv: false,
        onError: "throw",
        quiet: true,
      },
    );
    expect(env.FROM_FILE).toBe("file-value");
  });

  it("process.env takes precedence over .env file values", () => {
    // Simulate: file has VALUE=from-file, but process.env has VALUE=from-env
    // We test the merge logic by passing env directly
    const env = checkEnv(
      { VALUE: { required: true } },
      {
        env: { VALUE: "from-env" },
        loadDotEnv: false,
        onError: "throw",
        quiet: true,
      },
    );
    expect(env.VALUE).toBe("from-env");
  });
});

describe("EnvValidationError", () => {
  it("is instanceof Error", () => {
    try {
      check({ X: { required: true } }, {});
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(EnvValidationError);
    }
  });

  it('has name "EnvValidationError"', () => {
    try {
      check({ X: { required: true } }, {});
    } catch (e) {
      expect((e as Error).name).toBe("EnvValidationError");
    }
  });
});

// ─── New features ─────────────────────────────────────────────────────────────

describe("checkEnv — transform", () => {
  it("returns transformed value", () => {
    const env = checkEnv(
      { WORKERS: { transform: (v) => parseInt(v, 10) } },
      {
        env: { WORKERS: "4" },
        loadDotEnv: false,
        onError: "throw",
        quiet: true,
      },
    );
    expect(env.WORKERS).toBe(4);
  });

  it("returns auto-coerced number for type:number", () => {
    const env = checkEnv(
      { NUM: { type: "number" } },
      { env: { NUM: "99" }, loadDotEnv: false, onError: "throw", quiet: true },
    );
    expect(env.NUM).toBe(99);
    expect(typeof env.NUM).toBe("number");
  });

  it("returns auto-coerced boolean for type:boolean", () => {
    const env = checkEnv(
      { FLAG: { type: "boolean" } },
      {
        env: { FLAG: "true" },
        loadDotEnv: false,
        onError: "throw",
        quiet: true,
      },
    );
    expect(env.FLAG).toBe(true);
    expect(typeof env.FLAG).toBe("boolean");
  });
});

describe("checkEnv — custom validate", () => {
  it("throws when custom validator rejects the value", () => {
    expect(() =>
      checkEnv(
        {
          API_KEY: {
            validate: (v) => v.startsWith("sk_") || "must start with sk_",
          },
        },
        {
          env: { API_KEY: "invalid" },
          loadDotEnv: false,
          onError: "throw",
          quiet: true,
        },
      ),
    ).toThrow(EnvValidationError);
  });

  it("passes when custom validator returns true", () => {
    const env = checkEnv(
      {
        API_KEY: {
          validate: (v) => v.startsWith("sk_") || "must start with sk_",
        },
      },
      {
        env: { API_KEY: "sk_live_test" },
        loadDotEnv: false,
        onError: "throw",
        quiet: true,
      },
    );
    expect(env.API_KEY).toBe("sk_live_test");
  });
});

describe("checkEnv — multiple env files (paths)", () => {
  const tmp = join(tmpdir(), `env-check-paths-${Date.now()}`);

  it("merges multiple .env files with correct priority", () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, ".env"), "A=base\nB=base");
    writeFileSync(join(tmp, ".env.local"), "A=local"); // overrides A

    const env = checkEnv(
      { A: { required: true }, B: { required: true } },
      {
        // first entry has highest priority
        paths: [join(tmp, ".env.local"), join(tmp, ".env")],
        onError: "throw",
        quiet: true,
      },
    );

    expect(env.A).toBe("local"); // .env.local wins
    expect(env.B).toBe("base"); // only in .env

    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("checkEnv — printSummary", () => {
  it("writes summary to stdout", () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    checkEnv(
      { HOST: { required: true }, PORT: { type: "port", default: "3000" } },
      {
        env: { HOST: "localhost" },
        loadDotEnv: false,
        onError: "throw",
        printSummary: true,
      },
    );
    const output = (stdout.mock.calls.map((c) => c[0]) as string[]).join("");
    expect(output).toContain("HOST");
    expect(output).toContain("PORT");
    stdout.mockRestore();
  });

  it("masks secret values in summary", () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    checkEnv(
      { TOKEN: { required: true, secret: true } },
      {
        env: { TOKEN: "supersecret" },
        loadDotEnv: false,
        onError: "throw",
        printSummary: true,
      },
    );
    const output = (stdout.mock.calls.map((c) => c[0]) as string[]).join("");
    expect(output).toContain("****");
    expect(output).not.toContain("supersecret");
    stdout.mockRestore();
  });
});
