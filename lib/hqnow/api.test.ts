import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HqNowError,
  chapterById,
  chapterLabel,
  chapterTitle,
  hqById,
  searchHqs,
  secureUrl,
} from "./api";

/** Answers every request with one canned GraphQL payload. */
function answering(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("secureUrl", () => {
  it("upgrades the catalogue's http image URLs, which would be blocked as mixed content", () => {
    expect(secureUrl("http://static.hq-now.com/a/01.jpg")).toBe(
      "https://static.hq-now.com/a/01.jpg",
    );
  });

  it("leaves an https URL alone", () => {
    expect(secureUrl("https://static.hq-now.com/a/01.jpg")).toBe(
      "https://static.hq-now.com/a/01.jpg",
    );
  });

  it("refuses anything that isn't http(s)", () => {
    expect(secureUrl("javascript:alert(1)")).toBeNull();
    expect(secureUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(secureUrl("not a url")).toBeNull();
    expect(secureUrl("")).toBeNull();
    expect(secureUrl(null)).toBeNull();
  });
});

describe("searchHqs", () => {
  it("keeps only rows that can actually be opened", async () => {
    answering({
      data: {
        getHqsByName: [
          { id: 5, name: "Batman", status: "Concluído", publisherName: "DC Comics" },
          { id: null, name: "Sem id" },
          { id: 7, name: "   " },
          "nonsense",
        ],
      },
    });

    await expect(searchHqs("batman")).resolves.toEqual([
      {
        id: 5,
        name: "Batman",
        status: "Concluído",
        publisher: "DC Comics",
        cover: null,
      },
    ]);
  });

  it("has no results rather than an error for an unknown name", async () => {
    answering({ data: { getHqsByName: [] } });
    await expect(searchHqs("zzzz")).resolves.toEqual([]);
  });

  it("reports a GraphQL error in words the reader can see", async () => {
    answering({ errors: [{ message: "Variable $name is required" }] });
    await expect(searchHqs("x")).rejects.toThrow(HqNowError);
  });

  it("reports an HTTP failure", async () => {
    answering({}, 502);
    await expect(searchHqs("x")).rejects.toThrow(/502/);
  });
});

describe("hqById", () => {
  it("unwraps the single-element array the API answers with", async () => {
    answering({
      data: {
        getHqsById: [
          {
            id: 5,
            name: "Batman",
            synopsis: "Gotham.",
            status: "Concluído",
            publisherName: "DC Comics",
            hqCover: "http://static.hq-now.com/cover.jpg",
            capitulos: [],
          },
        ],
      },
    });

    const hq = await hqById(5);
    expect(hq.name).toBe("Batman");
    expect(hq.cover).toBe("https://static.hq-now.com/cover.jpg");
  });

  it("sorts chapters by number, so annuals and specials land in order", async () => {
    answering({
      data: {
        getHqsById: [
          {
            id: 5,
            name: "Batman",
            capitulos: [
              { id: 9, number: "1", name: "O Truque da Faca" },
              { id: 1323, number: "-5", name: "Anual 1" },
              { id: 178, number: "0", name: "Novo e Brilhante Ontem" },
              { id: 44, number: "2.5", name: "Tie-in" },
              { id: 45, number: "2", name: "Queda de Confiança" },
            ],
          },
        ],
      },
    });

    const hq = await hqById(5);
    expect(hq.chapters.map((chapter) => chapter.id)).toEqual([1323, 178, 9, 45, 44]);
  });

  it("rejects a comic the catalogue no longer has", async () => {
    answering({ data: { getHqsById: [] } });
    await expect(hqById(5)).rejects.toThrow(HqNowError);
  });
});

describe("chapterById", () => {
  it("returns page URLs in order, upgraded to https", async () => {
    answering({
      data: {
        getChapterById: {
          name: "O Truque da Faca",
          number: "1",
          oneshot: false,
          pictures: [
            { pictureUrl: "http://static.hq-now.com/pg01.jpg" },
            { pictureUrl: "http://static.hq-now.com/pg02.jpg" },
            { pictureUrl: null },
            { pictureUrl: "javascript:alert(1)" },
          ],
          hq: { id: 5, name: "Batman" },
        },
      },
    });

    const chapter = await chapterById(9);
    expect(chapter.pages).toEqual([
      "https://static.hq-now.com/pg01.jpg",
      "https://static.hq-now.com/pg02.jpg",
    ]);
    expect(chapter.hqId).toBe(5);
    expect(chapter.hqName).toBe("Batman");
  });

  it("rejects the all-null answer the API gives for a chapter that is gone", async () => {
    answering({
      data: {
        getChapterById: {
          name: null,
          number: null,
          oneshot: null,
          pictures: [],
          hq: null,
        },
      },
    });

    await expect(chapterById(1)).rejects.toThrow(HqNowError);
  });
});

describe("naming", () => {
  it("labels a numbered chapter, a named one and a one-shot", () => {
    expect(chapterLabel({ number: "1", name: "O Truque da Faca" })).toBe(
      "#1 · O Truque da Faca",
    );
    expect(chapterLabel({ number: "12", name: null })).toBe("#12");
    expect(chapterLabel({ number: null, name: "Prólogo" })).toBe("Prólogo");
    expect(chapterLabel({ number: "1", name: "Único", oneshot: true })).toBe("Único");
  });

  it("builds the name the reading position is keyed under", () => {
    const chapter = {
      id: 9,
      name: "O Truque da Faca",
      number: "1",
      oneshot: false,
      hqId: 5,
      hqName: "Batman",
      pages: ["https://static.hq-now.com/pg01.jpg"],
    };

    expect(chapterTitle(chapter)).toBe("Batman — #1 · O Truque da Faca");
    // The chapter payload names its comic; a caller's guess is only a fallback.
    expect(chapterTitle({ ...chapter, hqName: null }, "Batman")).toBe(
      "Batman — #1 · O Truque da Faca",
    );
  });
});
