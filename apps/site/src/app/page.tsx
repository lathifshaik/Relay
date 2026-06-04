import { CTA } from "@/components/sections/CTA";
import { CodeExample } from "@/components/sections/CodeExample";
import { Features } from "@/components/sections/Features";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Navbar } from "@/components/sections/Navbar";
import { Problem } from "@/components/sections/Problem";
import { Stats } from "@/components/sections/Stats";

export default function HomePage() {
  return (
    <main className="relative">
      <Navbar />
      <Hero />
      <section id="problem">
        <Problem />
      </section>
      <section id="how">
        <HowItWorks />
      </section>
      <CodeExample />
      <Stats />
      <Features />
      <CTA />
      <Footer />
    </main>
  );
}
