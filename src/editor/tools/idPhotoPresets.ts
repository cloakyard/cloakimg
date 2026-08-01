// idPhotoPresets.ts — Fixed physical-size presets for the ID photo
// sheet tool. Dimensions are deliberately kept separate from the UI
// and renderer so adding another issuing authority is a data-only edit.

export type IdPhotoPresetGroup = "Passport & ID" | "Visa" | "General";

export interface IdPhotoPreset {
  id: string;
  group: IdPhotoPresetGroup;
  label: string;
  widthMm: number;
  heightMm: number;
  /** Optional authority-published chin-to-crown range. */
  headHeightMm?: { min: number; max: number };
  sourceUrl?: string;
  sourceLabel?: string;
  note?: string;
  /** Country names and alternate spellings used by the panel filter. */
  searchTerms?: string;
  custom?: boolean;
}

const SCHENGEN_COUNTRIES =
  "Austria Belgium Bulgaria Croatia Czechia Czech Republic Denmark Estonia Finland France Germany Greece Hungary Iceland Italy Latvia Liechtenstein Lithuania Luxembourg Malta Netherlands Norway Poland Portugal Romania Slovakia Slovenia Spain Sweden Switzerland";

const EUROPE_COMMON_COUNTRIES = `${SCHENGEN_COUNTRIES} Ireland Cyprus`;

export const ID_PHOTO_PRESETS: readonly IdPhotoPreset[] = [
  {
    id: "us-passport",
    group: "Passport & ID",
    label: "United States · Passport",
    widthMm: 50.8,
    heightMm: 50.8,
    headHeightMm: { min: 25, max: 35 },
    sourceUrl: "https://travel.state.gov/en/passports/apply/help/photos.html",
    sourceLabel: "U.S. Department of State",
    searchTerms: "USA US America 2x2 inch",
  },
  {
    id: "canada-passport",
    group: "Passport & ID",
    label: "Canada · Passport",
    widthMm: 50,
    heightMm: 70,
    headHeightMm: { min: 31, max: 36 },
    sourceUrl:
      "https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-passports/photos.html",
    sourceLabel: "Government of Canada",
    note: "Canada currently requires photos taken and printed by a commercial photographer. Use this preset to check framing or prepare a studio sheet, not as a guarantee that a home print will be accepted.",
  },
  {
    id: "uk-passport",
    group: "Passport & ID",
    label: "United Kingdom · Passport",
    widthMm: 35,
    heightMm: 45,
    headHeightMm: { min: 29, max: 34 },
    sourceUrl: "https://www.gov.uk/photos-for-passports/photo-requirements",
    sourceLabel: "GOV.UK",
    searchTerms: "UK Britain British England Scotland Wales Northern Ireland",
  },
  {
    id: "europe-passport-common",
    group: "Passport & ID",
    label: "Europe · Passport / ID (common)",
    widthMm: 35,
    heightMm: 45,
    headHeightMm: { min: 26, max: 34 },
    sourceUrl:
      "https://www.government.nl/themes/justice-security-and-defence/identification-documents/requirements-for-photos",
    sourceLabel: "Government of the Netherlands",
    note: "35 × 45 mm is common across Europe, but head position and paper rules remain national. Verify the authority handling your application.",
    searchTerms: EUROPE_COMMON_COUNTRIES,
  },
  {
    id: "australia-passport",
    group: "Passport & ID",
    label: "Australia · Passport (minimum format)",
    widthMm: 35,
    heightMm: 45,
    headHeightMm: { min: 32, max: 36 },
    sourceUrl: "https://www.passports.gov.au/PhotoGuidelines",
    sourceLabel: "Australian Passport Office",
    note: "Australia accepts a size range of 35–40 mm wide by 45–50 mm high. This preset uses the accepted minimum, 35 × 45 mm.",
  },
  {
    id: "new-zealand-passport",
    group: "Passport & ID",
    label: "New Zealand · Passport",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://www.passports.govt.nz/passport-photos/passport-photo-requirements/",
    sourceLabel: "New Zealand Passports",
    searchTerms: "NZ Aotearoa",
  },
  {
    id: "india-passport-paper",
    group: "Passport & ID",
    label: "India · Passport paper photo",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://passportindia.gov.in/psp/apply",
    sourceLabel: "Passport Seva",
    note: "Passport Seva currently calls for a paper photo mainly for applicants under 4 years old; most other applicants are photographed at the centre.",
    searchTerms: "Indian Bharat",
  },
  {
    id: "japan-passport",
    group: "Passport & ID",
    label: "Japan · Passport",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://www.anzen.mofa.go.jp/c_info/passport.html",
    sourceLabel: "Ministry of Foreign Affairs of Japan",
    searchTerms: "Japanese Nippon",
  },
  {
    id: "china-passport",
    group: "Passport & ID",
    label: "China · Passport",
    widthMm: 33,
    heightMm: 48,
    headHeightMm: { min: 28, max: 33 },
    sourceUrl: "https://chicago.china-consulate.gov.cn/lsfw/zj/hzlxz/202605/t20260501_11903971.htm",
    sourceLabel: "Consulate-General of China",
    searchTerms: "Chinese PRC 48x33",
  },
  {
    id: "singapore-passport",
    group: "Passport & ID",
    label: "Singapore · Passport",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://www.ica.gov.sg/docs/default-source/ica/forms/imm_%28e%29_11.pdf",
    sourceLabel: "Immigration & Checkpoints Authority",
  },
  {
    id: "russia-passport",
    group: "Passport & ID",
    label: "Russia · Passport",
    widthMm: 35,
    heightMm: 45,
    headHeightMm: { min: 25, max: 30 },
    sourceUrl:
      "https://www.kdmid.ru/cons/passports/list-of-documents-required-for-registration-of-foreign-passports/",
    sourceLabel: "Russian Consular Department",
    searchTerms: "Russian Federation",
  },
  {
    id: "turkey-passport",
    group: "Passport & ID",
    label: "Türkiye · Passport / ID",
    widthMm: 50,
    heightMm: 60,
    headHeightMm: { min: 32, max: 36 },
    sourceUrl: "https://burgaz-bk.mfa.gov.tr/Mission/ShowInfoNote/308347",
    sourceLabel: "Ministry of Foreign Affairs of Türkiye",
    searchTerms: "Turkey Turkish biometric",
  },
  {
    id: "south-africa-passport",
    group: "Passport & ID",
    label: "South Africa · Passport",
    widthMm: 35,
    heightMm: 45,
    headHeightMm: { min: 29, max: 34 },
    sourceUrl: "https://dirco.gov.za/ottawa/regular-passport/",
    sourceLabel: "South African High Commission",
    searchTerms: "RSA",
  },
  {
    id: "mexico-passport",
    group: "Passport & ID",
    label: "Mexico · Passport",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://consulmex.sre.gob.mx/frankfurt/images/stories/pdf/fotosejemp.pdf",
    sourceLabel: "Secretaría de Relaciones Exteriores",
    searchTerms: "Mexican México",
  },
  {
    id: "brazil-passport-5x7",
    group: "Passport & ID",
    label: "Brazil · Passport 5 × 7 cm",
    widthMm: 50,
    heightMm: 70,
    sourceUrl:
      "https://www.gov.br/mre/pt-br/consulado-montreal/servicos/passaportes/passaporte-para-adultos",
    sourceLabel: "Ministry of Foreign Affairs of Brazil",
    note: "The cited consular guidance accepts either 5 × 7 cm or 5 × 5 cm. Choose the square Brazil preset if your office requests it.",
    searchTerms: "Brazilian Brasil",
  },
  {
    id: "brazil-passport-square",
    group: "Passport & ID",
    label: "Brazil · Passport 5 × 5 cm",
    widthMm: 50,
    heightMm: 50,
    sourceUrl:
      "https://www.gov.br/mre/pt-br/consulado-montreal/servicos/passaportes/passaporte-para-adultos",
    sourceLabel: "Ministry of Foreign Affairs of Brazil",
    note: "The cited consular guidance accepts either 5 × 5 cm or 5 × 7 cm. Confirm which format your processing office wants.",
    searchTerms: "Brazilian Brasil",
  },
  {
    id: "us-visa",
    group: "Visa",
    label: "United States · Visa",
    widthMm: 50.8,
    heightMm: 50.8,
    headHeightMm: { min: 25, max: 35 },
    sourceUrl:
      "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos/frequently-asked-questions.html",
    sourceLabel: "U.S. Department of State",
    searchTerms: "USA US America 2x2 inch",
  },
  {
    id: "schengen-visa",
    group: "Visa",
    label: "Schengen · Visa (29 countries)",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://www.eeas.europa.eu/kenya/travel-study_en",
    sourceLabel: "European External Action Service",
    note: "Local consulates can add capture and paper requirements. Check the destination country’s current visa checklist before printing.",
    searchTerms: SCHENGEN_COUNTRIES,
  },
  {
    id: "india-visa",
    group: "Visa",
    label: "India · Visa",
    widthMm: 51,
    heightMm: 51,
    headHeightMm: { min: 25, max: 35 },
    sourceUrl: "https://www.eoiminsk.gov.in/page/photo-requirements/",
    sourceLabel: "Embassy of India",
    note: "Indian missions commonly require a 51 × 51 mm paper photo, while online applications require a square JPEG. Verify the mission handling your application before printing.",
    searchTerms: "Indian Bharat eVisa e-Visa 2x2 inch",
  },
  {
    id: "china-visa",
    group: "Visa",
    label: "China · Visa",
    widthMm: 33,
    heightMm: 48,
    headHeightMm: { min: 28, max: 33 },
    sourceUrl: "https://in.china-embassy.gov.cn/eng/lsfw/qz/202505/t20250514_11622818.htm",
    sourceLabel: "Embassy of China",
    searchTerms: "Chinese PRC 48x33",
  },
  {
    id: "japan-visa",
    group: "Visa",
    label: "Japan · Visa",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://www.mofa.go.jp/j_info/visit/visa/pdfs/application1_e.pdf",
    sourceLabel: "Ministry of Foreign Affairs of Japan",
    searchTerms: "Japanese",
  },
  {
    id: "malaysia-visa",
    group: "Visa",
    label: "Malaysia · eVisa photo",
    widthMm: 35,
    heightMm: 50,
    sourceUrl: "https://malaysiavisa.imi.gov.my/faq/",
    sourceLabel: "Immigration Department of Malaysia",
    note: "Malaysia’s eVisa process asks for a studio-taken image and may not accept a home-made or selfie photo.",
    searchTerms: "Malaysian eVISA",
  },
  {
    id: "russia-visa",
    group: "Visa",
    label: "Russia · Visa",
    widthMm: 35,
    heightMm: 45,
    sourceUrl: "https://reykjavik.kdmid.ru/en/visas/applying-for-a-visa/",
    sourceLabel: "Russian Consular Department",
    searchTerms: "Russian Federation",
  },
  {
    id: "uae-visa",
    group: "Visa",
    label: "United Arab Emirates · Visa",
    widthMm: 60,
    heightMm: 60,
    sourceUrl: "https://www.mofa.gov.ae/en/missions/lima/services/visas",
    sourceLabel: "UAE Ministry of Foreign Affairs",
    note: "UAE mission instructions vary by application route. This preset follows the cited mission’s 6 × 6 cm requirement; verify your processing mission.",
    searchTerms: "UAE Emirates Dubai Abu Dhabi",
  },
  {
    id: "standard-35x45",
    group: "General",
    label: "International common",
    widthMm: 35,
    heightMm: 45,
    note: "A common physical format only. It does not certify country-specific head position, background, expression, age, or print rules.",
    searchTerms: "passport visa ID licence license common universal",
  },
  {
    id: "custom",
    group: "General",
    label: "Custom size",
    widthMm: 35,
    heightMm: 45,
    note: "Enter the exact physical dimensions supplied by the issuing authority.",
    searchTerms: "other manual any country",
    custom: true,
  },
] as const;

export const DEFAULT_ID_PHOTO_PRESET_ID = "us-passport";

export function findIdPhotoPreset(id: string): IdPhotoPreset {
  return (
    ID_PHOTO_PRESETS.find((preset) => preset.id === id) ??
    ID_PHOTO_PRESETS.find((preset) => preset.id === DEFAULT_ID_PHOTO_PRESET_ID)!
  );
}

export function idPhotoPresetSearchText(preset: IdPhotoPreset): string {
  return `${preset.label} ${preset.group} ${preset.widthMm}x${preset.heightMm} ${preset.searchTerms ?? ""}`.toLocaleLowerCase();
}
