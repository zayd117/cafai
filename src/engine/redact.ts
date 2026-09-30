// Stage 1 (plan §9, §12): normalize, redact secrets, cap length — before storing and before any model call.
// Redacts keys, tokens, emails and phone numbers (§12). Patterns are conservative: a false positive costs a word, a miss leaks a secret.

export const REDACTED = "[redacted]";

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "private_key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: "bearer", re: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { kind: "url_credentials", re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi },
  { kind: "vendor_key", re: /\b(sk-[A-Za-z0-9_-]{16,}|sk_(live|test)_[A-Za-z0-9]{16,}|rk_(live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{30,})\b/g },
  { kind: "assignment", re: /\b((?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret)\s*[:=]\s*)(["']?)[^\s"',;]{6,}\2/gi },
  { kind: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "phone", re: /(?<![\w.])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?(?![\w.])/g },
  // Long high-entropy runs (mixed letters and digits, 32+ chars) that no pattern above named.
  { kind: "opaque_token", re: /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g },
];

export interface RedactionResult {
  text: string;
  redactions: { kind: string; count: number }[];
  truncated: boolean;
}

export function redact(input: string, maxChars: number): RedactionResult {
  // Normalize: NFC, drop control chars except newline/tab, collapse runs of blank lines.
  let text = input.normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  const counts = new Map<string, number>();
  for (const { kind, re } of PATTERNS) {
    text = text.replace(re, (...m: string[]) => {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      if (kind === "url_credentials") return `${m[1]}${REDACTED}@`;
      if (kind === "assignment") return `${m[1]}${REDACTED}`;
      return REDACTED;
    });
  }

  // Cap after redaction so a secret straddling the cap can never survive partially.
  const truncated = text.length > maxChars;
  if (truncated) text = text.slice(0, maxChars);
  return { text, redactions: [...counts].map(([kind, count]) => ({ kind, count })), truncated };
}

// Injection-like input (plan §9 failure table): treated as data, flagged for review, no effect on ranking.
const INJECTION = [
  /\bignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?)\b/i,
  /\b(system|developer) prompt\b/i,
  /\byou are now\b/i,
  /\bdisregard (the )?(rules|instructions)\b/i,
  /<\/?(system|assistant|user|instructions?)>/i,
  /\brecommend (only )?\S+ (as|to be) (the )?(top|first|best)\b/i,
];
export const looksLikeInjection = (text: string) => INJECTION.some((re) => re.test(text));
