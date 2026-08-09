import { Skeleton } from "./Shimmer";

export { Skeleton };

/**
 * Skeleton components (docs/06 §3.1). Each mirrors the dimensions of its real
 * counterpart in docs/04-design-system.md so that swapping real content in
 * causes ZERO layout shift. The real components land in M3/M5; these ship in
 * M0 because everything else consumes them.
 */

/** Matches GuideCard: 3:4 photo, name + hook lines, badge pill, price line. */
export function GuideCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-card shadow-card">
      <Skeleton className="aspect-[3/4] w-full" rounded="none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-5 w-16" rounded="full" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

/** Matches OfferingCard: 4:3 cover, title + meta, guide-avatar bottom-left. */
export function OfferingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-card shadow-card">
      <div className="relative">
        <Skeleton className="aspect-[4/3] w-full" rounded="none" />
        <Skeleton
          className="absolute -bottom-4 left-3 h-8 w-8 border-2 border-card"
          rounded="full"
        />
      </div>
      <div className="space-y-2 p-3 pt-6">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

/** Matches GuideProfile: carousel, name lines, stat row, 3 offering cards. */
export function GuideProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="aspect-[16/9] w-full" rounded="card" />
      <div className="space-y-3">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-4 pt-2">
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-12 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <OfferingCardSkeleton />
        <OfferingCardSkeleton />
        <OfferingCardSkeleton />
      </div>
    </div>
  );
}

/** Matches OfferingDetail: big carousel, title, guide block, price, itinerary. */
export function OfferingDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="aspect-[16/9] w-full" rounded="card" />
      <Skeleton className="h-8 w-2/3" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-16 w-16" rounded="full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" rounded="card" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-10/12" />
      </div>
    </div>
  );
}

/** Matches ReviewBlock: avatar, name line, rating bar, two text lines. */
export function ReviewSkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="h-10 w-10 shrink-0" rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  );
}

/** Matches TripCard (My Trips): offering + guide + dates + status timeline. */
export function TripCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-card bg-card p-3 shadow-card">
      <Skeleton className="h-20 w-20 shrink-0" rounded="lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Matches EnquiryCard (guide dashboard): name/flag, offering, dates, actions. */
export function EnquiryCardSkeleton() {
  return (
    <div className="space-y-3 rounded-card bg-card p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-6" />
      </div>
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-11 flex-1" rounded="lg" />
        <Skeleton className="h-11 flex-1" rounded="lg" />
      </div>
    </div>
  );
}

/** Grid loader: N skeleton cards in the final layout, staggered entrance (§3.3). */
export function CardGridSkeleton({
  count = 8,
  variant = "guide",
}: {
  count?: number;
  variant?: "guide" | "offering";
}) {
  const Card = variant === "guide" ? GuideCardSkeleton : OfferingCardSkeleton;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-fade-in"
          // Stagger by 30ms in DOM order, capped ~300ms so it resolves in a
          // gentle wave rather than all at once (§3.3).
          style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
        >
          <Card />
        </div>
      ))}
    </div>
  );
}
