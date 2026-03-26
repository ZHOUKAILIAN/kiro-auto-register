interface ErrorLike {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
}

function isErrorLike(value: unknown): value is ErrorLike {
  return Boolean(value) && typeof value === 'object';
}

function stringifyCode(code: unknown): string | null {
  if (typeof code === 'string' && code.trim()) {
    return code.trim();
  }

  if (typeof code === 'number' && Number.isFinite(code)) {
    return String(code);
  }

  return null;
}

function collectErrorDetails(
  value: unknown,
  parts: string[],
  seen: Set<unknown>
): void {
  if (value === null || value === undefined || seen.has(value)) {
    return;
  }

  if (typeof value === 'string') {
    const message = value.trim();
    if (message && !parts.includes(message)) {
      parts.push(message);
    }
    return;
  }

  if (!isErrorLike(value)) {
    const text = String(value);
    if (text && !parts.includes(text)) {
      parts.push(text);
    }
    return;
  }

  seen.add(value);

  if (typeof value.message === 'string') {
    const message = value.message.trim();
    if (message && !parts.includes(message)) {
      parts.push(message);
    }
  }

  const code = stringifyCode(value.code);
  if (code) {
    const codeLabel = `code=${code}`;
    if (!parts.includes(codeLabel) && !parts.some((part) => part.includes(code))) {
      parts.push(codeLabel);
    }
  }

  collectErrorDetails(value.cause, parts, seen);
}

export function formatErrorDetails(error: unknown): string {
  const parts: string[] = [];
  collectErrorDetails(error, parts, new Set<unknown>());

  if (parts.length === 0) {
    return String(error);
  }

  return parts.join(' <- ');
}
