interface ElizaLogoProps {
  className?: string;
}

export function ElizaLogo({ className }: ElizaLogoProps) {
  return (
    <svg
      viewBox="0 0 512 93.06"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M382.36,93.06L408.84.41l76.82.09,26.34,92.56h-55.62l-1.75-11.8-17.11.19-2.16,11.61h-53ZM439.51,72.52h13.36l-7.22-40.63-6.71,39.65.57.98Z" />
      <polygon points="104.68 0 104.68 31.46 50.37 31.46 50.37 38.45 102.93 38.45 102.93 55.92 51.02 55.92 50.37 56.58 50.37 62.91 105.55 62.91 105.55 93.06 0 93.06 0 0 104.68 0" />
      <polygon points="271.11 .66 382.36 .44 343.82 55.92 379.73 55.92 379.73 93.06 268.04 93.06 310.97 37.14 271.11 37.14 271.11 .66" />
      <polygon points="162.05 56.8 211.11 56.8 211.11 93.06 110.37 93.06 110.37 0 161.4 0 162.05 .66 162.05 56.8" />
      <rect x="215.05" width="51.68" height="93.06" />
    </svg>
  );
}
