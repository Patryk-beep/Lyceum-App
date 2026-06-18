import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { Dashboard } from "./routes/Dashboard";
import { Diagnostics } from "./routes/Diagnostics";
import { Review } from "./routes/Review";
import { Roadmap } from "./routes/Roadmap";
import { SubjectWizard } from "./routes/SubjectWizard";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="muted" style={{ padding: 8 }}>
      {title} — arriving in a later milestone.
    </div>
  );
}

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<Dashboard />} />
        <Route path="/new" element={<SubjectWizard />} />
        <Route path="/subject/:slug" element={<Roadmap />} />
        <Route path="/review" element={<Review />} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="*" element={<Placeholder title="This screen" />} />
      </Routes>
    </AppShell>
  );
}
