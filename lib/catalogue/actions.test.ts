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

/** The variables (GraphQL) or query string (MangaDex) the last call went out with. */
function sentVariables(fetchMock: ReturnType<typeof answering>) {
  const call = fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }];
  return JSON.parse(call[1].body).variables;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("catalogue actions", () => {
  describe("Quadrinhos (hq-now)", () => {
    it("answers a search without asking the catalogue anything", async () => {
      const fetchMock = answering({ data: { getHqsByName: [] } });

      await expect(search("quadrinhos", "b")).resolves.toEqual({ ok: true, data: [] });
      await expect(search("quadrinhos", "   ")).resolves.toEqual({ ok: true, data: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns results for a real query, tagged with the provider", async () => {
      answering({
        data: { getHqsByName: [{ id: 5, name: "Batman", publisherName: "DC" }] },
      });

      const result = await search("quadrinhos", "  batman  ");
      expect(result.ok && result.data[0]).toEqual({
        id: "5",
        provider: "hqnow",
        name: "Batman",
        publisher: "DC",
        status: null,
        cover: null,
      });
    });

    /**
     * The endpoint is public, so a caller could otherwise ask the catalogue
     * for an unbounded shelf on every page load.
     */
    it("clamps how much a shelf can ask for", async () => {
      const fetchMock = answering({ data: { getHqsByFilters: [] } });

      await popular("quadrinhos", 5_000);
      expect(sentVariables(fetchMock).limit).toBe(24);

      await popular("quadrinhos", 0);
      expect(sentVariables(fetchMock).limit).toBe(1);

      await popular("quadrinhos", Number.NaN);
      expect(sentVariables(fetchMock).limit).toBe(24);
    });

    it("carries a failure the reader should read, rather than throwing it", async () => {
      answering({ data: { getChapterById: { pictures: [], hq: null } } });

      const result = await chapter("hqnow", "1");
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

      const result = await search("quadrinhos", "batman");
      expect(result.ok).toBe(false);
      // A network failure is still a catalogue failure, not a leaked stack trace.
      expect(result.ok === false && result.error).toMatch(/biblioteca/i);
      expect(logged).not.toHaveBeenCalled();
    });

    it("refuses an id that isn't numeric", async () => {
      const fetchMock = answering({ data: {} });

      await expect(comic("hqnow", "not-a-number")).resolves.toEqual({
        ok: false,
        error: "Quadrinho desconhecido.",
      });
      await expect(chapter("hqnow", "Infinity")).resolves.toEqual({
        ok: false,
        error: "Capítulo desconhecido.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Mangá / Manhwa (MangaDex)", () => {
    function answeringMangaDex(data: unknown) {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: "ok", data }),
      }));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("searches with the origin language matching the tab", async () => {
      const fetchMock = answeringMangaDex([
        {
          id: "abc",
          attributes: { title: { en: "Solo Leveling" }, status: "ongoing" },
          relationships: [],
        },
      ]);

      const result = await search("manga", "solo leveling");
      expect(result.ok && result.data[0]).toEqual({
        id: "abc",
        provider: "mangadex",
        name: "Solo Leveling",
        publisher: null,
        status: "Em andamento",
        cover: null,
      });

      const url = (fetchMock.mock.calls.at(-1) as unknown as [string])[0];
      expect(url).toContain("originalLanguage%5B%5D=ja");

      await search("manhwa", "solo leveling");
      const manhwaUrl = (fetchMock.mock.calls.at(-1) as unknown as [string])[0];
      expect(manhwaUrl).toContain("originalLanguage%5B%5D=ko");
    });

    it("carries a MangaDex failure the reader should read", async () => {
      vi.stubGlobal("fetch", async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }));

      const result = await search("manga", "anything");
      expect(result).toEqual({
        ok: false,
        error: "O MangaDex respondeu com erro (500).",
      });
    });
  });
});
