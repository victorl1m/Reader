import { beforeEach, describe, expect, it, vi } from "vitest";

function fakeStorage() {
  const data: Record<string, string> = {};
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
}

/** The favorites snapshot is cached per module instance, so start clean. */
async function fresh() {
  vi.resetModules();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  return import("./favorites");
}

describe("favorites", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("has nothing favorited on a clean device", async () => {
    const favorites = await fresh();
    expect(favorites.getFavorites()).toEqual([]);
    expect(favorites.getServerFavorites()).toEqual([]);
  });

  it("stars a comic", async () => {
    const favorites = await fresh();
    favorites.setFavorite(
      { id: 5, name: "Batman", publisher: "DC", status: "Em andamento", cover: "https://x/c.jpg" },
      true,
      1000,
    );

    expect(favorites.getFavorites()).toEqual([
      { id: 5, name: "Batman", publisher: "DC", status: "Em andamento", cover: "https://x/c.jpg", at: 1000 },
    ]);
    expect(favorites.isFavorite(favorites.getFavorites(), 5)).toBe(true);
    expect(favorites.isFavorite(favorites.getFavorites(), 6)).toBe(false);
  });

  it("unstars a comic", async () => {
    const favorites = await fresh();
    favorites.setFavorite({ id: 5, name: "Batman" }, true, 1000);
    favorites.setFavorite({ id: 5, name: "Batman" }, false, 2000);

    expect(favorites.getFavorites()).toEqual([]);
  });

  it("lists favorites most recently starred first", async () => {
    const favorites = await fresh();
    favorites.setFavorite({ id: 1, name: "Old" }, true, 1000);
    favorites.setFavorite({ id: 2, name: "Newest" }, true, 5000);
    favorites.setFavorite({ id: 3, name: "Middle" }, true, 3000);

    expect(favorites.getFavorites().map((f) => f.name)).toEqual([
      "Newest",
      "Middle",
      "Old",
    ]);
  });

  it("keeps the snapshot stable until a favorite changes", async () => {
    const favorites = await fresh();
    favorites.setFavorite({ id: 1, name: "A" }, true, 1000);

    const before = favorites.getFavorites();
    expect(favorites.getFavorites()).toBe(before);

    favorites.setFavorite({ id: 2, name: "B" }, true, 2000);
    expect(favorites.getFavorites()).not.toBe(before);
  });

  it("notifies subscribers when favorites change", async () => {
    const favorites = await fresh();
    const seen = vi.fn();
    const unsubscribe = favorites.subscribeFavorites(seen);

    favorites.setFavorite({ id: 1, name: "A" }, true, 1000);
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    favorites.setFavorite({ id: 1, name: "A" }, false, 2000);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("treats a corrupt entry as no favorites", async () => {
    const favorites = await fresh();
    localStorage.setItem("flowless:favorites:v1", "{not json");
    expect(favorites.getFavorites()).toEqual([]);
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
    vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });

    const favorites = await import("./favorites");

    expect(() => favorites.setFavorite({ id: 1, name: "A" }, true, 1000)).not.toThrow();
    expect(favorites.getFavorites()).toEqual([]);
  });
});
