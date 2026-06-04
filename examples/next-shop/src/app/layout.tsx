import type { ReactNode } from "react";

export const metadata = {
  title: "Relay — next-shop demo",
  description: "Demo Next.js App Router app powered by @relay/next.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
