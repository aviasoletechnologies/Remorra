import { Button } from "../../components/ui";
import { DataTable, RoleBadge, StatusBadge, TableToolbar } from "../../components/app-ui";
import { AdminShellSection } from "../../components/admin-ui";

export function AdminUsers({
  users,
  page,
  totalPages,
  isAdmin,
  setPage,
  onUpdateRole,
}: {
  users: any[];
  page: number;
  totalPages: number;
  isAdmin: boolean;
  setPage: (updater: (page: number) => number) => void;
  onUpdateRole: (id: string, platformRole: string) => void;
}) {
  return (
    <AdminShellSection
      title="Platform users"
      description="Manage user accounts and assign platform administrative or support privileges."
    >
      <TableToolbar title="User directory" description="Platform roles do not grant implicit customer project access." />
      <DataTable
        rows={users}
        getRowKey={(row: any) => row.id}
        minWidth={760}
        emptyTitle="No users"
        emptyDescription="No platform users were returned for this page."
        columns={[
          {
            key: "name",
            header: "Preferred name",
            cell: (row: any) => <strong>{row.preferredName || row.email.split("@")[0]}</strong>,
          },
          { key: "email", header: "Email", cell: (row: any) => row.email },
          { key: "status", header: "Status", cell: (row: any) => <StatusBadge status={row.status} /> },
          {
            key: "role",
            header: "Platform role",
            cell: (row: any) => (
              <div className="flex items-center gap-2">
                <RoleBadge role={row.platformRole} />
                <select
                  value={row.platformRole}
                  onChange={(event) => onUpdateRole(row.id, event.target.value)}
                  disabled={!isAdmin}
                  className="admin-select max-w-36"
                >
                  <option value="user">User</option>
                  <option value="support">Support</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ),
          },
        ]}
      />

      <div className="pagination-controls">
        <Button variant="secondary" onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page <= 1}>
          Previous
        </Button>
        <span className="pagination-info">Page {page} of {totalPages}</span>
        <Button variant="secondary" onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </AdminShellSection>
  );
}
