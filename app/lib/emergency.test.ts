import { describe, expect, it } from "vitest";
import {
  dialable,
  emergencyLine,
  emergencyPatch,
  hasEmergency,
  parseEmergency,
} from "./emergency";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const good = {
  emergency_contact_name: "Mia Roth",
  emergency_contact_relationship: "Partner or spouse",
  emergency_contact_phone: "+49 170 1234567",
};

describe("parseEmergency", () => {
  it("takes a name and a number", () => {
    const r = parseEmergency(form(good));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Mia Roth");
      expect(r.value.phone).toBe("+49 170 1234567");
      expect(r.value.email).toBeNull();
    }
  });

  it("insists on a name", () => {
    const r = parseEmergency(form({ ...good, emergency_contact_name: "  " }));
    expect(r.ok).toBe(false);
  });

  it("insists on a number", () => {
    const r = parseEmergency(form({ ...good, emergency_contact_phone: "" }));
    expect(r.ok).toBe(false);
  });

  it("rejects a number too short to be one", () => {
    const r = parseEmergency(form({ ...good, emergency_contact_phone: "12 34" }));
    expect(r.ok).toBe(false);
  });

  it("accepts a Nepali local number — a guide's people are in Nepal", () => {
    const r = parseEmergency(form({ ...good, emergency_contact_phone: "9841 234567" }));
    expect(r.ok).toBe(true);
  });

  it("rejects an email that is not one, but lets it be missing", () => {
    expect(parseEmergency(form({ ...good, emergency_contact_email: "nope" })).ok).toBe(false);
    expect(parseEmergency(form({ ...good, emergency_contact_email: "" })).ok).toBe(true);
    expect(parseEmergency(form({ ...good, emergency_contact_email: "m@r.de" })).ok).toBe(true);
  });

  it("keeps relationship optional", () => {
    const r = parseEmergency(form({ ...good, emergency_contact_relationship: "" }));
    expect(r.ok && r.value.relationship).toBeNull();
  });
});

describe("the row", () => {
  it("patches the columns the ops console already writes", () => {
    const r = parseEmergency(form(good));
    if (!r.ok) throw new Error("expected ok");
    expect(emergencyPatch(r.value)).toEqual({
      emergency_contact_name: "Mia Roth",
      emergency_contact_relationship: "Partner or spouse",
      emergency_contact_phone: "+49 170 1234567",
      emergency_contact_email: null,
    });
  });

  it("needs both halves to count as on file", () => {
    expect(hasEmergency({ emergency_contact_name: "Mia" })).toBe(false);
    expect(hasEmergency({ emergency_contact_phone: "+49…" })).toBe(false);
    expect(hasEmergency(null)).toBe(false);
    expect(hasEmergency({ ...good })).toBe(true);
  });

  it("reads as one line, or as nothing at all", () => {
    expect(emergencyLine(good)).toBe("Mia Roth (partner or spouse) — +49 170 1234567");
    expect(emergencyLine({ emergency_contact_name: "Mia" })).toBeNull();
  });
});

describe("dialable", () => {
  it("leaves a tel: link something it can dial", () => {
    expect(dialable("+49 170 123-4567")).toBe("+491701234567");
    expect(dialable("(977) 9841 000 111")).toBe("9779841000111");
  });
});
