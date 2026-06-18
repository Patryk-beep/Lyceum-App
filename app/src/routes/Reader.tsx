import { useParams } from "react-router-dom";

import { ArtifactView } from "../components/ArtifactView";

/** /subject/:slug/research */
export function Research() {
  const { slug = "" } = useParams();
  return (
    <div className="reader-screen">
      <ArtifactView slug={slug} relpath="research.md" title="Research" />
    </div>
  );
}

/** /subject/:slug/lesson/:file — `file` is the lesson filename under lessons/. */
export function Lesson() {
  const { slug = "", file = "" } = useParams();
  return (
    <div className="reader-screen">
      <ArtifactView slug={slug} relpath={`lessons/${file}`} title="Lesson" />
    </div>
  );
}
