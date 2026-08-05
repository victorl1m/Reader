import { describe, expect, it } from "vitest";
import { detectFormat, mimeForName } from "./types";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("detectFormat", () => {
  it("detects RAR 4", () => {
    expect(detectFormat(bytes(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00))).toBe("rar");
  });

  it("detects RAR 5", () => {
    expect(detectFormat(bytes(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00))).toBe(
      "rar",
    );
  });

  it("detects ZIP, including the empty and spanned variants", () => {
    expect(detectFormat(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("zip");
    expect(detectFormat(bytes(0x50, 0x4b, 0x05, 0x06))).toBe("zip");
    expect(detectFormat(bytes(0x50, 0x4b, 0x07, 0x08))).toBe("zip");
  });

  it("rejects anything else", () => {
    expect(detectFormat(bytes(0x37, 0x7a, 0xbc, 0xaf))).toBeNull(); // 7z
    expect(detectFormat(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // PDF
    expect(detectFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBeNull(); // JPEG
    expect(detectFormat(bytes())).toBeNull();
    expect(detectFormat(bytes(0x50))).toBeNull(); // truncated
  });

  it("ignores the file extension entirely", () => {
    // The whole point: a .cbr that is really a ZIP still reports zip.
    expect(detectFormat(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("zip");
  });
});

describe("mimeForName", () => {
  it("maps known extensions", () => {
    expect(mimeForName("a.jpg")).toBe("image/jpeg");
    expect(mimeForName("a.JPEG")).toBe("image/jpeg");
    expect(mimeForName("a.png")).toBe("image/png");
    expect(mimeForName("a.webp")).toBe("image/webp");
    expect(mimeForName("a.avif")).toBe("image/avif");
  });

  it("falls back to JPEG for anything unrecognised", () => {
    expect(mimeForName("a.xyz")).toBe("image/jpeg");
    expect(mimeForName("noextension")).toBe("image/jpeg");
  });

  it("uses the last dot in the name", () => {
    expect(mimeForName("chapter.1/page.png")).toBe("image/png");
  });
});
