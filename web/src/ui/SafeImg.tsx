import { ImgHTMLAttributes, ReactNode, useEffect, useState } from "react";

interface SafeImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Rendered when the image fails to load. Defaults to nothing. */
  fallback?: ReactNode;
}

/** An <img> that disappears (or shows a fallback) instead of leaving a broken-image box. */
export default function SafeImg({ fallback = null, src, alt = "", ...rest }: SafeImgProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  return <img src={src} alt={alt} onError={() => setFailed(true)} {...rest} />;
}
