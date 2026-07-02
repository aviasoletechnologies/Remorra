import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/auth-gate";
import { Shell } from "./components/shell";
import { TokenBudgetModal } from "./components/token-budget-modal";
import { PageErrorBoundary } from "./components/page-error-boundary";
import { CardSkeleton, PageSkeleton } from "./components/app-ui";

import { PhaseRoute } from "./components/phase-route.js";

const AdminPage = lazy(() => import("./pages/admin").then((module) => ({ default: module.AdminPage })));
const AiWorkspacePage = lazy(() => import("./pages/ai-workspace").then((module) => ({ default: module.AiWorkspacePage })));
const InitiatePage = lazy(() => import("./pages/initiate").then((module) => ({ default: module.InitiatePage })));
const InvitationAcceptPage = lazy(() => import("./pages/invitation-accept").then((module) => ({ default: module.InvitationAcceptPage })));
const KnowledgePage = lazy(() => import("./pages/knowledge").then((module) => ({ default: module.KnowledgePage })));
const HistoryPage = lazy(() => import("./pages/history").then((module) => ({ default: module.HistoryPage })));
const OverviewPage = lazy(() => import("./pages/overview").then((module) => ({ default: module.OverviewPage })));
const PrivacyPage = lazy(() => import("./pages/privacy").then((module) => ({ default: module.PrivacyPage })));
const ReportsPage = lazy(() => import("./pages/reports").then((module) => ({ default: module.ReportsPage })));
const ResetPasswordPage = lazy(() => import("./pages/reset-password").then((module) => ({ default: module.ResetPasswordPage })));
const TeamPage = lazy(() => import("./pages/team").then((module) => ({ default: module.TeamPage })));
const VenturePage = lazy(() => import("./pages/venture").then((module) => ({ default: module.VenturePage })));

export function App() {
  return (
    <AuthGate>
      <Shell>
        <PageErrorBoundary>
          <Suspense fallback={<PageSkeleton actionsCount={0} eyebrow={false} title={false}><CardSkeleton rows={4} /></PageSkeleton>}>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route
                path="/workspace"
                element={
                  <PhaseRoute allowedPhases={["discover", "refine"]}>
                    <AiWorkspacePage />
                  </PhaseRoute>
                }
              />
              <Route path="/discover" element={<Navigate to="/workspace" replace />} />
              <Route path="/refine" element={<Navigate to="/workspace" replace />} />
              <Route
                path="/initiate"
                element={
                  <PhaseRoute allowedPhases={["initiate"]}>
                    <InitiatePage />
                  </PhaseRoute>
                }
              />
              <Route
                path="/venture"
                element={
                  <PhaseRoute allowedPhases={["venture", "evolve"]}>
                    <VenturePage />
                  </PhaseRoute>
                }
              />
              <Route path="/evolve" element={<Navigate to="/venture" replace />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/invitations/accept" element={<InvitationAcceptPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </PageErrorBoundary>
        <TokenBudgetModal />
      </Shell>
    </AuthGate>
  );
}
