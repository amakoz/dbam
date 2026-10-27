import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Structural text checks, not a YAML parse (the transitive `yaml` package is undeclared); GitHub parses the file on push.
const workflow = readFileSync(new URL("../../.github/workflows/ai-review.yml", import.meta.url), "utf8");
const lines = workflow.split("\n");

/** The indented lines under `key:` at the given indent, up to the next line at the same or lower indent. */
function block(key: string, indent: number): string[] {
  const start = lines.findIndex((l) => l === `${" ".repeat(indent)}${key}:`);
  if (start === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && line.length - line.trimStart().length <= indent) break;
    if (line.trim() !== "") out.push(line.trim());
  }
  return out;
}

describe("ai-review workflow", () => {
  it("denies all permissions at workflow level", () => {
    expect(lines).toContain("permissions: {}");
  });

  it("gives the ai-review job exactly contents: read and pull-requests: write", () => {
    expect(lines).toContain("  ai-review:");
    expect(block("permissions", 4)).toEqual(["contents: read", "pull-requests: write"]);
  });

  it("runs on pull_request, never pull_request_target, for the four event types", () => {
    expect(lines).toContain("  pull_request:");
    expect(workflow).not.toContain("pull_request_target:");
    expect(workflow).toMatch(/types: \[opened, synchronize, reopened, ready_for_review\]/);
    expect(workflow).toMatch(/branches: \[main\]/);
  });

  it("does not persist the checkout credentials", () => {
    expect(workflow).toContain("persist-credentials: false");
  });

  it("never interpolates the PR title or body", () => {
    expect(workflow).not.toMatch(/github\.event\.pull_request\.(title|body)/);
  });

  it("uses the API key secret only as AI_REVIEW_API_KEY", () => {
    expect(workflow.match(/secrets\./g)).toHaveLength(1);
    expect(workflow).toContain("AI_REVIEW_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}");
  });

  it("is not named like a required check", () => {
    expect(workflow).not.toMatch(/^ {2}(ci|smoke):/m);
  });
});
