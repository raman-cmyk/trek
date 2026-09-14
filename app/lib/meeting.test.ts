import { describe, it, expect } from "vitest";
import {
  fmtMeetTime,
  meetingGap,
  meetingLine,
  parseMeetTime,
  resolveMeeting,
} from "./meeting";

const fmt = (iso: string) => `D(${iso})`;

describe("the time", () => {
  it("comes back as 24-hour HH:MM whatever Postgres sent", () => {
    expect(fmtMeetTime("18:00:00")).toBe("18:00");
    expect(fmtMeetTime("04:30")).toBe("04:30");
    expect(fmtMeetTime("23:59:00+05:45")).toBe("23:59");
  });
  it("refuses anything that is not a time", () => {
    expect(fmtMeetTime("evening")).toBeNull();
    expect(fmtMeetTime("6pm")).toBeNull();
    expect(fmtMeetTime("25:00")).toBeNull();
    expect(fmtMeetTime(null)).toBeNull();
    expect(parseMeetTime(1800)).toBeNull();
  });
});

describe("where the details come from", () => {
  const offering = { meeting_point: "Thamel", meet_time: "18:00:00" };

  it("the experience, when the guide has said nothing about this trip", () => {
    const m = resolveMeeting({}, offering);
    expect(m).toMatchObject({ place: "Thamel", time: "18:00", from: "experience", settled: true });
  });

  it("the guide, when they set them for this trip", () => {
    const m = resolveMeeting(
      { meeting_point: "My shop, Jyatha", meeting_time: "17:30:00", meeting_note: "No pork." },
      offering,
    );
    expect(m).toMatchObject({
      place: "My shop, Jyatha",
      time: "17:30",
      note: "No pork.",
      from: "guide",
      settled: true,
    });
  });

  it("half from the guide, half from the experience", () => {
    const m = resolveMeeting({ meeting_time: "05:00" }, offering);
    expect(m).toMatchObject({ place: "Thamel", time: "05:00", from: "guide", settled: true });
  });

  it("nothing anywhere is not settled", () => {
    const m = resolveMeeting({}, { meeting_point: null, meet_time: null });
    expect(m).toMatchObject({ place: null, time: null, from: null, settled: false });
    expect(resolveMeeting(null, null).settled).toBe(false);
  });

  it("a place with no time is not an answer", () => {
    const m = resolveMeeting({}, { meeting_point: "Thamel", meet_time: null });
    expect(m).toMatchObject({ place: "Thamel", time: null, from: "experience", settled: false });
  });

  it("blank strings count as nothing", () => {
    expect(resolveMeeting({ meeting_point: "   " }, null).settled).toBe(false);
    expect(resolveMeeting({ meeting_point: "   " }, null).from).toBeNull();
  });
});

describe("the line a trekker reads", () => {
  it("is place, date and time", () => {
    const m = resolveMeeting({}, { meeting_point: "Thamel", meet_time: "18:00" });
    expect(meetingLine(m, "2026-09-23", fmt)).toBe("Thamel · D(2026-09-23) · 18:00");
  });
  it("leaves out what is missing rather than printing TBC", () => {
    const m = resolveMeeting({}, { meeting_point: "Thamel", meet_time: null });
    expect(meetingLine(m, "2026-09-23", fmt)).toBe("Thamel · D(2026-09-23)");
  });
  it("is nothing at all when there is nothing to say and no date", () => {
    expect(meetingLine(resolveMeeting(null, null), null, fmt)).toBeNull();
  });
});

describe("what is still missing", () => {
  it("says nothing once it is settled", () => {
    const m = resolveMeeting({}, { meeting_point: "Thamel", meet_time: "18:00" });
    expect(meetingGap(m, "Pemba")).toBeNull();
  });
  it("names the missing half", () => {
    expect(meetingGap(resolveMeeting({}, { meeting_point: "Thamel" }), "Pemba")).toBe(
      "Pemba still has to set the time.",
    );
    expect(meetingGap(resolveMeeting({}, { meet_time: "18:00" }), "Pemba")).toBe(
      "Pemba still has to set the address.",
    );
  });
  it("asks for both when there is nothing", () => {
    expect(meetingGap(resolveMeeting(null, null), "Pemba")).toBe(
      "Pemba sends the address and the time here.",
    );
  });
});
