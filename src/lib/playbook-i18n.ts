import type { Locale } from "@/lib/i18n";

type ObligationCopy = {
  title: string;
  why: string;
  responsible: string;
  evidence: string[];
};

const ROLE_NB: Record<string, string> = {
  Founders: "Stiftere",
  "Managing Director": "Daglig leder",
  Accountant: "Regnskapsfører",
  Board: "Styret",
};

const FRAMEWORK_NB: Record<string, string> = {
  "Corporate Law": "Selskapsrett",
  Accounting: "Regnskap",
  Governance: "Styring",
  "Food Safety": "Mattrygghet",
};

const SOURCE_NB: Record<string, string> = {
  "Companies Act (Aksjeloven)": "Aksjeloven",
  "Brønnøysund Register Centre": "Brønnøysundregistrene",
  "Accounting Act (Regnskapsloven)": "Regnskapsloven",
  "Bookkeeping Act (Bokføringsloven)": "Bokføringsloven",
  "VAT Act (Merverdiavgiftsloven)": "Merverdiavgiftsloven",
  "Working Environment Act (Arbeidsmiljøloven)": "Arbeidsmiljøloven",
  "Food Act (Matloven)": "Matloven",
  "Food Hygiene Regulation (Næringsmiddelhygieneforskriften)": "Næringsmiddelhygieneforskriften",
  "Food Information Regulation (Matinformasjonsforskriften)": "Matinformasjonsforskriften",
};

const OBLIGATION_NB: Record<string, ObligationCopy> = {
  "Articles of Association (Vedtekter)": {
    title: "Vedtekter",
    why: "Påkrevd etter aksjeloven § 2-2. Fastsetter selskapsnavn, formål, aksjekapital og styrestruktur.",
    responsible: "Stiftere",
    evidence: ["Signerte vedtekter (PDF)"],
  },
  "Incorporation Certificate (Stiftelsesdokument)": {
    title: "Stiftelsesdokument",
    why: "Påkrevd etter aksjeloven § 2-1. Dokumenterer at selskapet ble formelt stiftet, av hvem og på hvilken dato.",
    responsible: "Stiftere",
    evidence: ["Signert stiftelsesdokument"],
  },
  "Share Capital Confirmation": {
    title: "Bekreftelse på aksjekapital",
    why: "Aksjeloven § 3-1 krever minimum aksjekapital på 30 000 kroner; innskudd skal gjøres opp etter § 2-12.",
    responsible: "Stiftere",
    evidence: ["Bankbekreftelse på innbetalt kapital"],
  },
  "Brønnøysund Registration (Foretaksregisteret)": {
    title: "Registrering i Enhetsregisteret og Foretaksregisteret",
    why: "Selskapet må registreres i Enhetsregisteret og, for et AS, i Foretaksregisteret innen tre måneder etter stiftelse (aksjeloven § 2-18). Firmaattest eller registerutskrift er gyldig bevis.",
    responsible: "Daglig leder",
    evidence: ["Firmaattest eller registerutskrift"],
  },
  "Managing Director & Board Appointment": {
    title: "Utnevnelse av daglig leder og styre",
    why: "Aksjeloven krever et lovlig oppnevnt styre og daglig leder for et aksjeselskap.",
    responsible: "Stiftere",
    evidence: ["Styresak om ansettelse av daglig leder", "Oversikt over styremedlemmer"],
  },
  "Founders' Agreement": {
    title: "Gründeravtale",
    why: "Anbefalt intern avtale mellom gründerne om roller, vesting, IP og tvisteløsning. Ikke lovpålagt, men beskytter selskapet mot gründerkonflikter.",
    responsible: "Stiftere",
    evidence: ["Signert gründeravtale (PDF)"],
  },
  "Shareholder Agreement": {
    title: "Aksjonæravtale",
    why: "Anbefalt avtale mellom aksjonærer om overføringsbegrensninger, drag/tag-along og styringsrettigheter utover vedtektene.",
    responsible: "Stiftere",
    evidence: ["Signert aksjonæravtale (PDF)"],
  },
  "Non-Disclosure Agreement (NDA) Template": {
    title: "Mal for taushetserklæring (NDA)",
    why: "Anbefalt mal for konfidensialitet med ansatte, oppdragstakere og partnere. Beskytter forretningshemmeligheter og know-how.",
    responsible: "Daglig leder",
    evidence: ["NDA-mal (PDF)"],
  },
  "Founder / Board Decisions Log": {
    title: "Beslutningslogg for stiftere / styre",
    why: "Anbefalt intern logg over vesentlige tidlige beslutninger utover formelle styreprotokoller. Gir sporbarhet.",
    responsible: "Styret",
    evidence: ["Beslutningslogg"],
  },
  "Business Bank Account": {
    title: "Bedriftskonto",
    why: "Egen bedriftskonto kreves for å holde selskapsmidler adskilt fra private midler og oppfylle sporbarhetskravet i bokføringsloven § 6.",
    responsible: "Daglig leder",
    evidence: ["Bekreftelse på bankkonto"],
  },
  "Accounting System Active": {
    title: "Regnskapssystem i bruk",
    why: "Bokføringsloven § 7 krever løpende bokføring fra dag én — transaksjoner skal registreres kronologisk.",
    responsible: "Regnskapsfører",
    evidence: ["Avtale eller faktura for regnskapssystem"],
  },
  "Shareholder Register (Aksjeeierbok)": {
    title: "Aksjeeierbok",
    why: "Aksjeloven § 4-5 krever at selskapet fører aksjeeierbok.",
    responsible: "Daglig leder",
    evidence: ["Aksjeeierbok"],
  },
  "Beneficial Owners Register (Reelle rettighetshavere)": {
    title: "Register over reelle rettighetshavere",
    why: "Nesten alle norske virksomheter (AS og de fleste ENK) må kartlegge og registrere reelle rettighetshavere i Altinn — den som eier eller kontrollerer mer enn 25 %, eller utøver kontroll på annen måte. Send inn skjemaet også hvis ingen oppfyller terskelen.",
    responsible: "Daglig leder",
    evidence: ["Bekreftelse fra registeret over reelle rettighetshavere"],
  },
  "First Board Minutes": {
    title: "Første styreprotokoll",
    why: "Styrets beslutninger skal protokolleres og underskrives av de som deltok (aksjeloven § 6-29).",
    responsible: "Styret",
    evidence: ["Signert styreprotokoll (PDF)"],
  },
  "Equipment Purchase Resolution": {
    title: "Styresak om utstyrskjøp",
    why: "Når stiftere selger privat eid utstyr til selskapet, beskytter en dokumentert styresak og kvitteringer mot tvister og skatterisiko.",
    responsible: "Styret",
    evidence: ["Styresak", "Opprinnelige kvitteringer eller verdsettelse"],
  },
  "Business Insurance": {
    title: "Næringsforsikring",
    why: "De fleste driftsselskaper trenger ansvars- og innboforsikring fra dag én.",
    responsible: "Daglig leder",
    evidence: ["Gjeldende forsikringspolise"],
  },
  "Tax Registrations (MVA if applicable)": {
    title: "Skatteregistreringer (MVA ved behov)",
    why: "MVA-registrering kreves når avgiftspliktig omsetning når 50 000 kroner i en 12-månedersperiode (merverdiavgiftsloven § 2-1).",
    responsible: "Regnskapsfører",
    evidence: ["Registreringsbekreftelse"],
  },
  "HSE Policy (Internkontroll)": {
    title: "Internkontroll (HMS)",
    why: "Selskaper med ansatte må ha et skriftlig internkontrollsystem for helse, miljø og sikkerhet (arbeidsmiljøloven § 3-1).",
    responsible: "Daglig leder",
    evidence: ["Skriftlig HMS-policy"],
  },
  "Annual General Meeting Minutes": {
    title: "Protokoll fra ordinær generalforsamling",
    why: "Aksjeloven § 5-5 krever ordinær generalforsamling innen seks måneder etter regnskapsårets slutt.",
    responsible: "Styret",
    evidence: ["Signert generalforsamlingsprotokoll"],
  },
  "Annual Accounts Submitted": {
    title: "Årsregnskap innsendt",
    why: "Regnskapsloven § 8-2 krever at årsregnskapet sendes inn til Regnskapsregisteret etter fastsetting.",
    responsible: "Regnskapsfører",
    evidence: ["Innsendt årsregnskap"],
  },
  "Mattilsynet Food Business Registration": {
    title: "Registrering av matvirksomhet hos Mattilsynet",
    why: "En matvirksomhet må registreres hos Mattilsynet før produksjon eller salg. Gjennomført via næringsmiddelhygieneforskriften (forordning (EF) nr. 852/2004 art. 6).",
    responsible: "Daglig leder",
    evidence: ["Bekreftelse på registrering hos Mattilsynet"],
  },
  "Production Premises Hygiene": {
    title: "Produksjonslokale (hygiene)",
    why: "Lokalet må være egnet til matproduksjon: planløsning, vann, avfall, skadedyr og rene flater (næringsmiddelhygieneforskriften vedlegg II).",
    responsible: "Daglig leder",
    evidence: ["Lokalbeskrivelse eller plan", "Bilder eller tilsynsnotater"],
  },
  "IK-Mat Procedures (HACCP)": {
    title: "IK-Mat-rutiner (HACCP)",
    why: "Matvirksomheter skal ha HACCP-baserte rutiner for mottak, tilberedning, nedkjøling, oppbevaring og utlevering (forordning (EF) nr. 852/2004 art. 5).",
    responsible: "Daglig leder",
    evidence: ["Skriftlige IK-Mat- / HACCP-rutiner"],
  },
  "Temperature Logging": {
    title: "Temperaturlogging",
    why: "Kjølekjede og steketemperaturer skal styres og logges slik at usikker mat ikke slippes ut.",
    responsible: "Daglig leder",
    evidence: ["Temperaturlogg (kjøl / frys / steking / olje)"],
  },
  "Traceability Records": {
    title: "Sporbarhetslogger",
    why: "Du skal kunne spore råvarer ett steg bakover og ferdige varer ett steg frem (generell næringsmiddellov art. 18).",
    responsible: "Daglig leder",
    evidence: ["Batch- / lot-logg", "Leverandørliste"],
  },
  "Allergen and Labelling Control": {
    title: "Allergener og merking",
    why: "Ferdigpakket mat skal oppgi allergener og oppbevaringsbetingelser (matinformasjonsforskriften, forordning (EU) nr. 1169/2011).",
    responsible: "Daglig leder",
    evidence: ["Etikettmal", "Allergenliste"],
  },
};

const FOOD_SAFETY_TITLES = new Set([
  "Mattilsynet Food Business Registration",
  "Production Premises Hygiene",
  "IK-Mat Procedures (HACCP)",
  "Temperature Logging",
  "Traceability Records",
  "Allergen and Labelling Control",
]);

export function isFoodSafetyObligationTitle(title: string) {
  return FOOD_SAFETY_TITLES.has(title);
}

export function localizeRole(locale: Locale, role: string | null | undefined) {
  if (!role) return role ?? null;
  if (locale !== "nb") return role;
  return ROLE_NB[role] ?? role;
}

export function localizeFrameworkName(locale: Locale, name: string | null | undefined) {
  if (!name) return name ?? null;
  if (locale !== "nb") return name;
  return FRAMEWORK_NB[name] ?? name;
}

export function localizeSourceAuthority(locale: Locale, authority: string | null | undefined) {
  if (!authority) return authority ?? null;
  if (locale !== "nb") return authority;
  return SOURCE_NB[authority] ?? authority;
}

export function localizeObligationTitle(locale: Locale, title: string) {
  if (locale !== "nb") return title;
  return OBLIGATION_NB[title]?.title ?? title;
}

export function localizeObligation<T extends {
  title: string;
  why?: string | null;
  responsible?: string | null;
  evidence_requirements?: string[] | null;
}>(locale: Locale, ob: T): T {
  if (locale !== "nb") {
    return {
      ...ob,
      responsible: ob.responsible ?? null,
    };
  }
  const copy = OBLIGATION_NB[ob.title];
  if (!copy) {
    return {
      ...ob,
      responsible: localizeRole(locale, ob.responsible),
    };
  }
  return {
    ...ob,
    title: copy.title,
    why: copy.why,
    responsible: copy.responsible,
    evidence_requirements: copy.evidence,
  };
}
