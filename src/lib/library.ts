export const DOCUMENT_CATEGORY_IDS = [
  "operations",
  "finance",
  "contracts",
  "hr",
  "reference",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORY_IDS)[number];

export const DOCUMENT_CATEGORIES: { id: DocumentCategory; label: string }[] = [
  { id: "operations", label: "Operations" },
  { id: "finance", label: "Finance" },
  { id: "contracts", label: "Contracts" },
  { id: "hr", label: "HR" },
  { id: "reference", label: "Reference" },
];

export function isDocumentCategory(v: unknown): v is DocumentCategory {
  return typeof v === "string" && (DOCUMENT_CATEGORY_IDS as readonly string[]).includes(v);
}

export function categoryLabel(id: DocumentCategory | null | undefined): string {
  if (!id) return "Uncategorized";
  return DOCUMENT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function isOverdue(due: string | null | undefined, today = new Date().toISOString().slice(0, 10)) {
  return !!due && due < today;
}

/** View-model for the library list. v1 is files only; live models/agreements can share this later. */
export type LibraryKind = "file" | "live_model" | "agreement";

export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  title: string;
  category: DocumentCategory | null;
  aiCategory: DocumentCategory | null;
  aiCategoryConfidence: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
  summary: string | null;
  updatedAt: string;
  reviewDueAt: string | null;
  filePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  documentType: string | null;
  purpose: string | null;
  typeConfidence: number | null;
  documentTypeCandidates: Array<{ label: string; confidence: number }> | null;
  purposeCandidates: Array<{ label: string; confidence: number }> | null;
  obligation: { id: string; title: string } | null;
  assignment: {
    id: string;
    status: "needs_review" | "verified";
    document_type: string | null;
    purpose: string | null;
    ai_document_type: string | null;
    ai_document_type_confidence: number | null;
    ai_purpose: string | null;
    ai_purpose_confidence: number | null;
    ai_summary: string | null;
    ai_reasoning_full: string | null;
  } | null;
};
