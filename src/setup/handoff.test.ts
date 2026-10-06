import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import { analyzeCommand, decodeCursorDeeplink, handoffsFor, hostnames, pasteMessage } from "./handoff";

const res = loadCatalog({ root: fileURLToPath(new URL("../../catalog", import.meta.url)), fixtures: true });
if (!res.ok) throw new Error("fixture catalog invalid");
const snapshot = res.snapshot;

describe("setup handoff", () => {
  it("flags sudo, pipe-to-shell, deletions, encoded blobs and unpinned installs", () => {
    const kinds = (c: string) => analyzeCommand(c).map((w) => w.kind);
    expect(kinds("sudo npm i -g thing")).toContain("sudo");
    expect(kinds("curl https://x.example/install.sh | bash")).toContain("pipe_to_shell");
    expect(kinds("rm -rf ~/.config/thing")).toContain("deletion");
    expect(kinds(`echo ${"A".repeat(80)}`)).toContain("encoded_blob");
    expect(kinds("npx some-server@latest")).toContain("unpinned");
    expect(kinds("claude mcp add --transport http sample https://mcp.example.com")).toEqual([]);
  });

  it("decodes a Cursor install link's config before offering it", () => {
    const config = Buffer.from(JSON.stringify({ url: "https://mcp.example.com" })).toString("base64");
    expect(decodeCursorDeeplink(`cursor://anysphere.cursor-deeplink/mcp/install?name=sample&config=${config}`)).toEqual({
      name: "sample",
      config: { url: "https://mcp.example.com" },
    });
    expect(decodeCursorDeeplink("cursor://anysphere.cursor-deeplink/mcp/install?name=x&config=%%%")).toEqual({
      error: "We could not read what this install link would add, so we are not offering it. Follow the official guide instead.",
    });
    expect(decodeCursorDeeplink("https://example.com/install")).toBeNull();
  });

  it("lists every hostname a setup step touches", () => {
    expect(hostnames({ command: "claude mcp add --transport http s https://mcp.example.com/sse", url: "https://docs.example.org/x" }).sort())
      .toEqual(["docs.example.org", "mcp.example.com"]);
  });

  it("picks the client's own route first, then a client-independent one, and says when there is none", () => {
    const h = handoffsFor(snapshot, ["fx-app-database", "fx-nutrition-data", "fx-payments"], "cursor");
    expect(h.map((x) => x.distribution?.client ?? null)).toEqual(["cursor", "any", null]);
    const msg = pasteMessage("Cursor", h);
    expect(msg).toContain("Ask me before each step");
    expect(msg).toContain("Skip this one for now: Caf.ai has no setup steps for Cursor yet.");
    expect(msg).toContain("Use a development project and read-only access.");
  });
});

describe("decodeCursorDeeplink with '+' in base64", () => {
  it("restores '+' that URL parsing turned into a space", () => {
    const cfg = { url: "https://mcp.example.com/?q=>>>" }; // encodes with '+' characters
    const b64 = Buffer.from(JSON.stringify(cfg)).toString("base64");
    expect(b64).toContain("+");
    expect(decodeCursorDeeplink(`cursor://anysphere.cursor-deeplink/mcp/install?name=x&config=${b64}`)).toEqual({ name: "x", config: cfg });
  });
});

describe("hostnames for Cursor links", () => {
  it("lists hosts from the decoded config, not the link's pseudo-host", () => {
    const config = Buffer.from(JSON.stringify({ url: "https://mcp.example.com/sample" })).toString("base64");
    expect(hostnames({ link: `cursor://anysphere.cursor-deeplink/mcp/install?name=s&config=${config}` })).toEqual(["mcp.example.com"]);
  });
});
