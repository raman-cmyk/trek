import { describe, expect, it } from "vitest";
import { isPrivateMessagePhotoUrl } from "./message-attachments";

describe("isPrivateMessagePhotoUrl", () => {
  const thread = "00000000-0000-0000-0000-000000000001";
  const photo = "00000000-0000-4000-8000-000000000002.jpg";

  it("recognizes the scoped local attachment route", () => {
    expect(isPrivateMessagePhotoUrl(
      `/api/message-photo?thread_type=booking&thread_id=${thread}&path=booking%2F${thread}%2F${photo}`,
    )).toBe(true);
    expect(isPrivateMessagePhotoUrl(
      `/api/message-photo?thread_type=enquiry&thread_id=${thread}&path=enquiry%2F${thread}%2F${photo}`,
    )).toBe(true);
  });

  it.each([
    "https://evil.example/api/message-photo?thread_type=booking&thread_id=b1&path=x",
    "/api/message-photo?thread_type=booking&thread_id=b1",
    "/api/message-photo?thread_type=other&thread_id=b1&path=x",
    `/api/message-photo?thread_type=booking&thread_id=${thread}&path=conversation%2F${thread}%2F${photo}`,
    `/api/message-photo?thread_type=booking&thread_id=${thread}&path=booking%2F${thread}%2Fphone-9800000000.jpg`,
  ])("rejects an untrusted attachment-looking value", (value) => {
    expect(isPrivateMessagePhotoUrl(value)).toBe(false);
  });
});
