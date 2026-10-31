// Some browser/bookmark clients request a PNG icon by convention.
export function GET() {
  return new Response(null, { status: 308, headers: { Location: '/favicon.svg', 'Cache-Control': 'public, max-age=86400' } });
}
