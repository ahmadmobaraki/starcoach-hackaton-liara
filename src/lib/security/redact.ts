const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1•••"],
  [/(sk-[A-Za-z0-9_-]{8,})/g, "sk-•••"],
  [/(gh[pousr]_[A-Za-z0-9]{8,})/g, "gh•_•••"],
  [
    /((?:password|passwd|secret|token|api[_-]?key|authorization|private[_-]?key)\s*[:=]\s*)[^\s,;'"\n]+/gi,
    "$1•••",
  ],
  [
    /((?:mongodb|postgres|postgresql|mysql|mariadb|redis|amqp):\/\/[^:\s/@]+:)[^@\s]+(@)/gi,
    "$1•••$2",
  ],
  [
    /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g,
    "$1•••$2",
  ],
  [/((?:LIARA_API_KEY|DEEPSEEK_API_KEY|LLM_API_KEY)\s*=\s*)\S+/gi, "$1•••"],
];

export function redactText(value: string): string {
  let result = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function maskEnvVars(
  envs: Array<{ key: string; value?: string; encrypted?: boolean }>,
): Array<{ key: string; maskedValue: string; encrypted: boolean }> {
  return envs.map((env) => ({
    key: env.key,
    maskedValue: env.encrypted || isSensitiveKey(env.key) ? "••••••••" : maskValue(env.value ?? ""),
    encrypted: Boolean(env.encrypted),
  }));
}

export function isSensitiveKey(key: string): boolean {
  return /(secret|password|passwd|token|key|credential|auth|private|dsn|url|connection)/i.test(
    key,
  );
}

export function redactObject<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactObject(item)) as T;
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (
        /^(authorization|api[_-]?key|password|passwd|secret|token|private[_-]?key)$/i.test(
          key,
        )
      ) {
        result[key] = "•••";
      } else {
        result[key] = redactObject(item);
      }
    }
    return result as T;
  }
  return value;
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return redactText(error.message);
  return "خطای ناشناخته";
}
