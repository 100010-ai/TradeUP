"use client";

import Image from "next/image";
import { useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";

type ProductImageProps = {
  src: string | null | undefined;
  alt: string;
  categoryId?: string;
  loading?: "eager" | "lazy";
};

export default function ProductImage({ src, alt, categoryId = "", loading = "lazy" }: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return <span className="productImageFallback" aria-hidden="true"><Icon name={categoryIconName(categoryId)} size={44} /></span>;
  }

  return (
    <Image
      className="productImageMedia"
      src={src}
      alt={alt}
      width={640}
      height={640}
      sizes={loading === "eager" ? "(max-width: 760px) 100vw, 760px" : "(max-width: 640px) 50vw, 320px"}
      loading={loading}
      fetchPriority={loading === "eager" ? "high" : "auto"}
      onError={() => setFailedSrc(src)}
    />
  );
}
