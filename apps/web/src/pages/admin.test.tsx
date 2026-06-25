import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPage } from "./admin";
import { api } from "../lib/api";
import { ConfirmProvider } from "../components/confirm-dialog";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  waitForJob: vi.fn(),
}));

const mockSchema = {
  tables: {
    Project: ["id", "name"],
    Persona: ["id", "description"]
  },
  relations: {}
};

const mockSkill = {
  id: "skill-1",
  name: "Mock Skill",
  description: "A test skill",
  versions: [
    {
      id: "version-1",
      active: true,
      systemPrompt: "My system prompt",
      inputSourceMap: {
        skills: [],
        tables: {
          Project: []
        }
      }
    }
  ]
};

describe("AdminPage - Select All Tables", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    });

    // Pre-seed query cache to prevent React early return hook mismatch issues
    queryClient.setQueryData(["me"], { platformRole: "admin" });
    queryClient.setQueryData(["admin-db-schema"], mockSchema);
    queryClient.setQueryData(["admin-skills", 1], {
      items: [mockSkill],
      totalPages: 1
    });
    queryClient.setQueryData(["admin-all-skills-list"], {
      items: [mockSkill],
      totalPages: 1
    });
    queryClient.setQueryData(["admin-retention"], []);
    queryClient.setQueryData(["admin-reports"], []);
    queryClient.setQueryData(["admin-knowledge-bases"], []);
    queryClient.setQueryData(["admin-users", 1], { items: [], totalPages: 1 });
    queryClient.setQueryData(["admin-overview-metrics", "all"], { totalCostMinor: 100, activeConversations: 5 });
    queryClient.setQueryData(["admin-usage-metrics", "all"], { tokens: 1000 });
    queryClient.setQueryData(["admin-jobs-metrics", "all"], { active: 0, completed: 5, failed: 0 });

    (api as any).mockImplementation((path: string) => {
      if (path === "/auth/me") {
        return Promise.resolve({ platformRole: "admin" });
      }
      if (path.includes("/admin/metrics/overview")) {
        return Promise.resolve({ totalCostMinor: 100, activeConversations: 5 });
      }
      if (path.includes("/admin/metrics/usage")) {
        return Promise.resolve({ tokens: 1000 });
      }
      if (path.includes("/admin/metrics/jobs")) {
        return Promise.resolve({ active: 0, completed: 5, failed: 0 });
      }
      if (path === "/admin/db-schema") {
        return Promise.resolve(mockSchema);
      }
      if (path.includes("/admin/skills")) {
        return Promise.resolve({
          items: [mockSkill],
          totalPages: 1
        });
      }
      if (path === "/admin/retention") {
        return Promise.resolve([]);
      }
      if (path === "/admin/reports") {
        return Promise.resolve([]);
      }
      if (path === "/admin/knowledge-bases") {
        return Promise.resolve([]);
      }
      if (path.includes("/admin/users")) {
        return Promise.resolve({ items: [], totalPages: 1 });
      }
      return Promise.resolve([]);
    });
  });

  it("toggles all database tables checked/unchecked using 'Select All Tables' checkbox", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <MemoryRouter>
            <AdminPage />
          </MemoryRouter>
        </ConfirmProvider>
      </QueryClientProvider>
    );

    // 1. Click on the "System Routing" tab
    const systemTabButton = await screen.findByRole("button", { name: /System Routing/i });
    fireEvent.click(systemTabButton);

    // 2. Wait for the skills list to load and find the "Manage versions" button for "Mock Skill"
    const manageVersionsButton = await screen.findByTitle("Manage versions");
    fireEvent.click(manageVersionsButton);

    // 3. Drawer should be open, find and click "Configure Context..." button
    const configureContextButton = await screen.findByRole("button", { name: /Configure Context\.\.\./i });
    fireEvent.click(configureContextButton);

    // 4. Modal is now open. Verify that "Select All Tables" is unchecked because only Project is selected by default
    const selectAllCheckbox = (await screen.findByLabelText("Select All Tables")) as HTMLInputElement;
    expect(selectAllCheckbox).toBeInTheDocument();
    expect(selectAllCheckbox.checked).toBe(false);

    const projectCheckbox = screen.getByLabelText("Project") as HTMLInputElement;
    const personaCheckbox = screen.getByLabelText("Persona") as HTMLInputElement;
    expect(projectCheckbox.checked).toBe(true);
    expect(personaCheckbox.checked).toBe(false);

    // 5. Click "Select All Tables" checkbox to check all tables
    fireEvent.click(selectAllCheckbox);
    expect(selectAllCheckbox.checked).toBe(true);
    expect(projectCheckbox.checked).toBe(true);
    expect(personaCheckbox.checked).toBe(true);

    // 6. Click "Select All Tables" checkbox again to uncheck all tables
    fireEvent.click(selectAllCheckbox);
    expect(selectAllCheckbox.checked).toBe(false);
    expect(projectCheckbox.checked).toBe(false);
    expect(personaCheckbox.checked).toBe(false);
  }, 15000);
});
