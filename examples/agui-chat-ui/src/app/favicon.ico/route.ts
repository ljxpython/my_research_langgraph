export async function GET() {
  // Avoid noisy 404s in devtools. We don't need a real icon for the demo.
  return new Response(null, {
    status: 204,
    headers: {
      'Content-Type': 'image/x-icon',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
