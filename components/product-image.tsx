"use client";

import { useEffect, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";

type ProductImageProps = {
  src: string | null | undefined;
  alt: string;
  categoryId?: string;
  loading?: "eager" | "lazy";
};

export default function ProductImage({ src, alt, categoryId = "", loading = "lazy" }: ProductImageProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => { setFailed(!src); }, [src]);

  if (!src || failed) {
    return <span className="productImageFallback" aria-hidden="true"><Icon name={categoryIconName(categoryId)} size={44} /></span>;
  }

  return <img className="productImageMedia" src={src} alt={alt} loading={loading} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
