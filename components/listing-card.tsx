"use client";

import Link from "next/link";
import {
  categoryMeta,
  conditionLabel,
  dealDelta,
  percent,
  relativeDate,
  rubles,
  type MarketListing,
} from "@/lib/product";

export default function ListingCard({ listing }: { listing: MarketListing }) {
  const meta = categoryMeta[listing.category_id] ?? { icon: "📦", short: listing.category_name };
  const delta = dealDelta(listing.price, listing.base_value, listing.condition);
  const deal = delta <= -5;

  return (
    <Link href={`/listing/${listing.id}`} className="listingCardProduct">
      <div className={`listingVisual category-${listing.category_id}`}>
        {listing.image_url ? <img src={listing.image_url} alt="" loading="lazy" /> : <span>{meta.icon}</span>}
        {deal && <span className="dealBadge">{percent(delta, false)} к ориентиру</span>}
        <span className="conditionBadge">{listing.condition}%</span>
      </div>
      <div className="listingCardContent">
        <div className="listingCardTitle">{listing.title}</div>
        <div className="listingPrice">{rubles(listing.price)}</div>
        <div className="listingSubtitle">{conditionLabel(listing.condition)} · {listing.category_name}</div>
        <div className="sellerLine">
          <span className="sellerMiniAvatar">{listing.seller_first_name.charAt(0).toUpperCase()}</span>
          <span>{listing.seller_first_name}</span>
          <i>★ {listing.seller_rating}</i>
        </div>
        <div className="listingTime">{relativeDate(listing.created_at)}</div>
      </div>
    </Link>
  );
}
