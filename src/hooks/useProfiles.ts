import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProfile as apiCreateProfile,
  deleteProfile as apiDeleteProfile,
  getActiveProfile,
  listProfiles,
  renameProfile as apiRenameProfile,
  switchProfile as apiSwitchProfile,
  updateProfilePlayerIdentity as apiUpdateProfileIdentity,
} from "@/lib/api";

/**
 * Profiles are server state: they live behind Tauri commands, so React Query
 * owns them (the retired zustand profileStore kept a second cache that could
 * drift from the backend). Mutations invalidate both keys.
 */
export const profileQueryKeys = {
  list: ["profiles"] as const,
  active: ["active-profile"] as const,
};

export function useProfiles() {
  return useQuery({
    queryKey: profileQueryKeys.list,
    queryFn: listProfiles,
    staleTime: 30_000,
  });
}

export function useActiveProfile() {
  return useQuery({
    queryKey: profileQueryKeys.active,
    queryFn: getActiveProfile,
    staleTime: 30_000,
    retry: false,
  });
}

export function useProfileMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: profileQueryKeys.list });
    void queryClient.invalidateQueries({ queryKey: profileQueryKeys.active });
  };

  return {
    createProfile: useMutation({
      mutationFn: ({ name, playerName }: { name: string; playerName: string }) =>
        apiCreateProfile(name, playerName),
      onSuccess: invalidate,
    }),
    switchProfile: useMutation({
      mutationFn: (id: string) => apiSwitchProfile(id),
      onSuccess: invalidate,
    }),
    deleteProfile: useMutation({
      mutationFn: (id: string) => apiDeleteProfile(id),
      onSuccess: invalidate,
    }),
    renameProfile: useMutation({
      mutationFn: ({ id, newName }: { id: string; newName: string }) =>
        apiRenameProfile(id, newName),
      onSuccess: invalidate,
    }),
    updateIdentity: useMutation({
      mutationFn: ({
        profileId,
        primaryId,
        playerName,
      }: {
        profileId: string;
        primaryId: string;
        playerName: string;
      }) => apiUpdateProfileIdentity(profileId, primaryId, playerName),
      onSuccess: invalidate,
    }),
  };
}
