import { describe, it, expect } from "vitest";
import { groupAccess } from "./groups.server";

const GROUP = { organiser_id: "org", guide_id: "guide" };
const MEMBERS = [
  { user_id: "org", status: "joined" },
  { user_id: "mate", status: "joined" },
  { user_id: "invitee", status: "invited" },
  { user_id: "quitter", status: "declined" },
];

describe("who is in a trip group", () => {
  it("lets the organiser and the people on the roster read and post", () => {
    for (const id of ["org", "mate", "invitee"]) {
      expect(groupAccess(GROUP, MEMBERS, id)).toMatchObject({ canRead: true, canPost: true });
    }
  });

  it("puts the guide in the room without putting them on the roster", () => {
    const access = groupAccess(GROUP, MEMBERS, "guide");
    expect(access).toMatchObject({ isGuide: true, isMember: false, canRead: true, canPost: true });
  });

  it("keeps out somebody who left, and anybody who was never in", () => {
    expect(groupAccess(GROUP, MEMBERS, "quitter").canRead).toBe(false);
    expect(groupAccess(GROUP, MEMBERS, "stranger").canRead).toBe(false);
  });

  it("does not make a guide of a group that has no guide yet", () => {
    const access = groupAccess({ organiser_id: "org", guide_id: null }, MEMBERS, "guide");
    expect(access.isGuide).toBe(false);
    expect(access.canRead).toBe(false);
  });
});
