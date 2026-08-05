"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: this replaces the root layout, so it ships its own
 * `<html>`/`<body>` and cannot rely on the app's stylesheet being present.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "2rem",
          textAlign: "center",
          background: "#09090b",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
          <path
            d="M12 7H36A7 7 0 0 1 43 14V30A7 7 0 0 1 36 37H21L12 44.5V37A7 7 0 0 1 5 30V14A7 7 0 0 1 12 7Z"
            stroke="#fafafa"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M23 17.4C20 15 16.6 13.8 12.8 13.8V25.6C16.6 25.6 20 26.8 23 29.2Z" fill="#fafafa" />
          <path d="M25 17.4C28 15 31.4 13.8 35.2 13.8V25.6C31.4 25.6 28 26.8 25 29.2Z" fill="#ff6a2b" />
        </svg>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          O aplicativo travou
        </h1>
        <p style={{ color: "#a1a1aa", margin: 0, maxWidth: "34rem" }}>
          Não foi possível recuperar a página. Recarregue para começar de novo.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: "2.75rem",
            padding: "0 1.25rem",
            borderRadius: "999px",
            border: "none",
            background: "#ff6a2b",
            color: "#0b0b0f",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  );
}
