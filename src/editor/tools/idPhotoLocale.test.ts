import { describe, expect, it } from "vitest";
import { findIdPhotoPreset } from "./idPhotoPresets";
import { detectBrowserIdPhotoPreference } from "./idPhotoLocale";

describe("browser ID photo preference", () => {
  it("uses the browser time zone ahead of a generic UI locale", () => {
    expect(
      detectBrowserIdPhotoPreference({ languages: ["en-US"], timeZone: "Asia/Kolkata" }),
    ).toMatchObject({
      presetId: "india-passport-paper",
      region: "IN",
      countryLabel: "India",
      source: "time-zone",
    });
  });

  it("falls back to an explicit locale region", () => {
    expect(
      detectBrowserIdPhotoPreference({ languages: ["en-GB"], timeZone: "Etc/Unknown" }),
    ).toMatchObject({ presetId: "uk-passport", region: "GB", source: "locale" });
  });

  it("maps supported European regions to the common passport format", () => {
    expect(
      detectBrowserIdPhotoPreference({ languages: ["fr-FR"], timeZone: "Etc/Unknown" }),
    ).toMatchObject({ presetId: "europe-passport-common", region: "FR" });
  });

  it("returns no suggestion for unsupported or malformed browser settings", () => {
    expect(
      detectBrowserIdPhotoPreference({ languages: ["not_a_locale"], timeZone: "Etc/Unknown" }),
    ).toBeNull();
  });

  it("ships an authority-linked India visa print preset", () => {
    expect(findIdPhotoPreset("india-visa")).toMatchObject({
      group: "Visa",
      label: "India · Visa",
      widthMm: 51,
      heightMm: 51,
      headHeightMm: { min: 25, max: 35 },
      sourceLabel: "Embassy of India",
    });
  });
});
