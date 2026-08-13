import { afterEach, describe, expect, it, vi } from "vitest";
import { chapter, comic, popular, search } from "./actions";

function answering(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The variables the last GraphQL call was made with. */
function sentVariables(fetchMock: ReturnType<typeof answering>) {
  const call = fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }];
  return JSON.parse(call[1].body).variables;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("catalogue actions", () => {
  it("answers a search without asking the catalogue anything", async () => {
    const fetchMock = answering({ data: { getHqsByName: [] } });

    await expect(search("b")).resolves.toEqual({ ok: true, data: [] });
    await expect(search("   ")).resolves.toEqual({ ok: true, data: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns results for a real query", async () => {
    answering({
      data: { getHqsByName: [{ id: 5, name: "Batman", publisherName: "DC" }] },
    });

    const result = await search("  batman  ");
    expect(result.ok && result.data[0].name).toBe("Batman");
  });

  /**
   * The endpoint is public, so a caller could otherwise ask the catalogue for
   * an unbounded shelf on every page load.
   */
  it("clamps how much a shelf can ask for", async () => {
    const fetchMock = answering({ data: { getHqsByFilters: [] } });

    await popular(5_000);
    expect(sentVariables(fetchMock).limit).toBe(24);

    await popular(0);
    expect(sentVariables(fetchMock).limit).toBe(1);

    await popular(Number.NaN);
    expect(sentVariables(fetchMock).limit).toBe(24);
  });

  it("carries a failure the reader should read, rather than throwing it", async () => {
    answering({ data: { getChapterById: { pictures: [], hq: null } } });

    const result = await chapter(1);
    expect(result).toEqual({
      ok: false,
      error: "Esse capítulo está sem páginas na biblioteca.",
    });
  });

  it("hides an unexpected failure behind a plain message, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("boom");
    });

    const result = await search("batman");
    expect(result.ok).toBe(false);
    // A network failure is still a catalogue failure, not a leaked stack trace.
    expect(result.ok === false && result.error).toMatch(/biblioteca/i);
    expect(logged).not.toHaveBeenCalled();
  });

  it("refuses an id that isn't one", async () => {
    const fetchMock = answering({ data: {} });

    await expect(comic(Number.NaN)).resolves.toEqual({
      ok: false,
      error: "Quadrinho desconhecido.",
    });
    await expect(chapter(Number.POSITIVE_INFINITY)).resolves.toEqual({
      ok: false,
      error: "Capítulo desconhecido.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
