import { Skeleton } from "@/components/ui/skeleton";

/** Parent-sized skeleton: mirrors the dues card so the layout doesn't jump. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-12 h-6 w-20" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-12 w-48" />
      <Skeleton className="mt-4 h-5 w-40" />
      <Skeleton className="mt-6 h-14 w-full" />
    </div>
  );
}
