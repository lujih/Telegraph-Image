const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com https://giscus.app 'unsafe-inline'; style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; frame-src 'self' https://giscus.app; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
};

export async function securityHeaders(context) {
  const response = await context.next();
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
