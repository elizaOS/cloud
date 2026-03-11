/**
 * Apps skeleton loading using unified ListSkeleton component.
 */
import { ListSkeleton } from "./list-skeleton";

export function AppsSkeleton() {
  return <ListSkeleton rows={3} variant="card" />;
}
