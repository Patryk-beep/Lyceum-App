import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "../lib/ipc";

/**
 * Markdown `<img>` for lesson graphics. Delivery is text-only IPC (no Tauri asset
 * protocol), so the ONLY images that can render are subject-root-relative `*.svg` files,
 * served as text through `read_artifact` and shown via a script-safe `blob:` URL.
 * Everything else — raster, external/remote URLs, `..` escapes, slug-less refs — degrades
 * to an alt caption. Graphics are offline by construction: we never fetch a remote image
 * (that would be a tracking/SSRF beacon under `csp:null`), so external URLs caption too.
 * A lesson never shows a broken-image placeholder.
 */
export function LessonImg({
  src,
  alt,
  slug,
}: {
  src?: string;
  alt?: string;
  slug?: string;
}) {
  // Only a contained `.svg` with a slug is serveable. External/protocol URLs (http(s),
  // data:, blob:, //…), raster, `..` escapes, root-absolute, and slug-less refs all
  // caption directly — no remote fetch, no broken-image flash.
  if (src && slug && !isExternal(src) && isContainedSvg(src)) {
    return <SvgImg slug={slug} src={src} alt={alt} />;
  }
  return <AltCaption alt={alt} />;
}

function isExternal(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//");
}

function isContainedSvg(src: string): boolean {
  return !src.startsWith("/") && !src.split("/").includes("..") && /\.svg$/i.test(src);
}

/** A contained `.svg`: fetch its text via IPC, render as a script-safe `blob:` <img>. */
function SvgImg({ slug, src, alt }: { slug: string; src: string; alt?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["artifact", slug, src],
    queryFn: () => api.readArtifact(slug, src),
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Create the blob: URL in the commit phase (NOT in render/useMemo — an object URL is a
  // side effect) so create+revoke are paired and StrictMode's double-mount can't leak it.
  // Re-keying on `data` also clears a stale `failed` when the src/content changes in place.
  // blob: over data:;utf8 sidesteps the btoa UTF-8 crash; an <img> can't run SVG script.
  useEffect(() => {
    setFailed(false);
    if (!data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([data], { type: "image/svg+xml" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);

  if (isError || failed) return <AltCaption alt={alt} />;
  if (isLoading || !url) return <span className="reader__img-loading" aria-hidden="true" />;
  return <img src={url} alt={alt ?? ""} onError={() => setFailed(true)} />;
}

function AltCaption({ alt }: { alt?: string }) {
  return <span className="reader__img-alt">{alt?.trim() || "image"}</span>;
}
