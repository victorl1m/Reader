import { afterEach, describe, expect, it, vi } from "vitest";

const DAY = 24 * 60 * 60 * 1000;

/** Fresh module instance with a stubbed browser environment. */
async function load({
  stored,
  ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  maxTouchPoints = 0,
  displayMode = "browser",
  iosStandalone,
}: {
  stored?: string | null;
  ua?: string;
  maxTouchPoints?: number;
  displayMode?: string;
  iosStandalone?: boolean;
} = {}) {
  vi.resetModules();

  const store = new Map<string, string>();
  if (stored != null) store.set("flowless:install-dismissed:v1", stored);

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });

  const navigatorStub = { userAgent: ua, maxTouchPoints, standalone: iosStandalone };
  vi.stubGlobal("navigator", navigatorStub);
  vi.stubGlobal("window", {
    navigator: navigatorStub,
    matchMedia: (query: string) => ({
      matches: query.includes(`display-mode: ${displayMode}`),
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  });

  return { install: await import("./install"), store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isDismissed", () => {
  it("is false when nothing is stored", async () => {
    const { install: module } = await load({ stored: null });
    expect(module.isDismissed()).toBe(false);
  });

  it("honours a recent dismissal", async () => {
    const now = 1_000 * DAY;
    const { install: module } = await load({ stored: String(now - DAY) });
    expect(module.isDismissed(now)).toBe(true);
  });

  it("expires after the dismissal window", async () => {
    const now = 1_000 * DAY;
    const { install: module, store } = await load({ stored: null });
    store.set(
      "flowless:install-dismissed:v1",
      String(now - (module.DISMISS_DAYS + 1) * DAY),
    );
    expect(module.isDismissed(now)).toBe(false);
  });

  it("ignores a corrupt value", async () => {
    const { install: module } = await load({ stored: "not-a-number" });
    expect(module.isDismissed()).toBe(false);
  });

  it("treats blocked storage as not dismissed, so the banner still works", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    vi.stubGlobal("navigator", { userAgent: "x", maxTouchPoints: 0 });
    vi.stubGlobal("window", {
      navigator: { userAgent: "x" },
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    const install = await import("./install");
    expect(install.isDismissed()).toBe(false);
    expect(() => install.dismissInstall()).not.toThrow();
  });
});

describe("isStandalone", () => {
  it("detects an installed display mode", async () => {
    const { install: module } = await load({ displayMode: "standalone" });
    expect(module.isStandalone()).toBe(true);
  });

  it("detects window-controls-overlay", async () => {
    const { install: module } = await load({ displayMode: "window-controls-overlay" });
    expect(module.isStandalone()).toBe(true);
  });

  it("detects the legacy iOS flag", async () => {
    const { install: module } = await load({ iosStandalone: true });
    expect(module.isStandalone()).toBe(true);
  });

  it("is false in a normal tab", async () => {
    const { install: module } = await load();
    expect(module.isStandalone()).toBe(false);
  });
});

describe("isIos", () => {
  it("detects iPhone", async () => {
    const { install: module } = await load({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
    expect(module.isIos()).toBe(true);
  });

  it("detects iPadOS masquerading as a Mac", async () => {
    const { install: module } = await load({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 5,
    });
    expect(module.isIos()).toBe(true);
  });

  it("does not mistake a real Mac for iOS", async () => {
    const { install: module } = await load({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 0,
    });
    expect(module.isIos()).toBe(false);
  });

  it("is false on Windows", async () => {
    const { install: module } = await load();
    expect(module.isIos()).toBe(false);
  });
});

describe("snapshot", () => {
  it("reports installed when running standalone", async () => {
    const { install: module } = await load({ displayMode: "standalone" });
    expect(module.getInstallSnapshot().status).toBe("installed");
  });

  it("reports manual on iOS in a tab", async () => {
    const { install: module } = await load({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
    expect(module.getInstallSnapshot().status).toBe("manual");
  });

  it("reports unsupported where there is no install path", async () => {
    const { install: module } = await load();
    expect(module.getInstallSnapshot().status).toBe("unsupported");
  });

  it("renders nothing on the server", async () => {
    const { install: module } = await load({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
    const server = module.getServerInstallSnapshot();
    expect(server.status).toBe("unsupported");
    expect(server.dismissed).toBe(true);
  });

  it("is referentially stable between changes", async () => {
    const { install: module } = await load();
    expect(module.getInstallSnapshot()).toBe(module.getInstallSnapshot());
  });

  it("marks itself dismissed after dismissInstall", async () => {
    const { install: module } = await load({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
    expect(module.getInstallSnapshot().dismissed).toBe(false);
    module.dismissInstall();
    expect(module.getInstallSnapshot().dismissed).toBe(true);
  });

  it("notifies subscribers on dismissal", async () => {
    const { install: module } = await load({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
    const seen = vi.fn();
    const unsubscribe = module.subscribeInstall(seen);
    module.dismissInstall();
    expect(seen).toHaveBeenCalledTimes(1);
    unsubscribe();
    module.dismissInstall();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("promptInstall", () => {
  it("reports unavailable with no deferred prompt", async () => {
    const { install: module } = await load();
    await expect(module.promptInstall()).resolves.toBe("unavailable");
  });
});
