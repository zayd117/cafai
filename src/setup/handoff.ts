// Setup handoff (plan §13, stage 13): the user's own client does the install. Everything shown comes from the
// catalog. Install UX kept from v2 (§14): full, untruncated commands; highlight sudo, pipe-to-shell, deletions and
// encoded blobs; decode Cursor configs before offering the link; list every hostname.
import type { CatalogSnapshot, Distribution, Offering } from "@/catalog/types";

export interface CommandWarning {
  kind: "sudo" | "pipe_to_shell" | "deletion" | "encoded_blob" | "unpinned";
  text: string;
}

export function analyzeCommand(cmd: string): CommandWarning[] {
  const w: CommandWarning[] = [];
  if (/(^|[\s;&|])sudo\s/.test(cmd)) w.push({ kind: "sudo", text: "Runs with administrator rights (sudo)." });
  if (/\|\s*(sh|bash|zsh|fish|python3?|node)\b/.test(cmd)) w.push({ kind: "pipe_to_shell", text: "Pipes downloaded content straight into a shell." });
  if (/(^|[\s;&|])(rm\s+-[a-z]*[rf]|del\s|rmdir\s|Remove-Item)/i.test(cmd)) w.push({ kind: "deletion", text: "Deletes files." });
  if (/[A-Za-z0-9+/_-]{60,}={0,2}/.test(cmd)) w.push({ kind: "encoded_blob", text: "Contains a long encoded value; read it before running." });
  if (/@latest\b/.test(cmd)) w.push({ kind: "unpinned", text: "Installs whatever version is newest (not pinned)." });
  return w;
}

export function hostnames(d: Pick<Distribution, "command" | "link" | "url" | "steps">): string[] {
  const text = [d.command, d.link, d.url, ...(d.steps ?? [])].filter(Boolean).join(" ");
  const hosts = new Set<string>();
  for (const m of text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi)) {
    try {
      const u = new URL(m[0]);
      // A Cursor install link is not a host the user connects to; the hosts are inside its decoded config.
      if (u.protocol === "cursor:") {
        const decoded = decodeCursorDeeplink(m[0]);
        if (decoded && "config" in decoded) for (const h of hostnames({ command: JSON.stringify(decoded.config) })) hosts.add(h);
        continue;
      }
      if (u.hostname) hosts.add(u.hostname);
    } catch {
      // not a URL
    }
  }
  return [...hosts];
}

/** Cursor install links carry base64 JSON in `config` (§13). Returns the decoded config, or null if not such a link. */
export function decodeCursorDeeplink(link: string): { name: string | null; config: unknown } | { error: string } | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== "cursor:" || u.hostname !== "anysphere.cursor-deeplink") return null;
  const raw = u.searchParams.get("config");
  if (!raw) return { error: "The link has no config to show." };
  try {
    // URLSearchParams turns "+" into a space; restore it, and accept the URL-safe alphabet too.
    const json = Buffer.from(raw.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return { name: u.searchParams.get("name"), config: JSON.parse(json) };
  } catch {
    return { error: "The link's config could not be read, so it is not offered." };
  }
}

export interface Handoff {
  offering: Offering;
  distribution: Distribution | null; // null: no route for this client in the catalog
  warnings: CommandWarning[];
  hosts: string[];
  decoded: ReturnType<typeof decodeCursorDeeplink>;
}

/** For one client: the catalog distribution per pick (client-specific first, then client-independent). */
export function handoffsFor(snapshot: CatalogSnapshot, offeringIds: string[], clientId: string): Handoff[] {
  return offeringIds.flatMap((id) => {
    const o = snapshot.offerings.find((x) => x.id === id);
    if (!o) return [];
    const d = o.distributions.find((x) => x.client === clientId) ?? o.distributions.find((x) => x.client === "any") ?? null;
    return [{
      offering: o,
      distribution: d,
      warnings: d?.command ? analyzeCommand(d.command) : [],
      hosts: d ? hostnames(d) : [],
      decoded: d?.link ? decodeCursorDeeplink(d.link) : null,
    }];
  });
}

/** Plain message to paste into the user's AI client (journey D: "a message to paste into Claude Code", §7). */
export function pasteMessage(clientName: string, handoffs: Handoff[]): string {
  const lines = [`Please help me set up these tools in ${clientName}. Ask me before each step, and ask me for anything you need, like a key.`, ""];
  handoffs.forEach((h, i) => {
    const d = h.distribution;
    const name = h.offering.identity.display_name;
    if (!d) {
      lines.push(`${i + 1}. ${name}: no setup route for ${clientName} in our catalog yet.`);
      return;
    }
    const parts = [`${i + 1}. ${name}.`];
    if (d.command) parts.push(`Run: ${d.command}`);
    if (d.url && d.method === "connector") parts.push(`Connector URL: ${d.url}`);
    else if (d.url) parts.push(`Start here: ${d.url}`);
    if (d.link) parts.push("I will open its install link from the Caf.ai setup page after reading what it adds.");
    if (d.steps?.length) parts.push(d.steps.join(" "));
    parts.push(`Official guide: ${d.source_url}`);
    for (const s of h.offering.access.least_privilege_steps ?? []) parts.push(s);
    lines.push(parts.join(" "));
  });
  lines.push("", "Check that each one works, then tell me what changed.");
  return lines.join("\n");
}
