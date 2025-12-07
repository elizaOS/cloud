import Image from "next/image";

import { siteConfig } from "@/app/config";

export default function Hero() {
  return (
    <div className="flex w-full flex-col items-start gap-4 lg:w-auto lg:flex-1 lg:justify-center lg:sticky lg:top-20">
      <div>
        <h1 className="text-2xl leading-[1.15] font-black text-balance text-white sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl">
          <span className="relative inline-block bg-brand px-2 py-0.5 text-white shadow-lg sm:px-3 sm:py-1">
            {siteConfig.hero.headline}
          </span>{" "}
          {siteConfig.hero.subheadline}
        </h1>
      </div>

      <div className="relative hidden w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl sm:rounded-3xl lg:block lg:max-w-lg xl:max-w-xl">
        <Image
          src="/images/hero.jpg"
          alt={siteConfig.hero.imageAlt}
          width={800}
          height={600}
          className="h-auto w-full object-cover"
          priority
        />
      </div>
    </div>
  );
}
