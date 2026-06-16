import { Button } from "../../components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
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
                <Select
                  value={row.platformRole}
                  onValueChange={(val) => onUpdateRole(row.id, val ?? "")}
                  disabled={!isAdmin}
                >
                  <SelectTrigger className="max-w-36" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
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
