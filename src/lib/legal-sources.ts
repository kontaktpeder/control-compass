/** Build a Lovdata URL for a consolidated law paragraph (NL/lov). */
export function lovdataParagraphUrl(lawId: string, paragraph: string): string {
  const para = paragraph.startsWith("§") ? paragraph : `§${paragraph}`;
  return `https://lovdata.no/dokument/NL/lov/${lawId}/${encodeURIComponent(para)}`;
}

export function lovdataLawUrl(lawId: string): string {
  return `https://lovdata.no/dokument/NL/lov/${lawId}`;
}

/** Seeded playbook obligations — legal basis per English DB title. */
export const PLAYBOOK_LEGAL_BASIS: Record<
  string,
  { citation: string; url: string }
> = {
  "Articles of Association (Vedtekter)": {
    citation: "Aksjeloven § 2-2",
    url: lovdataParagraphUrl("1997-06-13-44", "§2-2"),
  },
  "Incorporation Certificate (Stiftelsesdokument)": {
    citation: "Aksjeloven § 2-1",
    url: lovdataParagraphUrl("1997-06-13-44", "§2-1"),
  },
  "Share Capital Confirmation": {
    citation: "Aksjeloven § 2-8",
    url: lovdataParagraphUrl("1997-06-13-44", "§2-8"),
  },
  "Brønnøysund Registration (Foretaksregisteret)": {
    citation: "Aksjeloven § 2-18",
    url: lovdataParagraphUrl("1997-06-13-44", "§2-18"),
  },
  "Managing Director & Board Appointment": {
    citation: "Aksjeloven § 6-1, § 6-2",
    url: lovdataParagraphUrl("1997-06-13-44", "§6-1"),
  },
  "Business Bank Account": {
    citation: "Bokføringsloven § 5",
    url: lovdataParagraphUrl("2004-07-02-73", "§5"),
  },
  "Accounting System Active": {
    citation: "Bokføringsloven § 3",
    url: lovdataParagraphUrl("2004-07-02-73", "§3"),
  },
  "Shareholder Register (Aksjeeierbok)": {
    citation: "Aksjeloven § 4-5",
    url: lovdataParagraphUrl("1997-06-13-44", "§4-5"),
  },
  "First Board Minutes": {
    citation: "Aksjeloven § 6-29",
    url: lovdataParagraphUrl("1997-06-13-44", "§6-29"),
  },
  "Equipment Purchase Resolution": {
    citation: "Aksjeloven § 6-29",
    url: lovdataParagraphUrl("1997-06-13-44", "§6-29"),
  },
  "Tax Registrations (MVA if applicable)": {
    citation: "Merverdiavgiftsloven § 2-1",
    url: lovdataParagraphUrl("2009-06-19-58", "§2-1"),
  },
  "HSE Policy (Internkontroll)": {
    citation: "Arbeidsmiljøloven § 3-1",
    url: lovdataParagraphUrl("2005-06-17-62", "§3-1"),
  },
  "Annual General Meeting Minutes": {
    citation: "Aksjeloven § 5-6",
    url: lovdataParagraphUrl("1997-06-13-44", "§5-6"),
  },
  "Annual Accounts Submitted": {
    citation: "Regnskapsloven § 3-3",
    url: lovdataParagraphUrl("1998-07-17-56", "§3-3"),
  },
};

export function legalBasisForObligation(
  title: string,
  stored?: { legal_citation?: string | null; legal_url?: string | null },
) {
  if (stored?.legal_url) {
    return { citation: stored.legal_citation ?? title, url: stored.legal_url };
  }
  return PLAYBOOK_LEGAL_BASIS[title] ?? null;
}
