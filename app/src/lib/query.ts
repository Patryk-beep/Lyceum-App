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
