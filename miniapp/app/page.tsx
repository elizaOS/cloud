import { Suspense } from "react";

import CharacterCreatorSection from "../components/character-creator-section";
import Hero from "../components/hero";
import { ReferralCapture } from "../components/referral-capture";
import { Section } from "../components/section";

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-[#050109] text-white">
      <Suspense fallback={null}>
        <ReferralCapture />
      </Suspense>
      
      {/* Combined Hero + Character Creator Section */}
      <Section 
        id="character-creator"
        className="relative overflow-hidden !py-0 pt-16 pb-6 lg:pt-20 lg:pb-10 mt-12"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:gap-8">
          {/* Left: Hero Content */}
          <Hero />

          {/* Right: Character Creator Form */}
          <CharacterCreatorSection />
        </div>
      </Section>
    </main>
  );
}
