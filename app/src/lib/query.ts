import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { forgetSubject } from "../hooks/useResumeState";
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

/** The authoritative next routed step (kind/why/target) from the Rust router. Advisory in
 *  the UI — `run_subject_step` re-derives the route at run time — so consumers must treat it
 *  as best-effort (refetch after a run; tolerate loading/error). */
export function useNextStep(slug: string) {
  return useQuery({
    queryKey: ["nextStep", slug],
    queryFn: () => api.computeNextStep(slug),
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

export function useAnalytics(slug: string) {
  return useQuery({
    queryKey: ["analytics", slug],
    queryFn: () => api.subjectAnalytics(slug),
    enabled: !!slug,
  });
}

export function useStreak() {
  return useQuery({
    queryKey: ["streak"],
    queryFn: api.studyStreak,
    retry: false,
  });
}

export function useLessons(slug: string) {
  return useQuery({
    queryKey: ["lessons", slug],
    queryFn: () => api.listLessons(slug),
    enabled: !!slug,
  });
}

/** Delete a whole subject. Drops every per-subject cache so nothing renders stale. */
export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.deleteSubject(slug),
    onSuccess: (_d, slug) => {
      forgetSubject(slug); // drop its resume entry so the palette won't offer it
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["streak"] });
      for (const key of ["manifest", "review", "analytics", "lessons"]) {
        qc.removeQueries({ queryKey: [key, slug] });
      }
    },
  });
}

export function useDeleteLesson(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, file }: { moduleId: string; file: string }) =>
      api.deleteLesson(slug, moduleId, file),
    onSuccess: (_d, { file }) => {
      qc.removeQueries({ queryKey: ["artifact", slug, `lessons/${file}`] });
      for (const key of ["manifest", "lessons", "analytics", "review"]) {
        qc.invalidateQueries({ queryKey: [key, slug] });
      }
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

export function useDeleteAssignment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => api.deleteAssignment(slug, assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

/** Hand in a student answer: write the file + flip to submitted. The caller then
 *  runs the next engine step, which routes to assess-understanding to grade it. */
export function useSubmitAssignment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { assignmentId: string; content: string }) =>
      api.submitAssignment(slug, vars.assignmentId, vars.content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["artifact", slug] });
    },
  });
}

/** Every note for a subject (newest-updated first). The whole list is loaded so
 *  the UI can do client-side search over note content without extra round-trips. */
export function useNotebooks(slug: string) {
  return useQuery({
    queryKey: ["notebook", slug],
    queryFn: () => api.listNotebooks(slug),
    enabled: !!slug,
  });
}

/** Create (no `id`) or update (with `id`) a note, then refresh the notebook list +
 *  the derived flashcard badge (a cloze edit changes due cards). */
export function useSaveNotebook(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      id?: string;
      title: string;
      content: string;
      moduleId?: string;
    }) =>
      v.id
        ? api.updateNotebook(slug, v.id, v.title, v.content)
        : api.createNotebook(slug, v.title, v.content, v.moduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notebook", slug] });
      qc.invalidateQueries({ queryKey: ["notebookDueCount", slug] });
    },
  });
}

export function useDeleteNotebook(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteNotebook(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notebook", slug] });
      qc.invalidateQueries({ queryKey: ["notebookDueCount", slug] });
    },
  });
}

/** Due flashcard batch for the in-session review queue (loaded once per session;
 *  grading steps through it in memory, so this is NOT invalidated on grade). */
export function useNotebookCardsDue(slug: string) {
  return useQuery({
    queryKey: ["notebookCards", slug],
    queryFn: () => api.notebookReviewDue(slug),
    enabled: !!slug,
  });
}

/** The "N due" flashcard badge (whole store count). */
export function useNotebookDueCount(slug: string) {
  return useQuery({
    queryKey: ["notebookDueCount", slug],
    queryFn: () => api.notebookDueCount(slug),
    enabled: !!slug,
  });
}

export function useResetCurriculum(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetCurriculum(slug),
    onSuccess: () => {
      for (const key of ["manifest", "review", "analytics", "lessons"]) {
        qc.invalidateQueries({ queryKey: [key, slug] });
      }
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

