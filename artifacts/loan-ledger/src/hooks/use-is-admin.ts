import { useGetMe } from "@workspace/api-client-react";

/**
 * Returns true if the currently authenticated user has the "admin" role.
 * Uses the same React Query cache as any other useGetMe() call — no extra requests.
 */
export function useIsAdmin(): boolean {
  const { data: me } = useGetMe();
  return me?.role === "admin";
}
