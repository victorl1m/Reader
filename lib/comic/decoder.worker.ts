/// <reference lib="webworker" />

/**
 * Comic archive decoder.
 *
 * Two things drive the design here:
 *
 * 1. **Nothing is retained.** Decoding a single entry costs about the same as
 *    decoding it as part of a full sequential pass (~10 ms either way, measured
 *    on a 61-page RAR), and it costs the same whether the entry is first or
 *    last. So the worker never holds decoded pages — it decodes what the UI
 *    asks for, hands the bytes over, and forgets them. The reader keeps a
 *    bounded window resident and re-requests anything it evicted.
 *
 * 2. **The rail still needs every page.** A background pass builds one small
 *    thumbnail per page. Those are tiny enough to keep for the whole session,
 *    and the pass yields to full-size requests so paging never waits on it.
 */

import { Unzip, UnzipInflate, unzipSync } from "fflate";
import { createExtractorFromData } from "node-unrar-js";
import { isPageEntry, sortPages } from "./entries";
import {
  detectFormat,
  LIMITS,
  mimeForName,
  type ArchiveFormat,
  type ComicErrorCode,
  type WorkerRequest,
  type WorkerResponse,
} from "./types";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const THUMB_WIDTH = 128;

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(message, transfer);
}

class DecodeError extends Error {
  constructor(
    message: string,
    readonly code: ComicErrorCode,
  ) {
    super(message);
  }
}

/** Copies a view into a standalone ArrayBuffer so it can be transferred. */
function detach(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

/** The wasm build of unrar is ~200 KB; fetch it once per worker, not per file. */
let wasmBinary: ArrayBuffer | null = null;
async function getWasm(): Promise<ArrayBuffer> {
  if (!wasmBinary) {
    const url = new URL("unrar.wasm", ctx.location.origin + "/");
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) {
      throw new DecodeError(
        `Não foi possível carregar o decodificador RAR (${res.status}). Verifique sua conexão e recarregue.`,
        "corrupt",
      );
    }
    wasmBinary = await res.arrayBuffer();
  }
  return wasmBinary;
}

type Archive = {
  format: ArchiveFormat;
  /** Entry names in reading order. */
  pages: string[];
  /** Decodes one entry by name. Throws `DecodeError` if it can't. */
  read: (name: string) => Uint8Array;
};

let archive: Archive | null = null;
/** Indices the UI wants resident, newest request first. */
let queue: number[] = [];
let pumping = false;
let thumbGeneration = 0;

// ---------------------------------------------------------------- RAR

async function openRar(data: ArrayBuffer): Promise<Archive> {
  const extractor = await createExtractorFromData({
    data,
    wasmBinary: await getWasm(),
  });

  const headers = [...extractor.getFileList().fileHeaders];
  if (headers.length > LIMITS.maxEntries) {
    throw new DecodeError(
      `Este arquivo contém ${headers.length} itens, mais do que o Flowless consegue abrir.`,
      "corrupt",
    );
  }
  if (headers.some((header) => header.flags.encrypted)) {
    throw new DecodeError("Este arquivo está protegido por senha.", "encrypted");
  }

  const total = headers.reduce((sum, header) => sum + (header.unpSize || 0), 0);
  if (total > LIMITS.maxTotalUncompressedBytes) {
    throw new DecodeError(
      "Este arquivo diz que expande para um tamanho implausível e não foi aberto.",
      "corrupt",
    );
  }

  const pages = sortPages(
    headers
      .filter((header) => !header.flags.directory && isPageEntry(header.name))
      .map((header) => header.name),
  );

  return {
    format: "rar",
    pages,
    read(name) {
      // The generator must be drained to completion. node-unrar-js only calls
      // `closeArc()` after its loop ends, so breaking out early — including via
      // an implicit `return` inside `for…of` — leaves the archive handle open
      // and makes the *next* extract fail. That failed every other page.
      let found: Uint8Array | null = null;
      for (const entry of extractor.extract({ files: [name] }).files) {
        if (entry.extraction && !found) found = entry.extraction;
      }
      if (!found) {
        throw new DecodeError(`Não foi possível ler a página “${name}”.`, "corrupt");
      }
      return found;
    },
  };
}

// ---------------------------------------------------------------- ZIP

function openZip(data: ArrayBuffer): Archive {
  const bytes = new Uint8Array(data);

  // Listing pass: `start()` is never called, so nothing is inflated and the
  // cost is header parsing only.
  const names: string[] = [];
  let declared = 0;
  let count = 0;

  const lister = new Unzip();
  lister.register(UnzipInflate);
  lister.onfile = (entry) => {
    count++;
    declared += entry.originalSize ?? 0;
    if (isPageEntry(entry.name)) names.push(entry.name);
  };

  try {
    lister.push(bytes, true);
  } catch (error) {
    throw new DecodeError(
      `Não foi possível ler o índice do ZIP: ${(error as Error).message}`,
      "corrupt",
    );
  }

  if (count > LIMITS.maxEntries) {
    throw new DecodeError(
      `Este arquivo contém ${count} itens, mais do que o Flowless consegue abrir.`,
      "corrupt",
    );
  }
  if (declared > LIMITS.maxTotalUncompressedBytes) {
    throw new DecodeError(
      "Este arquivo diz que expande para um tamanho implausível e não foi aberto.",
      "corrupt",
    );
  }

  const pages = sortPages(names);

  return {
    format: "zip",
    pages,
    read(name) {
      let out: Uint8Array | undefined;
      try {
        // `filter` keeps this to a single inflate; other entries are skipped.
        out = unzipSync(bytes, { filter: (entry) => entry.name === name })[name];
      } catch (error) {
        const message = (error as Error).message;
        if (/encrypt|password/i.test(message)) {
          throw new DecodeError("Este arquivo está protegido por senha.", "encrypted");
        }
        throw new DecodeError(
          `Não foi possível ler a página “${name}”: ${message}`,
          "corrupt",
        );
      }
      if (!out) throw new DecodeError(`A página “${name}” está faltando.`, "corrupt");
      return out;
    },
  };
}

// ---------------------------------------------------------------- pages

function decodePage(index: number): { bytes: ArrayBuffer; mime: string } | null {
  if (!archive) return null;
  const name = archive.pages[index];
  if (name === undefined) return null;

  const raw = archive.read(name);
  if (raw.byteLength > LIMITS.maxPageBytes) {
    throw new DecodeError(`A página ${index + 1} é grande demais para exibir.`, "corrupt");
  }
  return { bytes: detach(raw), mime: mimeForName(name) };
}

function sendPage(index: number) {
  try {
    const page = decodePage(index);
    if (!page) return;
    post({ type: "page", index, bytes: page.bytes, mime: page.mime }, [page.bytes]);
  } catch (error) {
    // One unreadable page shouldn't take down the whole book — the reader
    // shows a placeholder for it and the rest stays usable.
    if (error instanceof DecodeError && error.code === "encrypted") {
      post({ type: "error", message: error.message, code: error.code });
    }
  }
}

/**
 * Drains the request queue. Runs as a microtask loop so that `need` messages
 * arriving mid-drain are picked up on the next iteration.
 */
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const index = queue.shift()!;
      sendPage(index);
      // Yield so incoming messages (a fast page-turn) can re-prioritise.
      await Promise.resolve();
    }
  } finally {
    pumping = false;
  }
}

// ---------------------------------------------------------------- thumbnails

const canThumbnail =
  typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";

async function makeThumb(bytes: ArrayBuffer, mime: string): Promise<Blob | null> {
  if (!canThumbnail) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: mime }), {
      resizeWidth: THUMB_WIDTH,
      resizeQuality: "medium",
    });
  } catch {
    // An image the browser can't decode simply gets no thumbnail.
    return null;
  }

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: "image/webp", quality: 0.72 });
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/**
 * Builds one thumbnail per page, in reading order, yielding to full-size
 * requests between pages so a page-turn is never stuck behind the rail.
 */
async function buildThumbnails(generation: number) {
  if (!archive || !canThumbnail) {
    post({ type: "thumbs-done" });
    return;
  }

  // Let the reader's opening `need` land before claiming the worker.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const total = archive.pages.length;
  for (let index = 0; index < total; index++) {
    if (generation !== thumbGeneration) return; // A new archive was opened.
    if (queue.length) await pump();

    let page: { bytes: ArrayBuffer; mime: string } | null = null;
    try {
      page = decodePage(index);
    } catch {
      page = null;
    }
    if (!page) continue;

    const thumb = await makeThumb(page.bytes, page.mime);
    if (generation !== thumbGeneration) return;
    if (thumb) {
      const buffer = await thumb.arrayBuffer();
      post({ type: "thumb", index, bytes: buffer, mime: thumb.type }, [buffer]);
    }
    post({ type: "thumbs-progress", ready: index + 1, total });
  }

  post({ type: "thumbs-done" });
}

// ---------------------------------------------------------------- entry point

async function open(file: File, startIndex: number) {
  if (file.size > LIMITS.maxArchiveBytes) {
    throw new DecodeError(
      `Esse arquivo tem ${(file.size / 1024 ** 3).toFixed(1)} GB. O Flowless abre arquivos de até ${
        LIMITS.maxArchiveBytes / 1024 ** 3
      } GB.`,
      "too-large",
    );
  }
  if (file.size === 0) {
    throw new DecodeError("Esse arquivo está vazio.", "unsupported-format");
  }

  const data = await file.arrayBuffer();
  const head = new Uint8Array(data, 0, Math.min(8, data.byteLength));
  const format = detectFormat(head);

  if (format === "rar") {
    archive = await openRar(data);
  } else if (format === "zip") {
    archive = openZip(data);
  } else {
    throw new DecodeError(
      "Esse arquivo não é um arquivo de quadrinho. O Flowless lê .cbr (RAR) e .cbz (ZIP).",
      "unsupported-format",
    );
  }

  if (!archive.pages.length) {
    throw new DecodeError(
      "Nenhuma página legível foi encontrada neste arquivo.",
      "no-pages",
    );
  }

  // Prime the page the reader is about to land on, so first paint doesn't wait
  // on a round-trip. Everything after this is driven by `need` from the UI,
  // which is the only side that knows what it has already evicted.
  const start = Math.max(0, Math.min(startIndex, archive.pages.length - 1));
  queue = [start];

  post({ type: "meta", name: file.name, format: archive.format, pages: archive.pages });

  await pump();
  void buildThumbnails(++thumbGeneration);
}

ctx.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "need") {
    // Newest request wins: a reader who jumped to page 200 doesn't want the
    // pages queued for page 12 first.
    const wanted = request.indices.filter((index) => !queue.includes(index));
    queue = [...wanted, ...queue];
    void pump();
    return;
  }

  if (request.type !== "open") return;

  // Abandon any thumbnail pass still running for a previous archive.
  thumbGeneration++;
  archive = null;
  queue = [];

  try {
    await open(request.file, request.startIndex);
  } catch (error) {
    if (error instanceof DecodeError) {
      post({ type: "error", message: error.message, code: error.code });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const encrypted = /password|encrypt/i.test(message);
    post({
      type: "error",
      message: encrypted
        ? "Este arquivo está protegido por senha."
        : `Não foi possível ler o arquivo: ${message}`,
      code: encrypted ? "encrypted" : "corrupt",
    });
  }
});
