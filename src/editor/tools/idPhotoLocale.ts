import { DEFAULT_ID_PHOTO_PRESET_ID } from "./idPhotoPresets";

export interface BrowserIdPhotoPreference {
  presetId: string;
  region: string;
  countryLabel: string;
  source: "time-zone" | "locale";
}

const REGION_PRESETS: Readonly<Record<string, { presetId: string; countryLabel: string }>> = {
  US: { presetId: "us-passport", countryLabel: "United States" },
  CA: { presetId: "canada-passport", countryLabel: "Canada" },
  GB: { presetId: "uk-passport", countryLabel: "United Kingdom" },
  AU: { presetId: "australia-passport", countryLabel: "Australia" },
  NZ: { presetId: "new-zealand-passport", countryLabel: "New Zealand" },
  IN: { presetId: "india-passport-paper", countryLabel: "India" },
  JP: { presetId: "japan-passport", countryLabel: "Japan" },
  CN: { presetId: "china-passport", countryLabel: "China" },
  SG: { presetId: "singapore-passport", countryLabel: "Singapore" },
  RU: { presetId: "russia-passport", countryLabel: "Russia" },
  TR: { presetId: "turkey-passport", countryLabel: "Türkiye" },
  ZA: { presetId: "south-africa-passport", countryLabel: "South Africa" },
  MX: { presetId: "mexico-passport", countryLabel: "Mexico" },
  BR: { presetId: "brazil-passport-5x7", countryLabel: "Brazil" },
};

const EUROPE_COMMON_REGIONS = new Set([
  "AT",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

const TIME_ZONE_REGIONS: Readonly<Record<string, string>> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Europe/London": "GB",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
  "Asia/Tokyo": "JP",
  "Asia/Shanghai": "CN",
  "Asia/Singapore": "SG",
  "Europe/Moscow": "RU",
  "Europe/Istanbul": "TR",
  "Africa/Johannesburg": "ZA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Rome": "IT",
  "Europe/Madrid": "ES",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Vienna": "AT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Zurich": "CH",
};

function preferenceForRegion(
  region: string,
  source: BrowserIdPhotoPreference["source"],
): BrowserIdPhotoPreference | null {
  const normalized = region.toUpperCase();
  const direct = REGION_PRESETS[normalized];
  if (direct) return { ...direct, region: normalized, source };
  if (EUROPE_COMMON_REGIONS.has(normalized)) {
    return {
      presetId: "europe-passport-common",
      region: normalized,
      countryLabel: "Europe",
      source,
    };
  }
  return null;
}

function currentBrowserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

function currentBrowserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * Suggests an issuing-country passport preset without IP lookup,
 * geolocation permission, network traffic, or persistent storage.
 * Time zone is tried first because browser UI language often remains
 * en-US even when the device region is elsewhere; locale is the fallback.
 */
export function detectBrowserIdPhotoPreference({
  languages = currentBrowserLanguages(),
  timeZone = currentBrowserTimeZone(),
}: {
  languages?: readonly string[];
  timeZone?: string;
} = {}): BrowserIdPhotoPreference | null {
  const timeZoneRegion = timeZone ? TIME_ZONE_REGIONS[timeZone] : undefined;
  if (timeZoneRegion) {
    const preference = preferenceForRegion(timeZoneRegion, "time-zone");
    if (preference) return preference;
  }

  for (const language of languages) {
    try {
      const region = new Intl.Locale(language).region;
      if (!region) continue;
      const preference = preferenceForRegion(region, "locale");
      if (preference) return preference;
    } catch {
      // Ignore malformed or browser-extension-supplied locale tags.
    }
  }
  return null;
}

export function preferredIdPhotoPresetId(): string {
  return detectBrowserIdPhotoPreference()?.presetId ?? DEFAULT_ID_PHOTO_PRESET_ID;
}
