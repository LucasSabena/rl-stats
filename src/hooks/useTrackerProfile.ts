import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  fetchTrackerProfile,
  getCachedProfile,
  refreshTrackerProfile,
  getCachedRlstatsProfile,
} from "@/lib/api";
import type { TrackerProfile } from "@/lib/types";

const QUERY_KEY = ["tracker-profile"] as const;

export function useTrackerProfile() {
  const queryClient = useQueryClient();

  const query = useQuery<TrackerProfile | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const cached = await getCachedProfile();
      if (cached) return cached;

      const rlstatsCached = await getCachedRlstatsProfile();
      return rlstatsCached;
    },
    staleTime: 4 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    const unlisten = listen<TrackerProfile>("tracker-profile-updated", (event) => {
      queryClient.setQueryData(QUERY_KEY, event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  return query;
}

export function useRefreshTrackerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => refreshTrackerProfile(),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
}

export function useFetchTrackerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => fetchTrackerProfile(),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
}
