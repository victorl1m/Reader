import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stand-in for localStorage that behaves like the real one in the way this
 * module depends on: stored keys are enumerable own properties, so
 * `Object.keys(localStorage)` lists them, while the methods are not.
 */
function fakeStorage() {
  const data: Record<string, string> = {};
  const storage = {} as Record<string, string> & {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };

  Object.defineProperties(storage, {
    getItem: { value: (key: string) => data[key] ?? null },
    setItem: {
      value: (key: string, value: string) => {
        data[key] = value;
        storage[key] = value;
      },
    },
    removeItem: {
      value: (key: string) => {
        delete data[key];
        delete storage[key];
      },
    },
  });

  return storage;
}

/** The latest-spot snapshot is cached per module instance, so start clean. */
async function fresh() {
  vi.resetModules();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  return import("./library");
}

describe("library", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers and recalls a position under the file name", async () => {
    const library = await fresh();
    library.rememberSpot("Dinastia X 001.cbr", 12, 61, 1000);

    expect(library.recallSpot("Dinastia X 001.cbr")).toEqual({
      name: "Dinastia X 001.cbr",
      index: 12,
      total: 61,
      at: 1000,
    });
  });

  it("ignores case and surrounding space in the name", async () => {
    const library = await fresh();
    library.rememberSpot("Dinastia X 001.cbr", 12, 61, 1000);

    expect(library.recallSpot("  dinastia x 001.CBR ")?.index).toBe(12);
    expect(library.spotKey(" A.cbr ")).toBe(library.spotKey("a.cbr"));
  });

  it("does not key on size or timestamp, so a fresh copy still resumes", async () => {
    const library = await fresh();
    // The same book downloaded again: same name, everything else different.
    library.rememberSpot("issue.cbz", 30, 44, 1000);

    expect(library.recallSpot("issue.cbz")?.index).toBe(30);
  });

  it("has no position for a comic never opened", async () => {
    const library = await fresh();
    expect(library.recallSpot("unknown.cbr")).toBeNull();
  });

  it("reports the most recently read comic", async () => {
    const library = await fresh();
    library.rememberSpot("old.cbr", 3, 20, 1000);
    library.rememberSpot("newest.cbr", 8, 30, 5000);
    library.rememberSpot("middle.cbr", 5, 25, 3000);

    expect(library.getLatestSpot()?.name).toBe("newest.cbr");
  });

  it("has nothing to resume on a clean device", async () => {
    const library = await fresh();
    expect(library.getLatestSpot()).toBeNull();
    expect(library.getServerLatestSpot()).toBeNull();
    expect(library.getAllSpots()).toEqual([]);
    expect(library.getServerAllSpots()).toEqual([]);
  });

  it("lists everything read, most recent first", async () => {
    const library = await fresh();
    library.rememberSpot("old.cbr", 3, 20, 1000);
    library.rememberSpot("newest.cbr", 8, 30, 5000);
    library.rememberSpot("middle.cbr", 5, 25, 3000);

    expect(library.getAllSpots().map((spot) => spot.name)).toEqual([
      "newest.cbr",
      "middle.cbr",
      "old.cbr",
    ]);
  });

  it("keeps the list stable until a position changes", async () => {
    const library = await fresh();
    library.rememberSpot("a.cbr", 1, 10, 1000);

    const before = library.getAllSpots();
    expect(library.getAllSpots()).toBe(before);
    // The latest is the first of the same list, not a second snapshot.
    expect(library.getLatestSpot()).toBe(before[0]);

    library.rememberSpot("b.cbr", 1, 10, 2000);
    expect(library.getAllSpots()).not.toBe(before);
    expect(library.getAllSpots()).toHaveLength(2);
  });

  it("keeps an empty list referentially stable too", async () => {
    const library = await fresh();
    expect(library.getAllSpots()).toBe(library.getServerAllSpots());
  });

  it("lists a comic from an integration with the ids needed to fetch it again", async () => {
    const library = await fresh();
    library.rememberSpot("Batman — #1", 2, 25, 1000, {
      kind: "catalogue",
      provider: "hqnow",
      comicId: "5",
      chapterId: "9",
    });

    expect(library.getAllSpots()[0].source).toEqual({
      kind: "catalogue",
      provider: "hqnow",
      comicId: "5",
      chapterId: "9",
    });
    // A local file has none, and never gains one.
    library.rememberSpot("local.cbr", 1, 10, 2000);
    expect(library.recallSpot("local.cbr")?.source).toBeUndefined();
  });

  it("remembers a MangaDex source, whose ids are UUIDs rather than numbers", async () => {
    const library = await fresh();
    library.rememberSpot("Solo Leveling — #1", 0, 40, 1000, {
      kind: "catalogue",
      provider: "mangadex",
      comicId: "ade0306c-f4b6-4890-9edb-1ddf04df2039",
      chapterId: "0e1aa0f0-a064-4152-9313-c9d3a9a1683d",
    });

    expect(library.getAllSpots()[0].source).toEqual({
      kind: "catalogue",
      provider: "mangadex",
      comicId: "ade0306c-f4b6-4890-9edb-1ddf04df2039",
      chapterId: "0e1aa0f0-a064-4152-9313-c9d3a9a1683d",
    });
  });

  it("still reads a position saved under the first naming, so nobody loses their page", async () => {
    const library = await fresh();
    localStorage.setItem(
      library.spotKey("Batman — #1"),
      JSON.stringify({
        name: "Batman — #1",
        index: 2,
        total: 25,
        at: 1000,
        source: { kind: "hqnow", hqId: 5, chapterId: 9 },
      }),
    );

    expect(library.recallSpot("Batman — #1")?.source).toEqual({
      kind: "catalogue",
      provider: "hqnow",
      comicId: "5",
      chapterId: "9",
    });
  });

  it("reads a position saved before MangaDex existed as hq-now, with no provider stored", async () => {
    const library = await fresh();
    localStorage.setItem(
      library.spotKey("Batman — #1"),
      JSON.stringify({
        name: "Batman — #1",
        index: 2,
        total: 25,
        at: 1000,
        source: { kind: "catalogue", comicId: 5, chapterId: 9 },
      }),
    );

    expect(library.recallSpot("Batman — #1")?.source).toEqual({
      kind: "catalogue",
      provider: "hqnow",
      comicId: "5",
      chapterId: "9",
    });
  });

  it("drops a source that couldn't identify a chapter", async () => {
    const library = await fresh();
    localStorage.setItem(
      library.spotKey("odd.cbr"),
      JSON.stringify({
        name: "odd.cbr",
        index: 1,
        total: 10,
        at: 1000,
        source: { kind: "catalogue", comicId: 5 },
      }),
    );

    expect(library.recallSpot("odd.cbr")?.source).toBeUndefined();
  });

  it("keeps the snapshot stable until a position changes", async () => {
    const library = await fresh();
    library.rememberSpot("a.cbr", 1, 10, 1000);

    const before = library.getLatestSpot();
    expect(library.getLatestSpot()).toBe(before);

    library.rememberSpot("a.cbr", 2, 10, 2000);
    expect(library.getLatestSpot()).not.toBe(before);
    expect(library.getLatestSpot()?.index).toBe(2);
  });

  it("notifies subscribers when a position moves", async () => {
    const library = await fresh();
    const seen = vi.fn();
    const unsubscribe = library.subscribeSpots(seen);

    library.rememberSpot("a.cbr", 1, 10, 1000);
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    library.rememberSpot("a.cbr", 2, 10, 2000);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("forgets a single comic", async () => {
    const library = await fresh();
    library.rememberSpot("a.cbr", 1, 10, 1000);
    library.rememberSpot("b.cbr", 2, 10, 2000);

    library.forgetSpot("b.cbr");

    expect(library.recallSpot("b.cbr")).toBeNull();
    expect(library.recallSpot("a.cbr")?.index).toBe(1);
    expect(library.getLatestSpot()?.name).toBe("a.cbr");
  });

  it("keeps only the 100 most recently read", async () => {
    const library = await fresh();
    for (let i = 0; i < 101; i++) {
      library.rememberSpot(`comic-${i}.cbr`, i, 100, 1000 + i);
    }

    expect(library.recallSpot("comic-0.cbr")).toBeNull();
    expect(library.recallSpot("comic-1.cbr")?.index).toBe(1);
    expect(library.recallSpot("comic-100.cbr")?.index).toBe(100);
    expect(Object.keys(localStorage).length).toBe(100);
  });

  it("clears positions left by the old name+size+mtime scheme", async () => {
    const library = await fresh();
    localStorage.setItem(
      "flowless:position:v1:issue.cbr:1234:99",
      JSON.stringify({ index: 4 }),
    );

    library.rememberSpot("issue.cbr", 7, 20, 1000);

    expect(localStorage.getItem("flowless:position:v1:issue.cbr:1234:99")).toBeNull();
  });

  it("treats a corrupt entry as no position", async () => {
    const library = await fresh();
    localStorage.setItem(library.spotKey("broken.cbr"), "{not json");
    expect(library.recallSpot("broken.cbr")).toBeNull();

    localStorage.setItem(
      library.spotKey("odd.cbr"),
      JSON.stringify({ index: "twelve" }),
    );
    expect(library.recallSpot("odd.cbr")).toBeNull();
  });

  it("survives storage that throws", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    const library = await import("./library");

    expect(() => library.rememberSpot("a.cbr", 1, 10, 1000)).not.toThrow();
    expect(library.recallSpot("a.cbr")).toBeNull();
    expect(library.getLatestSpot()).toBeNull();
    expect(() => library.forgetSpot("a.cbr")).not.toThrow();
  });
});
