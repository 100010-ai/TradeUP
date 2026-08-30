"use client";

import { useEffect, useState } from "react";

type ProductImageProps = {
  src: string | null | undefined;
  alt: string;
  fallback: string;
  loading?: "eager" | "lazy";
};

export default function ProductImage({ src, alt, fallback, loading = "lazy" }: ProductImageProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (!src || failed) {
    return <span className="productImageFallback" aria-hidden="true">{fallback}</span>;
  }

  return (
    <img
      className="productImageMedia"
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
