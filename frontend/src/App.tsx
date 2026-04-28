import { Suspense } from "react";
import { Route, Routes } from "react-router-dom";

/**
 * Placeholder route tree. Replaced in the next commit by the real route tree
 * mirroring the legacy `cloud/frontend/<dir>/page.tsx` filesystem layout.
 */
function App() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-neutral-400">Loading…</div>}>
      <Routes>
        <Route path="*" element={<div className="p-8">Eliza Cloud frontend (vite scaffold)</div>} />
      </Routes>
    </Suspense>
  );
}

export default App;
