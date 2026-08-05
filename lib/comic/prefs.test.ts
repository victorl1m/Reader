import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The prefs module caches its snapshot, so each test needs a fresh module
 * instance to exercise the read path.
 */
async function freshPrefs(stored?: string | null) {
  vi.resetModules();

  const store = new Map<string, string>();
  if (stored != null) store.set("flowless:prefs", stored);

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });

  return { prefs: await import("./prefs"), store };
}

const DEFAULTS = {
  mode: "page",
  rtl: false,
  spread: false,
  rail: true,
  chrome: true,
  strip: 1,
};

describe("prefs", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defaults when nothing is stored", async () => {
    const { prefs: module } = await freshPrefs(null);
    expect(module.getPrefs()).toEqual(DEFAULTS);
  });

  it("renders defaults on the server", async () => {
    const { prefs: module } = await freshPrefs('{"mode":"scroll"}');
    expect(module.getServerPrefs()).toEqual(DEFAULTS);
  });

  it("restores every stored setting", async () => {
    const { prefs: module } = await freshPrefs(
      '{"mode":"scroll","rtl":true,"spread":true,"rail":false,"chrome":false,"strip":0.8}',
    );
    expect(module.getPrefs()).toEqual({
      mode: "scroll",
      rtl: true,
      spread: true,
      rail: false,
      chrome: false,
      strip: 0.8,
    });
  });

  it("falls back to defaults on corrupt JSON", async () => {
    const { prefs: module } = await freshPrefs("{not json");
    expect(module.getPrefs()).toEqual(DEFAULTS);
  });

  it("rejects an unknown reading mode", async () => {
    const { prefs: module } = await freshPrefs('{"mode":"sideways"}');
    expect(module.getPrefs().mode).toBe("page");
  });

  it("rejects a strip width that isn't on offer", async () => {
    const { prefs: module } = await freshPrefs('{"strip":0.11}');
    expect(module.getPrefs().strip).toBe(1);
  });

  it("rejects non-boolean flags", async () => {
    const { prefs: module } = await freshPrefs('{"rtl":"yes","spread":1,"rail":0}');
    expect(module.getPrefs()).toEqual(DEFAULTS);
  });

  it("cycles strip widths and wraps around", async () => {
    const { prefs: module } = await freshPrefs(null);
    const [widest, ...rest] = module.STRIP_WIDTHS;
    let width: number = widest;
    for (const expected of rest) {
      width = module.nextStripWidth(width);
      expect(width).toBe(expected);
    }
    expect(module.nextStripWidth(width)).toBe(widest);
  });

  it("returns a stable reference until something changes", async () => {
    const { prefs: module } = await freshPrefs(null);
    expect(module.getPrefs()).toBe(module.getPrefs());

    const before = module.getPrefs();
    module.setPrefs({ rtl: true });
    expect(module.getPrefs()).not.toBe(before);
  });

  it("persists and notifies subscribers", async () => {
    const { prefs: module, store } = await freshPrefs(null);
    const seen = vi.fn();
    const unsubscribe = module.subscribePrefs(seen);

    module.setPrefs({ spread: true });

    expect(seen).toHaveBeenCalledTimes(1);
    expect(module.getPrefs().spread).toBe(true);
    expect(JSON.parse(store.get("flowless:prefs")!).spread).toBe(true);

    unsubscribe();
    module.setPrefs({ spread: false });
    expect(seen).toHaveBeenCalledTimes(1);
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
    });

    const prefs = await import("./prefs");
    expect(prefs.getPrefs()).toEqual(DEFAULTS);
    expect(() => prefs.setPrefs({ rtl: true })).not.toThrow();
    expect(prefs.getPrefs().rtl).toBe(true);
  });
});
