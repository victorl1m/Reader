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

/** The snapshot is cached per module instance, so each test starts clean. */
async function fresh() {
  vi.resetModules();
  vi.stubGlobal("localStorage", fakeStorage());
  return import("./prefs");
}

describe("integrations", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off until it is turned on", async () => {
    const prefs = await fresh();
    expect(prefs.getIntegrations().hqnow).toBe(false);
    expect(prefs.getServerIntegrations().hqnow).toBe(false);
  });

  it("remembers being turned on, and off again", async () => {
    const prefs = await fresh();
    prefs.setIntegration("hqnow", true);
    expect(prefs.getIntegrations().hqnow).toBe(true);

    prefs.setIntegration("hqnow", false);
    expect(prefs.getIntegrations().hqnow).toBe(false);
  });

  it("survives a reload", async () => {
    const prefs = await fresh();
    prefs.setIntegration("hqnow", true);

    const storage = localStorage;
    vi.resetModules();
    vi.stubGlobal("localStorage", storage);
    const reloaded = await import("./prefs");

    expect(reloaded.getIntegrations().hqnow).toBe(true);
  });

  it("keeps the snapshot stable between changes", async () => {
    const prefs = await fresh();
    const before = prefs.getIntegrations();
    expect(prefs.getIntegrations()).toBe(before);

    prefs.setIntegration("hqnow", true);
    expect(prefs.getIntegrations()).not.toBe(before);
  });

  it("notifies subscribers", async () => {
    const prefs = await fresh();
    const seen = vi.fn();
    const unsubscribe = prefs.subscribeIntegrations(seen);

    prefs.setIntegration("hqnow", true);
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    prefs.setIntegration("hqnow", false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("keeps libraryOnly off until hqnow is on", async () => {
    const prefs = await fresh();
    expect(prefs.getIntegrations().libraryOnly).toBe(false);

    prefs.setIntegration("libraryOnly", true);
    // hqnow is still off, so this never took: nothing would be left to open.
    expect(prefs.getIntegrations().libraryOnly).toBe(false);

    prefs.setIntegration("hqnow", true);
    prefs.setIntegration("libraryOnly", true);
    expect(prefs.getIntegrations().libraryOnly).toBe(true);
  });

  it("drops libraryOnly the moment hqnow turns off", async () => {
    const prefs = await fresh();
    prefs.setIntegration("hqnow", true);
    prefs.setIntegration("libraryOnly", true);

    prefs.setIntegration("hqnow", false);
    expect(prefs.getIntegrations().libraryOnly).toBe(false);
  });

  it("stays off when storage is corrupt or blocked", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    });

    const prefs = await import("./prefs");
    expect(prefs.getIntegrations().hqnow).toBe(false);
    // The switch still applies for this session even if it can't be stored.
    expect(() => prefs.setIntegration("hqnow", true)).not.toThrow();
    expect(prefs.getIntegrations().hqnow).toBe(true);
  });
});
