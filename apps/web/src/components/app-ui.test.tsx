import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ActionLink, EmptyState, PageHeader } from "./app-ui";

describe("application UI primitives", () => {
  it("renders a structured page heading with actions", () => {
    render(
      <PageHeader
        eyebrow="Project access"
        title="People and permissions"
        description="Roles are resolved per project."
        actions={<button type="button">Invite</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "People and permissions" })).toBeInTheDocument();
    expect(screen.getByText("Roles are resolved per project.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
  });

  it("exposes empty-state content and accessible navigation actions", () => {
    render(
      <MemoryRouter>
        <EmptyState
          title="No reports generated yet"
          description="Create the first immutable output."
          action={<ActionLink to="/reports">Open reports</ActionLink>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "No reports generated yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open reports" })).toHaveAttribute("href", "/reports");
  });
});
