import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/auth-gate";
import { Shell } from "./components/shell";
import { TokenBudgetModal } from "./components/token-budget-modal";
import { AdminPage } from "./pages/admin";
import { InvitationAcceptPage } from "./pages/invitation-accept";
import { KnowledgePage } from "./pages/knowledge";
import { OverviewPage } from "./pages/overview";
import { PrivacyPage } from "./pages/privacy";
import { ReportsPage } from "./pages/reports";
import { TeamPage } from "./pages/team";
import { VenturePage } from "./pages/venture";
import { ResetPasswordPage } from "./pages/reset-password";
import { InitiatePage } from "./pages/initiate";
import { PageErrorBoundary } from "./components/page-error-boundary";
import { AiWorkspacePage } from "./pages/ai-workspace";

export function App() {
  return <AuthGate><Shell><PageErrorBoundary><Routes>
    <Route path="/" element={<OverviewPage />} />
    <Route path="/workspace" element={<AiWorkspacePage />} />
    <Route path="/discover" element={<Navigate to="/workspace" replace />} />
    <Route path="/refine" element={<Navigate to="/workspace" replace />} />
    <Route path="/initiate" element={<InitiatePage />} />
    <Route path="/venture" element={<VenturePage />} />
    <Route path="/evolve" element={<Navigate to="/workspace" replace />} />
    <Route path="/reports" element={<ReportsPage />} />
    <Route path="/team" element={<TeamPage />} />
    <Route path="/knowledge" element={<KnowledgePage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/invitations/accept" element={<InvitationAcceptPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></PageErrorBoundary><TokenBudgetModal /></Shell></AuthGate>;
}
