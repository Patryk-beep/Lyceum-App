import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./ipc";

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: api.listSubjects,
  });
}

export function useWorkspaceInfo() {
  return useQuery({
    queryKey: ["workspace"],
    queryFn: api.workspaceInfo,
  });
}

export function useSeedDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.seedDemo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}

export function useManifest(slug: string) {
  return useQuery({
    queryKey: ["manifest", slug],
    queryFn: () => api.readManifest(slug),
    enabled: !!slug,
  });
}

export function useReviewDue(slug: string) {
  return useQuery({
    queryKey: ["review", slug],
    queryFn: () => api.reviewDue(slug),
    enabled: !!slug,
  });
}

