import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge, Button, Card, Textarea } from "../../components/ui";
import { DataTable, DangerZone, EmptyState, FormActions, FormGrid, TableToolbar } from "../../components/app-ui";
import { AdminEditorCard, AdminShellSection } from "../../components/admin-ui";

export function AdminTemplates({
  templates,
  selectedTemplate,
  selectedTemplateId,
  isAdmin,
  templateHtml,
  templateCss,
  templateSchemaText,
  sampleJsonText,
  previewHtml,
  validationError,
  onSelectTemplate,
  onTemplateHtml,
  onTemplateCss,
  onTemplateSchema,
  onSampleJson,
  onPreview,
  onCreateVersion,
  onActivateVersion,
}: {
  templates: any[];
  selectedTemplate: any;
  selectedTemplateId: string | null;
  isAdmin: boolean;
  templateHtml: string;
  templateCss: string;
  templateSchemaText: string;
  sampleJsonText: string;
  previewHtml: string | null;
  validationError: string | null;
  onSelectTemplate: (template: any) => void;
  onTemplateHtml: (value: string) => void;
  onTemplateCss: (value: string) => void;
  onTemplateSchema: (value: string) => void;
  onSampleJson: (value: string) => void;
  onPreview: () => void;
  onCreateVersion: () => void;
  onActivateVersion: (versionId: string) => void;
}) {
  return (
    <AdminShellSection
      title="Document templates"
      description="Edit versioned HTML, CSS, validation schemas, and preview payloads for generated packs and reports."
    >
      <div className="admin-template-grid">
        <Card className="admin-master-pane">
          <TableToolbar title="Templates" description="Choose a template to edit or preview." />
          <div className="admin-template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`admin-list-item ${selectedTemplateId === template.id ? "active" : ""}`}
                onClick={() => onSelectTemplate(template)}
                type="button"
              >
                <strong>{template.name}</strong>
                <span className="item-meta">
                  <Badge tone="neutral">{template.type}</Badge>
                  <small>{template.id}</small>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {selectedTemplateId && selectedTemplate ? (
          <AdminEditorCard
            title={`Template editor: ${selectedTemplate.name}`}
            description={<>Type: <strong>{selectedTemplate.type}</strong></>}
          >
            {!isAdmin ? (
              <DangerZone
                title="Read-only support mode"
                description="Rendering templates can only be changed by a Platform Admin."
                action={<ShieldAlert size={18} />}
              />
            ) : null}

            <FormGrid columns={2}>
              <TemplateField title="HTML layout template">
                <Textarea className="admin-textarea admin-code-textarea" value={templateHtml} onChange={(event) => onTemplateHtml(event.target.value)} disabled={!isAdmin} />
              </TemplateField>
              <TemplateField title="CSS styling template">
                <Textarea className="admin-textarea admin-code-textarea" value={templateCss} onChange={(event) => onTemplateCss(event.target.value)} disabled={!isAdmin} />
              </TemplateField>
              <TemplateField title="Validation contract (JSON Schema)">
                <Textarea className="admin-textarea admin-code-textarea monospace" value={templateSchemaText} onChange={(event) => onTemplateSchema(event.target.value)} disabled={!isAdmin} />
              </TemplateField>
              <TemplateField title="Sample payload">
                <Textarea className="admin-textarea admin-code-textarea monospace" value={sampleJsonText} onChange={(event) => onSampleJson(event.target.value)} />
              </TemplateField>
            </FormGrid>

            {validationError ? (
              <p className="form-message flex items-center gap-2">
                <AlertTriangle size={14} /> {validationError}
              </p>
            ) : null}

            <FormActions>
              <Button variant="secondary" onClick={onPreview}>Test and render HTML</Button>
              {isAdmin ? <Button onClick={onCreateVersion}>Create version</Button> : null}
            </FormActions>

            {previewHtml ? (
              <section className="grid gap-3">
                <h3 className="m-0 text-sm font-bold">Live report render preview</h3>
                <div className="admin-preview-box" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </section>
            ) : null}

            <section className="grid gap-3">
              <TableToolbar title="Available versions" />
              <DataTable
                rows={selectedTemplate.versions ?? []}
                getRowKey={(row: any) => row.id}
                minWidth={640}
                emptyTitle="No versions"
                emptyDescription="This template has no version records."
                columns={[
                  { key: "version", header: "Version", cell: (row: any) => <strong>v{row.version}</strong> },
                  { key: "created", header: "Created", cell: (row: any) => <small>{new Date(row.createdAt).toLocaleString()}</small> },
                  { key: "state", header: "State", cell: (row: any) => <Badge tone={row.active ? "green" : "neutral"}>{row.active ? "active" : "inactive"}</Badge> },
                  {
                    key: "actions",
                    header: "Actions",
                    cell: (row: any) => !row.active && isAdmin ? (
                      <Button variant="secondary" onClick={() => onActivateVersion(row.id)}>Activate version</Button>
                    ) : null,
                  },
                ]}
              />
            </section>
          </AdminEditorCard>
        ) : (
          <EmptyState title="Select a template" description="Choose a template from the list to edit, preview, and manage versions." />
        )}
      </div>
    </AdminShellSection>
  );
}

function TemplateField({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="template-field">
      <h3 className="m-0 text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
