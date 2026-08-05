import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = (event?: unknown) => void;

/** A stand-in for `ServiceWorker`, with a settable state. */
function fakeWorker(state: string) {
  const listeners: Listener[] = [];
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (_: string, listener: Listener) => void listeners.push(listener),
    setState(next: string) {
      this.state = next;
      for (const listener of listeners) listener();
    },
  };
}

/** Fresh module instance over a stubbed service-worker container. */
async function load({
  controller = true,
  installing = null as ReturnType<typeof fakeWorker> | null,
  waiting = null as ReturnType<typeof fakeWorker> | null,
  readyState = "complete",
}: {
  controller?: boolean;
  installing?: ReturnType<typeof fakeWorker> | null;
  waiting?: ReturnType<typeof fakeWorker> | null;
  readyState?: string;
} = {}) {
  vi.resetModules();
  // `startUpdates` is production-only: a dev worker would serve stale chunks.
  vi.stubEnv("NODE_ENV", "production");

  const events = new Map<string, Listener[]>();
  const on = (type: string, listener: Listener) => {
    const existing = events.get(type);
    if (existing) existing.push(listener);
    else events.set(type, [listener]);
  };
  const fire = (type: string) => {
    for (const listener of events.get(type) ?? []) listener();
  };

  const registration = {
    installing,
    waiting,
    update: vi.fn(async () => {}),
    addEventListener: (type: string, listener: Listener) => on(`reg:${type}`, listener),
  };

  const serviceWorker = {
    controller: controller ? { state: "activated" } : null,
    register: vi.fn(async () => registration),
    addEventListener: (type: string, listener: Listener) => on(`sw:${type}`, listener),
    removeEventListener: () => {},
  };

  const reload = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker });
  vi.stubGlobal("window", {
    location: { reload },
    addEventListener: on,
    removeEventListener: () => {},
  });
  vi.stubGlobal("document", {
    readyState,
    visibilityState: "visible",
    addEventListener: (type: string, listener: Listener) => on(`doc:${type}`, listener),
  });

  const update = await import("./update");
  update.startUpdates();
  // `register` is awaited inside the module; let its microtasks drain.
  await new Promise((resolve) => setTimeout(resolve, 0));

  return { update, registration, serviceWorker, reload, fire };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("startUpdates", () => {
  it("registers the worker at the root scope", async () => {
    const { serviceWorker } = await load();
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("waits for load when the document is still parsing", async () => {
    const { serviceWorker, fire } = await load({ readyState: "loading" });
    expect(serviceWorker.register).not.toHaveBeenCalled();
    fire("load");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(serviceWorker.register).toHaveBeenCalled();
  });

  it("does nothing outside production", async () => {
    const { update: module, serviceWorker } = await load();
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const dev = await import("./update");
    dev.startUpdates();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Only the production instance from `load` ever registered.
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(module.getUpdateSnapshot().ready).toBe(false);
  });
});

describe("detection", () => {
  it("flags a worker already waiting when we registered", async () => {
    const { update: module } = await load({ waiting: fakeWorker("installed") });
    expect(module.getUpdateSnapshot().ready).toBe(true);
  });

  it("flags one that finishes installing later", async () => {
    const installing = fakeWorker("installing");
    const { update: module } = await load({ installing });
    expect(module.getUpdateSnapshot().ready).toBe(false);
    installing.setState("installed");
    expect(module.getUpdateSnapshot().ready).toBe(true);
  });

  it("flags a worker that took over on its own", async () => {
    const { update: module, fire } = await load();
    fire("sw:controllerchange");
    expect(module.getUpdateSnapshot().ready).toBe(true);
  });

  it("ignores the first install, which replaces nothing", async () => {
    const { update: module, fire } = await load({
      controller: false,
      waiting: fakeWorker("installed"),
    });
    expect(module.getUpdateSnapshot().ready).toBe(false);
    // The initial claim on a first install is not an update either.
    fire("sw:controllerchange");
    expect(module.getUpdateSnapshot().ready).toBe(false);
  });

  it("re-checks for a build deployed while the tab was hidden", async () => {
    const { registration, fire } = await load();
    fire("doc:visibilitychange");
    expect(registration.update).toHaveBeenCalled();
  });

  it("survives a failed registration", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", {
      serviceWorker: {
        controller: null,
        register: async () => {
          throw new Error("blocked");
        },
        addEventListener: () => {},
      },
    });
    vi.stubGlobal("window", {
      location: { reload: () => {} },
      addEventListener: () => {},
    });
    vi.stubGlobal("document", { readyState: "complete", addEventListener: () => {} });

    const { startUpdates, getUpdateSnapshot } = await import("./update");
    expect(() => startUpdates()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getUpdateSnapshot().ready).toBe(false);
  });
});

describe("snapshot", () => {
  it("renders nothing on the server", async () => {
    const { update: module } = await load();
    expect(module.getServerUpdateSnapshot()).toEqual({ ready: false, dismissed: false });
  });

  it("is referentially stable between changes", async () => {
    const { update: module } = await load({ waiting: fakeWorker("installed") });
    expect(module.getUpdateSnapshot()).toBe(module.getUpdateSnapshot());
  });

  it("notifies subscribers once per change", async () => {
    const installing = fakeWorker("installing");
    const { update: module } = await load({ installing });
    const seen = vi.fn();
    const unsubscribe = module.subscribeUpdate(seen);

    installing.setState("installed");
    expect(seen).toHaveBeenCalledTimes(1);
    // Already flagged: nothing changed, so nobody is told again.
    installing.setState("activated");
    expect(seen).toHaveBeenCalledTimes(1);

    module.dismissUpdate();
    expect(seen).toHaveBeenCalledTimes(2);
    unsubscribe();
    module.dismissUpdate();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("dismissUpdate", () => {
  it("hides the banner but keeps the update pending", async () => {
    const { update: module } = await load({ waiting: fakeWorker("installed") });
    module.dismissUpdate();
    expect(module.getUpdateSnapshot()).toEqual({ ready: true, dismissed: true });
  });
});

describe("applyUpdate", () => {
  it("hands over to a waiting worker instead of reloading blind", async () => {
    const waiting = fakeWorker("installed");
    const { update: module, reload, fire } = await load({ waiting });

    module.applyUpdate();
    expect(waiting.postMessage).toHaveBeenCalledWith("skip-waiting");
    expect(reload).not.toHaveBeenCalled();

    // The new worker taking over is the cue to reload, and only once.
    fire("sw:controllerchange");
    fire("sw:controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads directly when the new worker already activated", async () => {
    const { update: module, reload, fire } = await load();
    fire("sw:controllerchange");
    module.applyUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload until asked", async () => {
    const { reload, fire } = await load();
    fire("sw:controllerchange");
    // A reader part-way through a comic holds it only in memory.
    expect(reload).not.toHaveBeenCalled();
  });
});
