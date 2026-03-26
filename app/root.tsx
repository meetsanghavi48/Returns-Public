import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.data || "Something went wrong"
    : "An unexpected error occurred";

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Error {status}</title>
      </head>
      <body style={{ fontFamily: "'Inter', -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f5f5", margin: 0 }}>
        <div style={{ background: "#fff", padding: 40, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", maxWidth: 440, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, background: "#ef4444", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24, color: "#fff" }}>!</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Error {status}</h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>{String(message)}</p>
          <a href="/" style={{ display: "inline-block", padding: "10px 24px", background: "#6c5ce7", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>Go Home</a>
        </div>
      </body>
    </html>
  );
}
