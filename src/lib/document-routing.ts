import type { DocumentCategory } from "@/lib/library";

/** Playbook obligation → filing metadata + filename keywords. English DB titles. */
export type ObligationRoute = {
  title: string;
  documentType: string;
  purpose: string;
  category: DocumentCategory;
  keywords: string[];
};

export type FilenameMatch = {
  obligationId: string;
  title: string;
  route: ObligationRoute;
  matchedKeywords: string[];
  score: number;
};

/**
 * Distinctive filename stems only. Never use bare "avtale" / "protokoll" /
 * "stiftelse" — those collide across founders' agreements and founding docs.
 */
const ROUTES: ObligationRoute[] = [
  {
    title: "Incorporation Certificate (Stiftelsesdokument)",
    documentType: "Incorporation Certificate",
    purpose: "Ownership",
    category: "contracts",
    keywords: ["stiftelsesdokument", "incorporation certificate", "founding document"],
  },
  {
    title: "Articles of Association (Vedtekter)",
    documentType: "Articles of Association",
    purpose: "Corporate Governance",
    category: "contracts",
    keywords: ["vedtekter", "vedtekt", "articles of association"],
  },
  {
    title: "Share Capital Confirmation",
    documentType: "Share Capital Confirmation",
    purpose: "Ownership",
    category: "finance",
    keywords: [
      "aksjekapital",
      "share capital",
      "kapitalbekreftelse",
      "innbetalt kapital",
      "bekreftelse pa aksjekapital",
    ],
  },
  {
    title: "Brønnøysund Registration (Foretaksregisteret)",
    documentType: "Registration Certificate",
    purpose: "Corporate Governance",
    category: "contracts",
    keywords: [
      "firmaattest",
      "foretaksregister",
      "enhetsregister",
      "registerutskrift",
      "bronnoysund",
      "bronnøysund",
      "brønnøysund",
    ],
  },
  {
    title: "Managing Director & Board Appointment",
    documentType: "Board Appointment",
    purpose: "Corporate Governance",
    category: "contracts",
    keywords: ["daglig leder", "managing director", "styreutnevnelse", "board appointment"],
  },
  {
    title: "Founders' Agreement",
    documentType: "Founders' Agreement",
    purpose: "Corporate Governance",
    category: "contracts",
    keywords: ["grunderavtale", "gründeravtale", "founders agreement", "founders-agreement"],
  },
  {
    title: "Shareholder Agreement",
    documentType: "Shareholder Agreement",
    purpose: "Ownership",
    category: "contracts",
    keywords: [
      "aksjonaeravtale",
      "aksjonaravtale",
      "aksjonæravtale",
      "shareholder agreement",
      "shareholders agreement",
    ],
  },
  {
    title: "Non-Disclosure Agreement (NDA) Template",
    documentType: "NDA",
    purpose: "Privacy",
    category: "contracts",
    keywords: ["nda", "taushetserklaering", "taushetserklæring", "non-disclosure", "nondisclosure"],
  },
  {
    title: "Founder / Board Decisions Log",
    documentType: "Decision Log",
    purpose: "Corporate Governance",
    category: "reference",
    keywords: ["beslutningslogg", "decision log", "beslutningsprotokoll"],
  },
  {
    title: "Business Bank Account",
    documentType: "Bank Account Confirmation",
    purpose: "Accounting",
    category: "finance",
    keywords: ["bedriftskonto", "bankkonto", "bank account", "kontobekreftelse"],
  },
  {
    title: "Accounting System Active",
    documentType: "Accounting System Agreement",
    purpose: "Accounting",
    category: "finance",
    keywords: ["regnskapssystem", "accounting system", "tripletex", "fiken", "poweroffice"],
  },
  {
    title: "Shareholder Register (Aksjeeierbok)",
    documentType: "Shareholder Register",
    purpose: "Ownership",
    category: "contracts",
    keywords: ["aksjeeierbok", "aksjonaerregister", "aksjonærregister", "shareholder register"],
  },
  {
    title: "Beneficial Owners Register (Reelle rettighetshavere)",
    documentType: "Beneficial Owners Registration",
    purpose: "Ownership",
    category: "contracts",
    keywords: [
      "reelle rettighetshavere",
      "rettighetshavere",
      "beneficial owner",
      "beneficial owners",
    ],
  },
  {
    title: "First Board Minutes",
    documentType: "Board Minutes",
    purpose: "Board Governance",
    category: "contracts",
    keywords: ["styreprotokoll", "board minutes", "forste styreprotokoll", "første styreprotokoll"],
  },
  {
    title: "Equipment Purchase Resolution",
    documentType: "Board Resolution",
    purpose: "Board Governance",
    category: "contracts",
    keywords: ["utstyrskjop", "utstyrskjøp", "equipment purchase", "utstyrsavtale"],
  },
  {
    title: "Business Insurance",
    documentType: "Insurance Policy",
    purpose: "Insurance",
    category: "operations",
    keywords: [
      "forsikring",
      "insurance",
      "forsikringspolise",
      "naeringsforsikring",
      "næringsforsikring",
    ],
  },
  {
    title: "Tax Registrations (MVA if applicable)",
    documentType: "VAT Registration",
    purpose: "Accounting",
    category: "finance",
    keywords: ["mva", "merverdiavgift", "vat registration", "skatteregistrering"],
  },
  {
    title: "HSE Policy (Internkontroll)",
    documentType: "HSE Policy",
    purpose: "Employment",
    category: "hr",
    keywords: ["internkontroll", "hms", "hse", "arbeidsmiljo", "arbeidsmiljø"],
  },
  {
    title: "Annual General Meeting Minutes",
    documentType: "AGM Minutes",
    purpose: "Board Governance",
    category: "contracts",
    keywords: ["generalforsamling", "agm", "generalforsamlingsprotokoll"],
  },
  {
    title: "Annual Accounts Submitted",
    documentType: "Annual Accounts",
    purpose: "Accounting",
    category: "finance",
    keywords: ["arsregnskap", "årsregnskap", "annual accounts", "regnskapsregisteret"],
  },
  {
    title: "Mattilsynet Food Business Registration",
    documentType: "Mattilsynet Registration",
    purpose: "Food Safety",
    category: "operations",
    keywords: ["mattilsynet", "matvirksomhet", "food business registration"],
  },
  {
    title: "Production Premises Hygiene",
    documentType: "Premises Hygiene Description",
    purpose: "Food Safety",
    category: "operations",
    keywords: ["produksjonslokale", "premises hygiene", "lokalebeskrivelse"],
  },
  {
    title: "IK-Mat Procedures (HACCP)",
    documentType: "HACCP Procedure",
    purpose: "Food Safety",
    category: "operations",
    keywords: ["ik-mat", "ikmat", "haccp", "hygienerutiner"],
  },
  {
    title: "Temperature Logging",
    documentType: "Temperature Log",
    purpose: "Food Safety",
    category: "operations",
    keywords: [
      "temperaturlogg",
      "temperature log",
      "kjernetemperatur",
      "cold chain",
      "kjolekjede",
      "kjølekjede",
    ],
  },
  {
    title: "Traceability Records",
    documentType: "Traceability Log",
    purpose: "Food Safety",
    category: "operations",
    keywords: ["sporbarhet", "traceability", "batchlogg", "lot number"],
  },
  {
    title: "Allergen and Labelling Control",
    documentType: "Allergen Label",
    purpose: "Food Safety",
    category: "operations",
    keywords: [
      "allergen",
      "merking",
      "labelling",
      "labeling",
      "naeringsdeklarasjon",
      "næringsdeklarasjon",
      "etikettmal",
    ],
  },
];

const byTitle = new Map(ROUTES.map((r) => [r.title, r]));

export function normalizeDocText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ä/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function routeForTitle(title: string): ObligationRoute | null {
  return byTitle.get(title) ?? null;
}

export function fallbackRouteFromTitle(title: string): ObligationRoute {
  const documentType = title.replace(/\s*\([^)]*\)\s*$/, "").trim() || title;
  return {
    title,
    documentType,
    purpose: "Operational Documentation",
    category: "reference",
    keywords: [],
  };
}

export function matchObligationsByFilename(
  fileName: string,
  obligations: Array<{ id: string; title: string }>,
): FilenameMatch[] {
  const hay = ` ${normalizeDocText(fileName)} `;
  const out: FilenameMatch[] = [];
  for (const ob of obligations) {
    const route = routeForTitle(ob.title);
    if (!route) continue;
    const matchedKeywords = route.keywords.filter((k) => {
      const needle = normalizeDocText(k);
      if (!needle) return false;
      // Space-prefixed so "nda" does not hit "agenda"; "vedtekt" still hits "vedtekter".
      return hay.includes(` ${needle} `) || hay.includes(` ${needle}`);
    });
    if (matchedKeywords.length === 0) continue;
    const score = matchedKeywords.reduce(
      (n, k) => n + normalizeDocText(k).replace(/\s/g, "").length,
      0,
    );
    out.push({
      obligationId: ob.id,
      title: ob.title,
      route,
      matchedKeywords,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function routingSummary(args: { hintTitle: string | null; matches: FilenameMatch[] }): {
  summary: string;
  reasoning: string;
} {
  const matchBits = args.matches.map((m) => {
    const keys = m.matchedKeywords.join(", ");
    return keys ? `${m.route.documentType} (${keys})` : m.route.documentType;
  });

  if (args.hintTitle && args.matches.length === 0) {
    const summary = `Filed against ${args.hintTitle} from the upload slot.`;
    return { summary, reasoning: summary };
  }

  if (args.hintTitle) {
    const extra = args.matches.filter((m) => m.title !== args.hintTitle);
    const extraText =
      extra.length > 0
        ? ` Filename also matched: ${extra.map((m) => m.route.documentType).join(", ")}.`
        : "";
    const summary = `Filed against ${args.hintTitle} from the upload slot.${extraText}`;
    const reasoning =
      matchBits.length > 0 ? `${summary} Keyword hits: ${matchBits.join("; ")}.` : summary;
    return { summary, reasoning };
  }

  const summary =
    matchBits.length === 1
      ? `Matched from filename: ${matchBits[0]}.`
      : `Matched from filename: ${matchBits.join("; ")}.`;
  return { summary, reasoning: summary };
}
