# Mutually Exclusive Context Assembly Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the admin from selecting both Project Database Tables and Previous Skill Conversations at the same time. The UI should disable/dim the opposing section and clear its state.

**Architecture:** We will implement mutual exclusivity at the UI level in both the Edit and Create context config modals. If any database tables are selected, the Previous Skill Conversations card will be disabled and dimmed. Conversely, if Previous Skill Conversations is checked, the Project Database Tables card and all its nested column selection inputs will be disabled and dimmed. The state changes will automatically clear the opposing fields (`skills` or `tables`) to guarantee database configuration integrity.

**Tech Stack:** React, Tailwind CSS/Vanilla CSS, TypeScript

## Global Constraints
- Maintain strict type safety.
- Symmetrically update both the **Create Skill** and **Edit Skill Version** modals.
- Verify all changes compile using `pnpm typecheck`.

---

### Task 1: Update Edit Skill Version Context Modal for Mutual Exclusivity

**Files:**
- Modify: `apps/web/src/pages/admin.tsx`

**Interfaces:**
- Consumes: `editInputSourceMap` state.
- Produces: Updates `editInputSourceMap.skills` and `editInputSourceMap.tables` as mutually exclusive structures.

- [ ] **Step 1: Update the Edit modal Previous Skill checkbox card**
  Modify the Skills selection container in [admin.tsx:L1091-1134](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L1091-L1134) to dim/disable when tables are selected, and clear tables state when checked.
  Code to implement:
  ```typescript
              {/* Skills selection */}
              <div className={`border border-border rounded-xl p-4 bg-card h-fit ${Object.keys(editInputSourceMap?.tables || {}).length > 0 ? "opacity-50" : ""}`}>
                <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <span>Previous skill Conversations</span>
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select if the previous skill's conversation history should be passed as input context.
                </p>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                  <label className={`flex items-center gap-2 text-sm p-1.5 rounded ${Object.keys(editInputSourceMap?.tables || {}).length > 0 ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/10"}`}>
                    <input
                      type="checkbox"
                      checked={editInputSourceMap?.skills?.includes("@previous") || false}
                      disabled={Object.keys(editInputSourceMap?.tables || {}).length > 0}
                      onChange={(e) => {
                        const skills = [...(editInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                        let tables = { ...(editInputSourceMap?.tables || {}) };
                        if (e.target.checked) {
                          skills.push("@previous");
                          tables = {};
                        }
                        setEditInputSourceMap({ ...editInputSourceMap, skills, tables });
                      }}
                      className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-medium text-foreground">Previous skill Conversations</span>
                      <span className="text-xs text-muted-foreground block font-mono">Include conversation history of the previous skill in the flow</span>
                    </div>
                  </label>
                </div>
              </div>
  ```

- [ ] **Step 2: Update the Edit modal Project Database Tables card**
  Modify [admin.tsx:L1136-1188](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L1136-L1188) to dim/disable when `@previous` is configured, and clear skills state when tables or columns are selected.
  Code to implement:
  ```typescript
              {/* Project Tables & Columns selection */}
              <div className={`border border-border rounded-xl p-4 bg-card h-fit ${editInputSourceMap?.skills?.includes("@previous") ? "opacity-50" : ""}`}>
                <h4 className="text-sm font-semibold mb-1">Project Database Tables</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select database tables and optionally check specific columns to include in the context.
                </p>
                <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                  {Object.entries(dbSchema || {}).map(([tableName, columns]) => {
                    const selectedCols = editInputSourceMap?.tables?.[tableName] || [];
                    const isTableSelected = tableName in (editInputSourceMap?.tables || {});
                    
                    return (
                      <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                        <label className={`flex items-center gap-2 text-sm font-medium p-1 rounded text-foreground ${editInputSourceMap?.skills?.includes("@previous") ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/10"}`}>
                          <input
                            type="checkbox"
                            checked={isTableSelected}
                            disabled={editInputSourceMap?.skills?.includes("@previous")}
                            onChange={(e) => {
                              const tables = { ...(editInputSourceMap?.tables || {}) };
                              const skills = [...(editInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                              if (e.target.checked) {
                                tables[tableName] = [];
                              } else {
                                delete tables[tableName];
                              }
                              setEditInputSourceMap({ ...editInputSourceMap, skills, tables });
                            }}
                            className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                          />
                          <span>{tableName}</span>
                        </label>

                        {isTableSelected && (
                          <div className="pl-6 pt-2 flex flex-col gap-2 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                              Columns (empty = all columns)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              {columns.map((col) => {
                                const isColChecked = selectedCols.includes(col);
                                return (
                                  <label key={col} className={`flex items-center gap-2 text-xs p-1 rounded text-foreground ${editInputSourceMap?.skills?.includes("@previous") ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/20"}`}>
                                    <input
                                      type="checkbox"
                                      checked={isColChecked}
                                      disabled={editInputSourceMap?.skills?.includes("@previous")}
                                      onChange={(e) => {
                                        const tables = { ...(editInputSourceMap?.tables || {}) };
                                        const skills = [...(editInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                                        let cols = [...(tables[tableName] || [])];
                                        if (e.target.checked) {
                                          cols.push(col);
                                        } else {
                                          cols = cols.filter((c) => c !== col);
                                        }
                                        tables[tableName] = cols;
                                        setEditInputSourceMap({ ...editInputSourceMap, skills, tables });
                                      }}
                                      className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                    />
                                    <span className="font-mono">{col}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
  ```

---

### Task 2: Update Create Skill Context Modal for Mutual Exclusivity

**Files:**
- Modify: `apps/web/src/pages/admin.tsx`

**Interfaces:**
- Consumes: `newSkillInputSourceMap` state.
- Produces: Updates `newSkillInputSourceMap.skills` and `newSkillInputSourceMap.tables` as mutually exclusive structures.

- [ ] **Step 1: Update the Create modal Previous Skill checkbox card**
  Modify the Skills selection container in [admin.tsx:L1214-1241](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L1214-L1241) to dim/disable when tables are selected, and clear tables state when checked.
  Code to implement:
  ```typescript
              {/* Skills selection */}
              <div className={`border border-border rounded-xl p-4 bg-card h-fit ${Object.keys(newSkillInputSourceMap?.tables || {}).length > 0 ? "opacity-50" : ""}`}>
                <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <span>Previous skill Conversations</span>
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select if the previous skill's conversation history should be passed as input context.
                </p>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                  <label className={`flex items-center gap-2 text-sm p-1.5 rounded ${Object.keys(newSkillInputSourceMap?.tables || {}).length > 0 ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/10"}`}>
                    <input
                      type="checkbox"
                      checked={newSkillInputSourceMap?.skills?.includes("@previous") || false}
                      disabled={Object.keys(newSkillInputSourceMap?.tables || {}).length > 0}
                      onChange={(e) => {
                        const skills = [...(newSkillInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                        let tables = { ...(newSkillInputSourceMap?.tables || {}) };
                        if (e.target.checked) {
                          skills.push("@previous");
                          tables = {};
                        }
                        setNewSkillInputSourceMap({ ...newSkillInputSourceMap, skills, tables });
                      }}
                      className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-medium text-foreground">Previous skill Conversations</span>
                      <span className="text-xs text-muted-foreground block font-mono">Include conversation history of the previous skill in the flow</span>
                    </div>
                  </label>
                </div>
              </div>
  ```

- [ ] **Step 2: Update the Create modal Project Database Tables card**
  Modify [admin.tsx:L1243-1311](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L1243-L1311) to dim/disable when `@previous` is configured, and clear skills state when tables or columns are selected.
  Code to implement:
  ```typescript
              {/* Project Tables & Columns selection */}
              <div className={`border border-border rounded-xl p-4 bg-card h-fit ${newSkillInputSourceMap?.skills?.includes("@previous") ? "opacity-50" : ""}`}>
                <h4 className="text-sm font-semibold mb-1">Project Database Tables</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select database tables and optionally check specific columns to include in the context.
                </p>
                <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                  {Object.entries(dbSchema || {}).map(([tableName, columns]) => {
                    const isTableSelected = newSkillInputSourceMap?.tables && tableName in newSkillInputSourceMap.tables;
                    const selectedCols = newSkillInputSourceMap?.tables?.[tableName] || [];
                    
                    return (
                      <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                        <label className={`flex items-center gap-2 text-sm font-medium p-1 rounded text-foreground ${newSkillInputSourceMap?.skills?.includes("@previous") ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/10"}`}>
                          <input
                            type="checkbox"
                            checked={isTableSelected}
                            disabled={newSkillInputSourceMap?.skills?.includes("@previous")}
                            onChange={(e) => {
                              const tables = { ...(newSkillInputSourceMap?.tables || {}) };
                              const skills = [...(newSkillInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                              if (e.target.checked) {
                                tables[tableName] = [];
                              } else {
                                delete tables[tableName];
                              }
                              setNewSkillInputSourceMap({ ...newSkillInputSourceMap, skills, tables });
                            }}
                            className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                          />
                          <span>{tableName}</span>
                        </label>

                        {isTableSelected && (
                          <div className="pl-6 pt-2 flex flex-col gap-2 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                              Columns (empty = all columns)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              {columns.map((col) => {
                                const isColChecked = selectedCols.includes(col);
                                return (
                                  <label key={col} className={`flex items-center gap-2 text-xs p-1 rounded text-foreground ${newSkillInputSourceMap?.skills?.includes("@previous") ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/20"}`}>
                                    <input
                                      type="checkbox"
                                      checked={isColChecked}
                                      disabled={newSkillInputSourceMap?.skills?.includes("@previous")}
                                      onChange={(e) => {
                                        const tables = { ...(newSkillInputSourceMap?.tables || {}) };
                                        const skills = [...(newSkillInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                                        let cols = [...(tables[tableName] || [])];
                                        if (e.target.checked) {
                                          cols.push(col);
                                        } else {
                                          cols = cols.filter((c) => c !== col);
                                        }
                                        tables[tableName] = cols;
                                        setNewSkillInputSourceMap({ ...newSkillInputSourceMap, skills, tables });
                                      }}
                                      className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                    />
                                    <span className="font-mono">{col}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
  ```

---

### Task 3: Verification

- [ ] **Step 1: Run typecheck**
  Run: `pnpm --filter @remorra/web typecheck`
  Expected: Clean build.

- [ ] **Step 2: Run all tests**
  Run: `pnpm test`
  Expected: All tests pass.
