/** Files the library will accept via drop or the file picker. */

export const EVIDENCE_FILE_ACCEPT = "application/pdf,image/*";

export function isAcceptedEvidenceFile(file: File): boolean {
  if (file.type === "application/pdf" || file.type.startsWith("image/")) return true;
  return /\.(pdf|png|jpe?g|gif|webp|tif{1,2}|heic|bmp)$/i.test(file.name);
}

export function filterEvidenceFiles(files: Iterable<File>): { accepted: File[]; skipped: number } {
  const accepted: File[] = [];
  let skipped = 0;
  for (const file of files) {
    if (isAcceptedEvidenceFile(file)) accepted.push(file);
    else skipped += 1;
  }
  return { accepted, skipped };
}
