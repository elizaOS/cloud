import type { ImgHTMLAttributes, CSSProperties } from "react";

/**
 * Drop-in shim for `next/image` so the legacy pages keep type-checking and
 * rendering inside the Vite SPA. We render a plain <img> and ignore the
 * Next-specific knobs (`fill`, `priority`, `sizes`, `placeholder`,
 * `blurDataURL`, `quality`, `loader`, etc.).
 *
 * For per-page perf wins, switch the call sites to plain <img> and pick a
 * lightweight image library (`unpic`, `@unpic/react`) later.
 */
export interface NextImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string | { src: string };
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  placeholder?: "blur" | "empty";
  blurDataURL?: string;
  quality?: number;
  loader?: unknown;
  unoptimized?: boolean;
  onLoadingComplete?: (img: HTMLImageElement) => void;
  style?: CSSProperties;
}

function Image({
  src,
  alt,
  width,
  height,
  fill,
  // intentionally swallowed Next-only props
  priority: _priority,
  sizes: _sizes,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  quality: _quality,
  loader: _loader,
  unoptimized: _unoptimized,
  onLoadingComplete,
  style,
  className,
  ...rest
}: NextImageProps) {
  const resolvedSrc = typeof src === "string" ? src : src.src;
  const fillStyle: CSSProperties = fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: (style?.objectFit as CSSProperties["objectFit"]) ?? "cover",
      }
    : {};

  return (
    <img
      {...rest}
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      style={{ ...fillStyle, ...style }}
      onLoad={
        onLoadingComplete
          ? (e) => onLoadingComplete(e.currentTarget)
          : rest.onLoad
      }
    />
  );
}

export default Image;
