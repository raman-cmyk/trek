import { describe, expect, it } from "vitest";
import {
  coordsFromUrl,
  formatCoords,
  googleMapsUrl,
  isLocationOnly,
  locationLine,
  osmUrl,
  splitLocations,
} from "./message-location";

// Namche Bazaar, near enough.
const LAT = 27.8069;
const LNG = 86.7140;

describe("coordsFromUrl", () => {
  it("reads a Google Maps link, which is what a guide's phone actually shares", () => {
    expect(coordsFromUrl("https://www.google.com/maps/@27.8069,86.714,15z")).toEqual({
      lat: 27.8069,
      lng: 86.714,
    });
    expect(
      coordsFromUrl("https://www.google.com/maps/place/Namche+Bazaar/@27.8069,86.714,17z/data=!3m1"),
    ).toEqual({ lat: 27.8069, lng: 86.714 });
  });

  it("reads a Google query link", () => {
    expect(coordsFromUrl("https://maps.google.com/?q=27.8069,86.714")).toEqual({
      lat: 27.8069,
      lng: 86.714,
    });
  });

  it("reads an Apple Maps link", () => {
    expect(coordsFromUrl("https://maps.apple.com/?ll=27.8069,86.714&q=Namche")).toEqual({
      lat: 27.8069,
      lng: 86.714,
    });
  });

  it("reads a geo: link, which is the actual standard", () => {
    expect(coordsFromUrl("geo:27.8069,86.714")).toEqual({ lat: 27.8069, lng: 86.714 });
  });

  it("reads our own OpenStreetMap form, both halves of it", () => {
    expect(coordsFromUrl(osmUrl(LAT, LNG))).toEqual({ lat: LAT, lng: LNG });
    expect(coordsFromUrl("https://www.openstreetmap.org/#map=15/27.8069/86.714")).toEqual({
      lat: 27.8069,
      lng: 86.714,
    });
  });

  it("reads a percent-encoded comma, which is what a share sheet writes", () => {
    expect(coordsFromUrl("https://maps.google.com/?q=27.8069%2C86.714")).toEqual({
      lat: 27.8069,
      lng: 86.714,
    });
  });

  it("gives up on a short link rather than guessing", () => {
    // It only resolves by following a redirect, which a message thread is not
    // going to make. It stays an ordinary link, which is dull but never wrong.
    expect(coordsFromUrl("https://maps.app.goo.gl/abc123")).toBeNull();
  });

  it("refuses coordinates that are not on earth", () => {
    expect(coordsFromUrl("geo:200,500")).toBeNull();
    expect(coordsFromUrl("https://maps.google.com/?q=91,0")).toBeNull();
  });

  it("refuses Null Island, which is a parsing failure and not a place", () => {
    expect(coordsFromUrl("geo:0,0")).toBeNull();
  });

  it("is null for a link that is not a map at all", () => {
    expect(coordsFromUrl("https://trek.example.com/trips/abc")).toBeNull();
  });
});

describe("locationLine", () => {
  it("writes a line that still reads as a sentence with no rendering at all", () => {
    const line = locationLine({ lat: LAT, lng: LNG, label: "The bridge below Jagat" });
    expect(line).toContain("The bridge below Jagat — ");
    expect(line).toContain("openstreetmap.org");
  });

  it("carries the altitude, which is worth knowing on a mountain", () => {
    const line = locationLine({ lat: LAT, lng: LNG, label: "Here", altitudeM: 4380 });
    expect(line).toContain("4,380 m");
  });

  it("is just the link when there is nothing to say about it", () => {
    expect(locationLine({ lat: LAT, lng: LNG })).toBe(osmUrl(LAT, LNG));
  });

  it("round-trips through the parser", () => {
    const body = locationLine({ lat: LAT, lng: LNG, label: "Lobuche", altitudeM: 4940 });
    const { locations, text } = splitLocations(body);
    expect(text).toBe("");
    expect(locations[0]).toMatchObject({ lat: LAT, lng: LNG, label: "Lobuche", altitudeM: 4940 });
  });
});

describe("splitLocations", () => {
  it("lifts the pin out and leaves the words", () => {
    const { text, locations } = splitLocations(
      `I'm here, come down the steps.\n${osmUrl(LAT, LNG)}`,
    );
    expect(text).toBe("I'm here, come down the steps.");
    expect(locations).toHaveLength(1);
  });

  it("takes the label from the words beside the link", () => {
    const { locations } = splitLocations(
      `Meet me at the blue gate — https://maps.google.com/?q=${LAT},${LNG}`,
    );
    expect(locations[0].label).toBe("Meet me at the blue gate");
  });

  it("leaves a link it cannot read exactly where it was", () => {
    const body = "Here: https://maps.app.goo.gl/abc123";
    const { text, locations } = splitLocations(body);
    expect(locations).toHaveLength(0);
    expect(text).toBe(body);
  });

  it("does not draw the same pin twice for one double-send", () => {
    const { locations } = splitLocations(`${osmUrl(LAT, LNG)}\n${osmUrl(LAT, LNG)}`);
    expect(locations).toHaveLength(1);
  });

  it("keeps two different places", () => {
    const { locations } = splitLocations(`${osmUrl(LAT, LNG)}\n${osmUrl(27.9881, 86.925)}`);
    expect(locations).toHaveLength(2);
  });

  it("leaves an ordinary message completely alone", () => {
    const body = "See you at six. Bring a head torch.";
    expect(splitLocations(body)).toEqual({ text: body, locations: [] });
  });

  it("survives an empty body", () => {
    expect(splitLocations("")).toEqual({ text: "", locations: [] });
  });

  it("does not read a room number as an altitude", () => {
    const { locations } = splitLocations(`Room 214 — ${osmUrl(LAT, LNG)}`);
    expect(locations[0].altitudeM).toBeNull();
  });
});

describe("isLocationOnly", () => {
  it("is true when nothing is left outside the pin", () => {
    expect(isLocationOnly(osmUrl(LAT, LNG))).toBe(true);
    // Words beside the link are the pin's label and are drawn on the card, so
    // this is still a message that is only a place.
    expect(isLocationOnly(`Here — ${osmUrl(LAT, LNG)}`)).toBe(true);
  });

  it("is false once there is something to read as well", () => {
    expect(isLocationOnly(`Come down the steps.\n${osmUrl(LAT, LNG)}`)).toBe(false);
    expect(isLocationOnly("No pin here")).toBe(false);
  });
});

describe("formatting for a reader", () => {
  it("writes coordinates the way a person reads them", () => {
    expect(formatCoords(LAT, LNG)).toBe("27.8069° N, 86.7140° E");
    expect(formatCoords(-33.86, -151.2)).toBe("33.8600° S, 151.2000° W");
  });

  it("offers a Google link for somebody who does not use OpenStreetMap", () => {
    expect(googleMapsUrl(LAT, LNG)).toContain(`${LAT},${LNG}`);
  });
});
