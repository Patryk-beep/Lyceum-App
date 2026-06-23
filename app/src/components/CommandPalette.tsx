import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { recentSubjects } from "../hooks/useResumeState";
import { api } from "../lib/ipc";
import { useSubjects } from "../lib/query";
import { useEngineStore } from "../stores/useEngineStore";
import { useThemeStore, type ThemeName } from "../stores/useThemeStore";
import { useTutorStore } from "../stores/useTutorStore";
import { useZenStore } from "../stores/useZenStore";
import { parseSubjectRoute } from "../theme/loop";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

const THEMES: { name: ThemeName; label: string }[] = [
  { name: "aurelia-dark", label: "Aurelia Dark" },
  { name: "night", label: "Night" },
  { name: "almanac", label: "Almanac" },
  { name: "momentum", label: "Momentum" },
];

const STAGES: { seg: string; label: string }[] = [
  { seg: "", label: "Overview" },
  { seg: "research", label: "Research" },
  { seg: "placement", label: "Placement" },
  { seg: "lessons", label: "Lessons" },
  { seg: "assignments", label: "Assignments" },
  { seg: "review", label: "Review" },
  { seg: "capstone", label: "Capstone" },
  { seg: "analytics", label: "Analytics" },
  { seg: "notebook", label: "Notebook" },
];

const GLOBAL: [string, string][] = [
  ["/library", "Library"],
  ["/review", "Review"],
  ["/analytics", "Analytics"],
  ["/new", "New subject"],
  ["/settings", "Settings"],
  ["/diagnostics", "Diagnostics"],
];

/** ⌘K / Ctrl+K palette. Default = navigate; `>` prefix = run an action. Scoped to
 *  the active subject; empty state surfaces "resume" so it doubles as a one-key
 *  "pick up where I left off". Built on cmdk (combobox-in-dialog + focus trap). */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { slug } = parseSubjectRoute(pathname);
  const { data: subjects } = useSubjects();
  const setTheme = useThemeStore((s) => s.setTheme);
  const engineStart = useEngineStore((s) => s.start);
  const zenAvailable = useZenStore((s) => s.available);
  const zenActive = useZenStore((s) => s.active);
  const zenSetActive = useZenStore((s) => s.setActive);
  const zenToggleBrief = useZenStore((s) => s.toggleBrief);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const step = useMutation({
    mutationFn: (s: string) => api.runSubjectStep(s),
    onMutate: (s) => engineStart(s),
    onSuccess: (_d, s) => {
      for (const k of ["manifest", "review", "analytics"])
        qc.invalidateQueries({ queryKey: [k, s] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });

  const close = () => onOpenChange(false);
  const go = (to: string) => {
    close();
    navigate(to);
  };

  const subjectsList = subjects ?? [];
  const activeName = subjectsList.find((s) => s.slug === slug)?.subject;

  const navItems: PaletteItem[] = [];
  if (slug) {
    for (const st of STAGES)
      navItems.push({
        id: `stage:${st.seg || "overview"}`,
        label: st.label,
        hint: activeName,
        keywords: `${activeName ?? ""} ${st.label}`,
        run: () => go(`/subject/${slug}${st.seg ? "/" + st.seg : ""}`),
      });
  }
  for (const s of subjectsList)
    navItems.push({
      id: `subject:${s.slug}`,
      label: s.subject,
      hint: "subject",
      keywords: s.subject,
      run: () => go(`/subject/${s.slug}`),
    });
  for (const [to, label] of GLOBAL)
    navItems.push({ id: `go:${to}`, label, hint: "page", keywords: label, run: () => go(to) });

  const actionItems: PaletteItem[] = [];
  if (slug) {
    actionItems.push({
      id: "act:step",
      label: "Run next step",
      keywords: "run engine next continue advance",
      run: () => {
        close();
        step.mutate(slug);
      },
    });
    actionItems.push({
      id: "act:placement",
      label: "Start placement test",
      keywords: "placement pretest probe",
      run: () => go(`/subject/${slug}/placement`),
    });
    actionItems.push({
      id: "act:capstone",
      label: "Open capstone",
      keywords: "capstone final project deliverable",
      run: () => go(`/subject/${slug}/capstone`),
    });
    actionItems.push({
      id: "act:tutor",
      label: "Ask the tutor",
      keywords: "tutor ask question help explain hint why understand",
      run: () => {
        close();
        useTutorStore.getState().openPanel();
      },
    });
  }
  if (zenAvailable) {
    actionItems.push({
      id: "act:zen",
      label: zenActive ? "Exit zen mode" : "Enter zen mode",
      keywords: "zen focus distraction free write fullscreen",
      run: () => {
        close();
        zenSetActive(!zenActive);
      },
    });
    actionItems.push({
      id: "act:brief",
      label: "Toggle prompt panel",
      keywords: "brief reference prompt panel rail question",
      run: () => {
        close();
        zenToggleBrief();
      },
    });
  }
  for (const t of THEMES)
    actionItems.push({
      id: `act:theme:${t.name}`,
      label: `Switch theme: ${t.label}`,
      keywords: `theme appearance ${t.label}`,
      run: () => {
        setTheme(t.name);
        close();
      },
    });

  const recents: PaletteItem[] = recentSubjects()
    .slice(0, 5)
    .map((r) => {
      const name = subjectsList.find((s) => s.slug === r.slug)?.subject ?? r.slug;
      return {
        id: `recent:${r.slug}`,
        label: `Continue ${name}`,
        keywords: name,
        run: () => go(r.route),
      };
    });

  const act = query.startsWith(">");
  const term = (act ? query.slice(1) : query).trim().toLowerCase();
  const match = (i: PaletteItem) =>
    !term || `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(term);

  const shownActions = act ? actionItems.filter(match) : [];
  const shownNav = act ? [] : navItems.filter(match);
  const showRecents = !act && !term && recents.length > 0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      shouldFilter={false}
      loop
      overlayClassName="palette-overlay"
      contentClassName="palette card"
    >
      <div className="palette__head">
        {slug && activeName && (
          <span className="palette__scope" data-testid="palette-scope">
            {activeName} ▸
          </span>
        )}
        <Command.Input
          className="palette__input"
          placeholder={act ? "Run a command…" : "Jump to…  (type > for actions)"}
          value={query}
          onValueChange={setQuery}
          autoFocus
          data-testid="palette-input"
        />
      </div>
      <Command.List className="palette__list">
        <Command.Empty className="palette__empty">No results.</Command.Empty>

        {showRecents && (
          <Command.Group heading="Resume" className="palette__group">
            {recents.map((i) => (
              <Command.Item
                key={i.id}
                value={i.id}
                onSelect={i.run}
                className="palette__item"
              >
                {i.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {shownActions.length > 0 && (
          <Command.Group heading="Actions" className="palette__group">
            {shownActions.map((i) => (
              <Command.Item
                key={i.id}
                value={i.id}
                onSelect={i.run}
                className="palette__item"
              >
                {i.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {shownNav.length > 0 && (
          <Command.Group heading="Go to" className="palette__group">
            {shownNav.map((i) => (
              <Command.Item
                key={i.id}
                value={i.id}
                onSelect={i.run}
                className="palette__item"
              >
                <span>{i.label}</span>
                {i.hint && <span className="palette__hint">{i.hint}</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
