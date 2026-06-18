import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api } from "../lib/ipc";

/** Renders a subject markdown artifact (research / lesson / curriculum / capstone). */
export function ArtifactView({
  slug,
  relpath,
  title,
}: {
  slug: string;
  relpath: string;
  title?: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["artifact", slug, relpath],
    queryFn: () => api.readArtifact(slug, relpath),
    retry: false,
  });

  if (isLoading) return <div className="muted">Loading…</div>;
  if (error)
    return (
      <div className="muted" data-testid="artifact-missing">
        {title ?? "This artifact"} isn’t available yet — run the matching step first.
      </div>
    );

  return (
    <article className="reader" data-testid="artifact">
      <Markdown remarkPlugins={[remarkGfm]}>{data ?? ""}</Markdown>
    </article>
  );
}
