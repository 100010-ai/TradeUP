"use client";

import Link from "next/link";
import { memo } from "react";
import ProductImage from "@/components/product-image";
import { conditionLabel, dealDelta, percent, relativeDate, rubles, type MarketCardListing } from "@/lib/product";

function ListingCard({ listing, eager = false }: { listing: MarketCardListing; eager?: boolean }) {
  const delta = dealDelta(listing.price, listing.base_value, listing.condition);
  const deal = delta <= -5;
  const meta = [listing.brand, conditionLabel(listing.condition)].filter(Boolean).join(" · ");

  return (
    <Link href={`/listing/${listing.id}`} prefetch={false} className="listingCardProduct flatListingCard" aria-label={`${listing.title}, ${rubles(listing.price)}`}>
      <div className={`listingVisual flatListingVisual category-${listing.category_id}`}>
        <ProductImage src={listing.image_url} alt={listing.item_name} categoryId={listing.category_id} loading={eager ? "eager" : "lazy"} />
        {deal && <span className="dealBadge flatDealBadge" aria-label={`Цена ниже ориентира на ${Math.abs(Math.round(delta))}%`}>{percent(delta, false)}</span>}
      </div>
      <div className="listingCardContent flatListingContent">
        <div className="listingPrice">{rubles(listing.price)}</div>
        <div className="listingCardTitle">{listing.title}</div>
        <div className="listingMetaLine">
          <span>{meta}</span>
          <time dateTime={listing.created_at}>{relativeDate(listing.created_at)}</time>
        </div>
      </div>
    </Link>
  );
}

export default memo(ListingCard);
