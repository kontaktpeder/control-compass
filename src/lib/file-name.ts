/** Display-name helpers. Storage paths stay `{org}/{uuid}-original`; only `evidence.file_name` changes. */

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return ".pdf";
  const ext = name.slice(i).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ".pdf";
}

export function sanitizeFileStem(stem: string): string {
  return stem
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Document";
}

export function sanitizeDisplayName(name: string): string {
  const trimmed = name.trim();
  const ext = fileExtension(trimmed);
  const stem = trimmed.replace(/\.[^.]+$/, "");
  return `${sanitizeFileStem(stem)}${ext}`;
}

/** Brønnøysund-style `20260003015118-006-….pdf` — filename is not a signal. */
export function isOpaqueFileName(name: string): boolean {
  const stem = name.replace(/\.[^.]+$/, "");
  const compact = stem.replace(/[-_\s.]/g, "");
  if (compact.length === 0) return true;
  const digits = (compact.match(/\d/g) ?? []).length;
  return digits / compact.length >= 0.65;
}

export function suggestedDisplayName(
  orgName: string,
  documentType: string | null | undefined,
  originalName: string,
): string {
  const ext = fileExtension(originalName);
  const type = (documentType ?? "").trim() || "Document";
  const org = orgName.trim() || "Document";
  return `${sanitizeFileStem(`${org} — ${type}`)}${ext}`;
}
