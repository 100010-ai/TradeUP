"use client";

import Link from "next/link";
import ProductImage from "@/components/product-image";
import { conditionLabel, dealDelta, percent, relativeDate, rubles, type MarketListing } from "@/lib/product";

export default function ListingCard({ listing }: { listing: MarketListing }) {
  const delta = dealDelta(listing.price, listing.base_value, listing.condition);
  const deal = delta <= -5;

  return (
    <Link href={`/listing/${listing.id}`} className="listingCardProduct flatListingCard">
      <div className={`listingVisual flatListingVisual category-${listing.category_id}`}>
        <ProductImage src={listing.image_url} alt={listing.item_name} categoryId={listing.category_id} />
        {deal && <span className="dealBadge flatDealBadge">{percent(delta, false)}</span>}
      </div>
      <div className="listingCardContent flatListingContent">
        <div className="listingPrice">{rubles(listing.price)}</div>
        <div className="listingCardTitle">{listing.title}</div>
        <div className="listingSubtitle">{conditionLabel(listing.condition)}</div>
        <div className="listingTime">{relativeDate(listing.created_at)}</div>
      </div>
    </Link>
  );
}
