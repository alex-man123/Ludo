// Validări comune pentru client și server.

const NAME_RE = /^[\p{L}\p{N} _.-]+$/u;

/** Întoarce un mesaj de eroare sau null dacă numele este valid. */
export function validateName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < 2) return 'Numele trebuie să aibă cel puțin 2 caractere.';
  if (name.length > 16) return 'Numele poate avea cel mult 16 caractere.';
  if (!NAME_RE.test(name)) return 'Folosește doar litere, cifre, spații, „-”, „_” sau „.”.';
  return null;
}

export const cleanName = raw => String(raw ?? '').trim().replace(/\s+/g, ' ');
