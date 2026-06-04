import type { ReactNode } from "react";
import { Footer } from "@/components/sections/Footer";
import { Navbar } from "@/components/sections/Navbar";
import { DocSidebar } from "@/components/docs/DocSidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-7xl px-6 pt-32 pb-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <DocSidebar />
            </div>
          </aside>
          <article className="min-w-0 max-w-3xl">{children}</article>
        </div>
      </div>
      <Footer />
    </div>
  );
}
