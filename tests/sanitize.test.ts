import { describe, it, expect } from "vitest";
import { sanitize } from "../src/sanitize.js";

describe("sanitize", () => {
  it("trims whitespace", () => {
    expect(sanitize("  Stripe newsletter ideas  ")).toBe(
      "Stripe newsletter ideas"
    );
  });

  it("strips trailing newline", () => {
    expect(sanitize("Stripe newsletter ideas\n")).toBe(
      "Stripe newsletter ideas"
    );
  });

  it("removes surrounding double quotes", () => {
    expect(sanitize('"Quoted Label"')).toBe("Quoted Label");
  });

  it("removes surrounding single quotes", () => {
    expect(sanitize("'Quoted Label'")).toBe("Quoted Label");
  });

  it("removes surrounding backticks", () => {
    expect(sanitize("`Backtick Label`")).toBe("Backtick Label");
  });

  it("replaces tabs with spaces", () => {
    expect(sanitize("Line1\tLine2")).toBe("Line1 Line2");
  });

  it("collapses multiple spaces to single", () => {
    expect(sanitize("Too   many    spaces")).toBe("Too many spaces");
  });

  it("removes trailing period", () => {
    expect(sanitize("Label.")).toBe("Label");
  });

  it("removes trailing comma", () => {
    expect(sanitize("Label,")).toBe("Label");
  });

  it("removes trailing semicolon", () => {
    expect(sanitize("Label;")).toBe("Label");
  });

  it("removes trailing colon", () => {
    expect(sanitize("Label:")).toBe("Label");
  });

  it("removes trailing exclamation mark", () => {
    expect(sanitize("Label!")).toBe("Label");
  });

  it("removes trailing question mark", () => {
    expect(sanitize("Label?")).toBe("Label");
  });

  it("removes leading bullet marker '- '", () => {
    expect(sanitize("- Listed Item")).toBe("Listed Item");
  });

  it("removes leading bullet marker '* '", () => {
    expect(sanitize("* Starred Item")).toBe("Starred Item");
  });

  it("removes leading bullet marker '• '", () => {
    expect(sanitize("• Woo config")).toBe("Woo config");
  });

  it("handles combined issues: bullet + quotes + trailing punct + extra space", () => {
    expect(sanitize('• "My  Label."  ')).toBe("My Label");
  });

  it("returns empty string for empty input", () => {
    expect(sanitize("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitize("   \n\t  ")).toBe("");
  });

  it("handles label that is only punctuation", () => {
    expect(sanitize("...")).toBe("..");
  });

  it("does not strip internal punctuation", () => {
    expect(sanitize("Node.js API Setup")).toBe("Node.js API Setup");
  });

  it("handles markdown bold markers", () => {
    expect(sanitize("**Bold Label**")).toBe("Bold Label");
  });

  it("takes only the first line if multiple lines are present", () => {
    expect(sanitize("First Label\nSecond Label")).toBe("First Label");
  });
});
