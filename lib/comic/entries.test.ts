import { describe, expect, it } from "vitest";
import { compareNatural, isPageEntry, sortPages } from "./entries";

describe("isPageEntry", () => {
  it("accepts the image types comics actually ship", () => {
    for (const name of ["a.jpg", "a.JPEG", "a.png", "a.webp", "a.avif", "a.gif", "a.bmp"]) {
      expect(isPageEntry(name)).toBe(true);
    }
  });

  it("rejects non-images", () => {
    for (const name of ["notes.txt", "cover.pdf", "page.jpg.bak", "archive.zip"]) {
      expect(isPageEntry(name)).toBe(false);
    }
  });

  it("rejects the junk that ships inside real archives", () => {
    expect(isPageEntry("__MACOSX/page1.jpg")).toBe(false);
    expect(isPageEntry("comic/__MACOSX/page1.jpg")).toBe(false);
    expect(isPageEntry("comic/._page1.jpg")).toBe(false);
    expect(isPageEntry(".DS_Store")).toBe(false);
    expect(isPageEntry("Thumbs.db")).toBe(false);
    expect(isPageEntry("ComicInfo.xml")).toBe(false);
  });
});

describe("sortPages", () => {
  it("orders numerically, not lexically", () => {
    // The bug this guards against: page10 sorting directly after page1.
    expect(sortPages(["page10.jpg", "page2.jpg", "page1.jpg"])).toEqual([
      "page1.jpg",
      "page2.jpg",
      "page10.jpg",
    ]);
  });

  it("keeps zero-padded and unpadded numbers together", () => {
    expect(sortPages(["p003.jpg", "p1.jpg", "p02.jpg"])).toEqual([
      "p1.jpg",
      "p02.jpg",
      "p003.jpg",
    ]);
  });

  it("puts lettered variants after the bare number", () => {
    // Real-world case: covers named 000, 000b, 000c before page 001.
    expect(sortPages(["x-000c.jpg", "x-001.jpg", "x-000.jpg", "x-000b.jpg"])).toEqual([
      "x-000.jpg",
      "x-000b.jpg",
      "x-000c.jpg",
      "x-001.jpg",
    ]);
  });

  it("does not interleave chapters", () => {
    expect(
      sortPages([
        "ch2/page1.jpg",
        "ch10/page1.jpg",
        "ch1/page2.jpg",
        "ch1/page10.jpg",
        "ch1/page1.jpg",
      ]),
    ).toEqual([
      "ch1/page1.jpg",
      "ch1/page2.jpg",
      "ch1/page10.jpg",
      "ch2/page1.jpg",
      "ch10/page1.jpg",
    ]);
  });

  it("sorts a directory before a loose file at the same level", () => {
    expect(sortPages(["z.jpg", "a/b.jpg"])).toEqual(["a/b.jpg", "z.jpg"]);
  });

  it("is case-insensitive", () => {
    expect(sortPages(["B.jpg", "a.jpg"])).toEqual(["a.jpg", "B.jpg"]);
  });

  it("does not mutate its input", () => {
    const input = ["b.jpg", "a.jpg"];
    sortPages(input);
    expect(input).toEqual(["b.jpg", "a.jpg"]);
  });

  it("is a total order", () => {
    expect(compareNatural("a.jpg", "a.jpg")).toBe(0);
    expect(Math.sign(compareNatural("a.jpg", "b.jpg"))).toBe(
      -Math.sign(compareNatural("b.jpg", "a.jpg")),
    );
  });

  it("handles very long digit runs without overflowing", () => {
    const big = `p${"9".repeat(30)}.jpg`;
    expect(sortPages([big, "p1.jpg"])).toEqual(["p1.jpg", big]);
  });
});
