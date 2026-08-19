import { ImageResponse } from "next/og";
import { BRAND, markDataUri, panelPageUri } from "./brand";

const PAGE_RATIO = 300 / 460;

function TopBar({ narrow, page, total }: { narrow: boolean; page: number; total: number }) {
  const h = narrow ? 62 : 68;
  return (
    <div
      style={{
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: narrow ? 20 : 28,
        paddingRight: narrow ? 20 : 28,
        borderBottom: `1px solid ${BRAND.border}`,
        background: BRAND.surface,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={markDataUri()} width={28} height={28} alt="" />
        {narrow ? null : (
          <div style={{ display: "flex", fontSize: 19, color: BRAND.fg }}>Reader</div>
        )}
      </div>
      {narrow ? null : (
        <div style={{ display: "flex", fontSize: 16, color: BRAND.muted }}>
          Dinastia X 001, SQ e Fugitivos
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 14,
          paddingRight: 14,
          paddingTop: 6,
          paddingBottom: 6,
          borderRadius: 999,
          background: BRAND.surfaceRaised,
          border: `1px solid ${BRAND.border}`,
          fontSize: 15,
          color: BRAND.fg,
        }}
      >
        <div style={{ display: "flex", color: BRAND.orange }}>{page}</div>
        <div style={{ display: "flex", color: BRAND.muted }}>/ {total}</div>
      </div>
    </div>
  );
}

/** The reading surface: a two-page spread on wide, a single page on narrow. */
function readerScene(w: number, h: number, narrow: boolean) {
  const total = 61;
  const current = 12;
  const barH = narrow ? 62 : 68;
  const railH = narrow ? 76 : 108;
  const stageH = h - barH - railH;
  const padding = narrow ? 20 : 28;

  let pageH = stageH - padding * 2;
  let pageW = pageH * PAGE_RATIO;
  const spread = !narrow;
  const gap = 12;
  const maxW = w - padding * 2;
  const neededW = spread ? pageW * 2 + gap : pageW;
  if (neededW > maxW) {
    const k = maxW / neededW;
    pageW *= k;
    pageH *= k;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BRAND.bg,
      }}
    >
      <TopBar narrow={narrow} page={current} total={total} />

      <div
        style={{
          height: stageH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap,
          background: "#0b0b0e",
        }}
      >
        {(spread ? [current, current + 1] : [current]).map((n) => (
          <img
            key={n}
            src={panelPageUri(n)}
            width={Math.round(pageW)}
            height={Math.round(pageH)}
            alt=""
            style={{ borderRadius: 4 }}
          />
        ))}
      </div>

      {narrow ? (
        <div
          style={{
            height: railH,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 10,
            paddingLeft: 20,
            paddingRight: 20,
            borderTop: `1px solid ${BRAND.border}`,
            background: BRAND.surface,
          }}
        >
          <div
            style={{
              display: "flex",
              height: 4,
              borderRadius: 999,
              background: BRAND.surfaceRaised,
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${(current / total) * 100}%`,
                borderRadius: 999,
                background: BRAND.orange,
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <div style={{ display: "flex", color: BRAND.muted }}>Dinastia X 001</div>
            <div style={{ display: "flex", color: BRAND.muted }}>
              {current} de {total}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            height: railH,
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingLeft: 28,
            paddingRight: 28,
            borderTop: `1px solid ${BRAND.border}`,
            background: BRAND.surface,
            overflow: "hidden",
          }}
        >
          {Array.from({ length: 14 }, (_, i) => i + 6).map((n) => {
            const active = n === current;
            const th = railH - 30;
            return (
              <img
                key={n}
                src={panelPageUri(n)}
                width={Math.round(th * PAGE_RATIO)}
                height={th}
                alt=""
                style={{
                  borderRadius: 3,
                  border: active
                    ? `2px solid ${BRAND.orange}`
                    : `1px solid ${BRAND.border}`,
                  opacity: active ? 1 : 0.55,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The entry screen: drop a file, start reading. */
function libraryScene(w: number, h: number, narrow: boolean) {
  const coverH = narrow ? 168 : 208;
  const covers = narrow ? 3 : 5;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: narrow ? 34 : 40,
        paddingLeft: narrow ? 40 : 80,
        paddingRight: narrow ? 40 : 80,
        background: BRAND.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <img src={markDataUri()} width={narrow ? 60 : 68} height={narrow ? 60 : 68} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: narrow ? 40 : 46, color: BRAND.fg }}>
            Reader
          </div>
          <div
            style={{
              display: "flex",
              fontSize: narrow ? 15 : 17,
              color: BRAND.muted,
              letterSpacing: 5,
            }}
          >
            READER
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: narrow ? 34 : 44,
            color: BRAND.fg,
            textAlign: "center",
          }}
        >
          Seus quadrinhos abrem na hora, aqui no navegador
        </div>
        <div
          style={{
            display: "flex",
            fontSize: narrow ? 19 : 22,
            color: BRAND.muted,
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          Arraste um .cbr ou .cbz e a leitura já começa na primeira página.
          Nada é enviado: tudo acontece no seu aparelho.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          width: "100%",
          paddingTop: narrow ? 30 : 34,
          paddingBottom: narrow ? 30 : 34,
          borderRadius: 20,
          border: `2px dashed ${BRAND.border}`,
          background: BRAND.surface,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: 999,
            background: BRAND.orange,
            color: "#0b0b0f",
            fontSize: 26,
          }}
        >
          +
        </div>
        <div style={{ display: "flex", fontSize: narrow ? 20 : 23, color: BRAND.fg }}>
          Solte um quadrinho aqui
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {Array.from({ length: covers }, (_, i) => (
          <img
            key={i}
            src={panelPageUri(i * 3)}
            width={Math.round(coverH * PAGE_RATIO)}
            height={coverH}
            alt=""
            style={{ borderRadius: 6, border: `1px solid ${BRAND.border}` }}
          />
        ))}
      </div>
    </div>
  );
}

export type SceneName = "reader" | "library";

export function renderScreenshot(scene: SceneName, width: number, height: number) {
  const narrow = height > width;
  const element =
    scene === "reader"
      ? readerScene(width, height, narrow)
      : libraryScene(width, height, narrow);
  return new ImageResponse(element, { width, height });
}
