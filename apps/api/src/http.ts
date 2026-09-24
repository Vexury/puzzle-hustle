export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_IDS: string;
  APPLE_AUDIENCES: string;
  SESSION_LIMIT?: RateLimiter;
}

// The app runs on its own domain in the browser, on https://localhost inside Android's
// WebView, on capacitor://localhost inside iOS's (WKWebView reserves https for real sites),
// and on the Vite dev server while developing.
const ALLOWED_ORIGINS = [
  'https://puzzles.vexury.dev',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',
];

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(status: number, code: string): Response {
  return json({ error: code }, status);
}

export function cors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Expose-Headers', 'X-Session-Token');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}
