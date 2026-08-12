import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CatalogueError,
  chapterById,
  comicById,
  searchComics,
  secureUrl,
} from "./api";
import { chapterLabel, chapterSource, chapterTitle } from "./format";

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
    expect(secureUrl("http://static.example.com/a/01.jpg")).toBe(
      "https://static.example.com/a/01.jpg",
    );
  });

  it("leaves an https URL alone", () => {
    expect(secureUrl("https://static.example.com/a/01.jpg")).toBe(
      "https://static.example.com/a/01.jpg",
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

describe("searchComics", () => {
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

    await expect(searchComics("batman")).resolves.toEqual([
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
    await expect(searchComics("zzzz")).resolves.toEqual([]);
  });

  it("reports a GraphQL error in words the reader can see", async () => {
    answering({ errors: [{ message: "Variable $name is required" }] });
    await expect(searchComics("x")).rejects.toThrow(CatalogueError);
  });

  it("reports an HTTP failure", async () => {
    answering({}, 502);
    await expect(searchComics("x")).rejects.toThrow(/502/);
  });
});

describe("comicById", () => {
  it("unwraps the single-element array the catalogue answers with", async () => {
    answering({
      data: {
        getHqsById: [
          {
            id: 5,
            name: "Batman",
            synopsis: "Gotham.",
            status: "Concluído",
            publisherName: "DC Comics",
            hqCover: "http://static.example.com/cover.jpg",
            capitulos: [],
          },
        ],
      },
    });

    const comic = await comicById(5);
    expect(comic.name).toBe("Batman");
    expect(comic.cover).toBe("https://static.example.com/cover.jpg");
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

    const comic = await comicById(5);
    expect(comic.chapters.map((chapter) => chapter.id)).toEqual([
      1323, 178, 9, 45, 44,
    ]);
  });

  it("rejects a comic the catalogue no longer has", async () => {
    answering({ data: { getHqsById: [] } });
    await expect(comicById(5)).rejects.toThrow(CatalogueError);
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
            { pictureUrl: "http://static.example.com/pg01.jpg" },
            { pictureUrl: "http://static.example.com/pg02.jpg" },
            { pictureUrl: null },
            { pictureUrl: "javascript:alert(1)" },
          ],
          hq: { id: 5, name: "Batman" },
        },
      },
    });

    const chapter = await chapterById(9);
    expect(chapter.pages).toEqual([
      "https://static.example.com/pg01.jpg",
      "https://static.example.com/pg02.jpg",
    ]);
    expect(chapter.comicId).toBe(5);
    expect(chapter.comicName).toBe("Batman");
  });

  it("rejects the all-null answer given for a chapter that is gone", async () => {
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

    await expect(chapterById(1)).rejects.toThrow(CatalogueError);
  });
});

describe("naming", () => {
  const chapter = {
    id: 9,
    name: "O Truque da Faca",
    number: "1",
    oneshot: false,
    comicId: 5,
    comicName: "Batman",
    pages: ["https://static.example.com/pg01.jpg"],
  };

  it("labels a numbered chapter, a named one and a one-shot", () => {
    expect(chapterLabel({ number: "1", name: "O Truque da Faca" })).toBe(
      "#1 · O Truque da Faca",
    );
    expect(chapterLabel({ number: "12", name: null })).toBe("#12");
    expect(chapterLabel({ number: null, name: "Prólogo" })).toBe("Prólogo");
    expect(chapterLabel({ number: "1", name: "Único", oneshot: true })).toBe("Único");
  });

  it("builds the name the reading position is keyed under", () => {
    expect(chapterTitle(chapter)).toBe("Batman — #1 · O Truque da Faca");
    // The chapter payload names its comic; a caller's guess is only a fallback.
    expect(chapterTitle({ ...chapter, comicName: null }, "Batman")).toBe(
      "Batman — #1 · O Truque da Faca",
    );
  });

  it("carries the ids needed to fetch the chapter again", () => {
    expect(chapterSource(chapter)).toEqual({
      kind: "catalogue",
      comicId: 5,
      chapterId: 9,
    });
    expect(chapterSource({ ...chapter, comicId: null }, 12).comicId).toBe(12);
  });
});
