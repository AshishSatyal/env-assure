import { describe, it, expect } from "vitest";
import { parseEnvString, parseEnvFile } from "../src/parser";
import { join } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";

describe("parseEnvString", () => {
  it("parses simple key=value pairs", () => {
    const result = parseEnvString("FOO=bar\nBAZ=qux");
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores comment lines", () => {
    const result = parseEnvString("# this is a comment\nFOO=bar");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("ignores blank lines", () => {
    const result = parseEnvString("\n\nFOO=bar\n\n");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("strips inline comments from unquoted values", () => {
    const result = parseEnvString("FOO=bar # inline comment");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("handles double-quoted values", () => {
    const result = parseEnvString('FOO="hello world"');
    expect(result).toEqual({ FOO: "hello world" });
  });

  it("handles single-quoted values", () => {
    const result = parseEnvString("FOO='hello world'");
    expect(result).toEqual({ FOO: "hello world" });
  });

  it("handles empty value", () => {
    const result = parseEnvString("FOO=");
    expect(result).toEqual({ FOO: "" });
  });

  it("handles empty quoted value", () => {
    const result = parseEnvString('FOO=""');
    expect(result).toEqual({ FOO: "" });
  });

  it("processes escape sequences in double-quoted values", () => {
    const result = parseEnvString('FOO="line1\\nline2\\ttab"');
    expect(result).toEqual({ FOO: "line1\nline2\ttab" });
  });

  it("does NOT process escape sequences in single-quoted values", () => {
    const result = parseEnvString("FOO='line1\\nline2'");
    expect(result).toEqual({ FOO: "line1\\nline2" });
  });

  it("supports export keyword", () => {
    const result = parseEnvString("export FOO=bar");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("handles multi-line double-quoted values", () => {
    const input = 'KEY="line1\nline2\nline3"';
    const result = parseEnvString(input);
    expect(result).toEqual({ KEY: "line1\nline2\nline3" });
  });

  it("handles values with = in them", () => {
    const result = parseEnvString(
      "DATABASE_URL=postgres://user:pass@host/db?sslmode=require",
    );
    expect(result).toEqual({
      DATABASE_URL: "postgres://user:pass@host/db?sslmode=require",
    });
  });

  it("parses CRLF line endings", () => {
    const result = parseEnvString("FOO=bar\r\nBAZ=qux");
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });
});

describe("parseEnvFile", () => {
  const tmp = join(tmpdir(), `env-check-test-${Date.now()}`);

  it("returns empty object for non-existent file", () => {
    expect(parseEnvFile("/nonexistent/path/.env")).toEqual({});
  });

  it("reads and parses a real file", () => {
    mkdirSync(tmp, { recursive: true });
    const file = join(tmp, ".env");
    writeFileSync(file, "HELLO=world\nNUM=42");
    const result = parseEnvFile(file);
    expect(result).toEqual({ HELLO: "world", NUM: "42" });
    rmSync(tmp, { recursive: true, force: true });
  });
});
