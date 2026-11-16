// Keeps keys, tokens and presigned URLs out of everything the harness shows, stores or logs.

const PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_\-]{8,}/g, 'sk-ant-[redacted]'],
  [/\bsk-[A-Za-z0-9_\-]{16,}/g, 'sk-[redacted]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=\-]{12,}/gi, '$1 [redacted]'],
  // NAME_KEY=…, NAME_TOKEN: …, "api_key": "…"
  [/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)(["']?\s*[:=]\s*["']?)([^\s"'&,;]{6,})/g, '$1$2[redacted]'],
  [/\b((?:api|access|refresh|auth|secret|client)[_-]?(?:key|token|secret))(["']?\s*[:=]\s*["']?)([^\s"'&,;]{6,})/gi, '$1$2[redacted]'],
  // presigned and signed URLs: drop the whole query string
  [/(https?:\/\/[^\s"'<>]+?)\?[^\s"'<>]*(?:X-Amz-|Signature=|Sig=|sig=|token=|Token=|Expires=|Key-Pair-Id=|se=|sp=)[^\s"'<>]*/g, '$1?[signed-query-redacted]'],
  [/\bfal_[A-Za-z0-9]{16,}/g, 'fal_[redacted]'],
  [/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[a-f0-9]{32,}\b/gi, '[redacted-key]'],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

/** Redacts every string in a JSON-like value and cuts long strings, for tool inputs shown in the UI. */
export function redactDeep(value: unknown, maxString = 2000, depth = 0): unknown {
  if (typeof value === 'string') {
    const r = redact(value);
    return r.length > maxString ? r.slice(0, maxString) + ` … (${r.length - maxString} more characters)` : r;
  }
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactDeep(v, maxString, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = /key|token|secret|password|authorization/i.test(k) && typeof v === 'string' ? '[redacted]' : redactDeep(v, maxString, depth + 1);
  }
  return out;
}
