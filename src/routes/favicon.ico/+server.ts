// Legacy browser favicon requests are redirected to the existing brand icon.
export function GET() {
  return new Response(null, { status: 308, headers: { Location: '/favicon.svg', 'Cache-Control': 'public, max-age=86400' } });
}
