import { NextResponse } from "next/server";
import { PLATFORM_NAME } from "@/lib/constants";

// Skupna preprosta HTML stran za /admin/* route handlerje (odobritev,
// ponovno pošiljanje) - brez prijave, samo obvestilo o rezultatu.
export function adminPage(title: string, message: string, ok: boolean) {
  const html = `<!doctype html>
<html lang="sl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ${PLATFORM_NAME}</title>
  <style>
    body { background: #1b1815; color: #efe6d8; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
    .card { max-width: 380px; width: 100%; border: 1px solid #3a342c; border-radius: 8px;
            padding: 28px 24px; text-align: center; }
    .brand-logo { height: 16px; width: auto; opacity: 0.6; margin: 0 0 12px; }
    h1 { font-size: 18px; margin: 0 0 10px; }
    p.msg { font-size: 14px; margin: 0; color: ${ok ? "#7fa06b" : "#c97d7d"}; }
  </style>
</head>
<body>
  <div class="card">
    <img class="brand-logo" src="/logo.png" width="3602" height="3020" alt="Powered by ${PLATFORM_NAME}" />
    <h1>${title}</h1>
    <p class="msg">${message}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
