import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

let lastScannedCard: any = {
  uid: "Ninguna",
  timestamp_ms: 0,
  success: false,
  message: "Esperando aproximación..."
};

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // 1. Recibir lectura de tarjeta RFID desde la WeMos
      if (url.pathname === "/api/scan") {
        let uidStr = url.searchParams.get("uid");
        if (!uidStr && request.method === "POST") {
          try {
            const body = await request.clone().json() as { uid?: string };
            uidStr = body.uid || null;
          } catch (e) {
            // Ignorar errores de parseo
          }
        }

        if (uidStr) {
          const cardUid = uidStr.trim().toUpperCase();
          try {
            const { dbProcessPhysicalScan } = await import("./lib/armory.functions");
            const result = await dbProcessPhysicalScan(cardUid);

            lastScannedCard = {
              uid: cardUid,
              timestamp_ms: Date.now(),
              success: result.success,
              message: result.message,
              user: result.user
            };

            return new Response(
              JSON.stringify(lastScannedCard),
              {
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*"
                }
              }
            );
          } catch (err) {
            console.error("Error al procesar escaneo de WeMos:", err);
            return new Response(
              JSON.stringify({ success: false, message: err instanceof Error ? err.message : "Error interno del servidor" }),
              {
                status: 500,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*"
                }
              }
            );
          }
        }

        return new Response(
          JSON.stringify({ success: false, message: "UID no provisto" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      // 2. Servir el estado del último escaneo para el navegador (Caché Cero)
      if (url.pathname === "/api/last-card") {
        return new Response(
          JSON.stringify(lastScannedCard),
          {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              "Pragma": "no-cache",
              "Expires": "0",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
