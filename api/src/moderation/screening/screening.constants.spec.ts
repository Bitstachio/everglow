import { classifyModerationLabels, screeningNote } from "./screening.constants";

const label = (name: string, parentName = "", confidence = 90) => ({ name, parentName, confidence });

describe("upload screening labels", () => {
  it.each([
    ["Explicit", "", "NUDITY_OR_SEXUAL"],
    ["Exposed Female Genitalia", "Explicit Nudity", "NUDITY_OR_SEXUAL"],
    ["Sexual Activity", "", "NUDITY_OR_SEXUAL"],
    ["Blood & Gore", "Graphic Violence", "VIOLENCE"],
    ["Graphic Violence Or Gore", "Violence", "VIOLENCE"],
    ["Corpses", "Visually Disturbing", "VIOLENCE"],
    ["Nazi Party", "Hate Symbols", "HARASSMENT"],
  ])("files %s (under %j) as %s", (name, parentName, reason) => {
    expect(classifyModerationLabels([label(name, parentName)])).toEqual({
      reason,
      labels: [label(name, parentName)],
    });
  });

  it.each([
    ["Swimwear or Underwear", ""],
    ["Kissing on the Lips", "Non-Explicit Nudity of Intimate parts and Kissing"],
    ["Weapons", "Violence"],
    ["Explosions and Blasts", "Violence"],
    ["Alcoholic Beverages", "Alcohol"],
    ["Middle Finger", "Rude Gestures"],
    ["Smoking", "Drugs & Tobacco"],
  ])("files nothing for %s, which is ordinary at a party", (name, parentName) => {
    expect(classifyModerationLabels([label(name, parentName)])).toBeNull();
  });

  it("lets nudity outrank violence, and keeps only the labels that made the verdict", () => {
    const labels = [
      label("Weapon Violence", "Graphic Violence"),
      label("Explicit Nudity", "Explicit"),
      label("Alcohol"),
    ];

    expect(classifyModerationLabels(labels)).toEqual({
      reason: "NUDITY_OR_SEXUAL",
      labels: [label("Explicit Nudity", "Explicit")],
    });
  });

  it("files nothing when Rekognition found nothing", () => {
    expect(classifyModerationLabels([])).toBeNull();
  });

  it("writes the labels and rounded confidences into the report's note", () => {
    expect(
      screeningNote({
        reason: "VIOLENCE",
        labels: [label("Graphic Violence", "Violence", 91.6), label("Blood & Gore", "Graphic Violence", 88.2)],
      }),
    ).toBe("Upload screening: Graphic Violence (92%), Blood & Gore (88%)");
  });
});
