import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay — LLM-native web. One install.",
  description:
    "Drop-in middleware that auto-generates an MCP-compatible action interface from your existing Node.js routes. 100x fewer tokens. Sub-20ms actions. Consent-first.",
  metadataBase: new URL("http://localhost:4000"),
  openGraph: {
    title: "Relay — LLM-native web",
    description:
      "One npm install. Your app becomes agent-readable. 100x fewer tokens, near-zero errors, consent-first.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="noise antialiased">{children}</body>
    </html>
  );
}
