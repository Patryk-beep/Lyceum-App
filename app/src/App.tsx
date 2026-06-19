import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { PreflightGate } from "./components/PreflightGate";
import { Analytics } from "./routes/Analytics";
import { Assignments } from "./routes/Assignments";
import { Capstone } from "./routes/Capstone";
import { Dashboard } from "./routes/Dashboard";
import { Diagnostics } from "./routes/Diagnostics";
import { Lessons } from "./routes/Lessons";
import { Placement } from "./routes/Placement";
import { Artifact, Lesson, Research } from "./routes/Reader";
import { Review } from "./routes/Review";
import { Roadmap } from "./routes/Roadmap";
import { Settings } from "./routes/Settings";
import { SubjectWizard } from "./routes/SubjectWizard";

export function App() {
  return (
    <PreflightGate>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<Dashboard />} />
          <Route path="/new" element={<SubjectWizard />} />
          <Route path="/subject/:slug" element={<Roadmap />} />
          <Route path="/subject/:slug/research" element={<Research />} />
          <Route path="/subject/:slug/lessons" element={<Lessons />} />
          <Route path="/subject/:slug/assignments" element={<Assignments />} />
          <Route path="/subject/:slug/lesson/:file" element={<Lesson />} />
          <Route path="/subject/:slug/artifact/*" element={<Artifact />} />
          <Route path="/subject/:slug/placement" element={<Placement />} />
          <Route path="/subject/:slug/capstone" element={<Capstone />} />
          <Route path="/subject/:slug/analytics" element={<Analytics />} />
          <Route path="/review" element={<Review />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </AppShell>
    </PreflightGate>
  );
}
