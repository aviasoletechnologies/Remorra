import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  ActionLink,
  AppTabs,
  DataTable,
  EmptyState,
  FieldGroup,
  PageHeader,
  StatusBadge,
  PageSkeleton,
  CardSkeleton,
  MetricGridSkeleton,
  RichTableSkeleton,
  FormSkeleton,
  ChatWorkspaceSkeleton,
  KanbanSkeleton,
  AdminConsoleSkeleton,
} from "./app-ui";

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

  it("renders semantic data tables and empty table states", () => {
    render(
      <DataTable
        rows={[{ id: "one", name: "Founder Pack" }]}
        getRowKey={(row) => row.id}
        columns={[
          { key: "name", header: "Name", cell: (row) => row.name },
        ]}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Founder Pack" })).toBeInTheDocument();
  });

  it("handles tab changes with accessible tab roles", () => {
    const onChange = vi.fn();
    render(
      <AppTabs
        value="overview"
        onChange={onChange}
        items={[
          { value: "overview", label: "Overview" },
          { value: "jobs", label: "Jobs" },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Jobs" }));
    expect(onChange).toHaveBeenCalledWith("jobs");
  });

  it("renders form field labels, descriptions, errors, and status badges", () => {
    render(
      <>
        <FieldGroup label="Skill name" description="Visible in Admin" error="Required">
          <input />
        </FieldGroup>
        <StatusBadge status="failed" />
      </>,
    );

    expect(screen.getByText("Skill name")).toBeInTheDocument();
    expect(screen.getByText("Visible in Admin")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("renders premium skeletons with animation container", () => {
    const { container: pageCont } = render(<PageSkeleton />);
    expect(pageCont.firstChild).toHaveClass("animate-pulse");

    const { container: cardCont } = render(<CardSkeleton rows={3} />);
    expect(cardCont.querySelector(".animate-pulse")).toBeInTheDocument();

    const { container: metricsCont } = render(<MetricGridSkeleton count={4} />);
    expect(metricsCont.querySelectorAll(".metric-card").length).toBe(4);

    const { container: tableCont } = render(<RichTableSkeleton rows={4} columns={3} />);
    expect(tableCont.querySelector("table")).toBeInTheDocument();

    const { container: formCont } = render(<FormSkeleton fieldsCount={2} />);
    expect(formCont.querySelectorAll(".field-group").length).toBe(2);

    const { container: chatCont } = render(<ChatWorkspaceSkeleton />);
    expect(chatCont.querySelector(".chat-skeleton-messages")).toBeInTheDocument();

    const { container: kanbanCont } = render(<KanbanSkeleton />);
    expect(kanbanCont.querySelector(".animate-pulse")).toBeInTheDocument();

    const { container: adminCont } = render(<AdminConsoleSkeleton />);
    expect(adminCont.querySelector(".admin-tabbar")).toBeInTheDocument();
  });
});
