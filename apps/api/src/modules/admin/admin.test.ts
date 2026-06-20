import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdminService } from "./admin.service.js";
import { ForbiddenException, BadRequestException } from "@nestjs/common";

describe("Admin & Support Ops Console Tests", () => {
  let prismaMock: any;
  let queueMock: any;
  let adminService: AdminService;

  beforeEach(() => {
    prismaMock = {
      client: {
        $transaction: vi.fn(async (cb) => cb(prismaMock.client)),
        $queryRaw: vi.fn(),
        profile: {
          count: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
        },
        project: {
          count: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn(),
        },
        jobRecord: {
          count: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn(),
        },
        tokenUsage: {
          aggregate: vi.fn(),
          groupBy: vi.fn(),
        },
        generatedDocument: {
          count: vi.fn(),
          update: vi.fn(),
        },
        storageObject: {
          aggregate: vi.fn(),
          groupBy: vi.fn(),
        },
        costConfig: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn(),
          update: vi.fn(),
        },
        documentTemplate: {
          findMany: vi.fn(),
        },
        documentTemplateVersion: {
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
        auditEvent: {
          findMany: vi.fn(),
        },
        platformAuditEvent: {
          create: vi.fn(),
          findMany: vi.fn(),
        },
        jobAttempt: {
          findMany: vi.fn(),
        },
        retentionPolicy: {
          findMany: vi.fn(),
          update: vi.fn(),
        },
        skillVersion: {
          findFirstOrThrow: vi.fn(),
          findUniqueOrThrow: vi.fn(),
          count: vi.fn(),
          create: vi.fn(),
          delete: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
        skill: {
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          count: vi.fn(),
          update: vi.fn(),
        },
      },
    };

    queueMock = {
      enqueue: vi.fn(),
    };

    adminService = new AdminService(prismaMock as any, queueMock as any);
  });

  describe("Admin/Support Role Restrictions", () => {
    it("allows admin and support for requireAdmin", () => {
      expect(() =>
        adminService.requireAdmin({ platformRole: "admin" } as any),
      ).not.toThrow();
      expect(() =>
        adminService.requireAdmin({ platformRole: "support" } as any),
      ).not.toThrow();
    });

    it("throws ForbiddenException for general users in requireAdmin", () => {
      expect(() =>
        adminService.requireAdmin({ platformRole: "user" } as any),
      ).toThrow(ForbiddenException);
    });

    it("allows only admin in requireWriteAdmin", () => {
      expect(() =>
        adminService.requireWriteAdmin({ platformRole: "admin" } as any),
      ).not.toThrow();
      expect(() =>
        adminService.requireWriteAdmin({ platformRole: "support" } as any),
      ).toThrow(ForbiddenException);
      expect(() =>
        adminService.requireWriteAdmin({ platformRole: "user" } as any),
      ).toThrow(ForbiddenException);
    });
  });

  describe("Metrics & Costs Calculations", () => {
    it("computes overview metrics correctly with custom cost configs", async () => {
      prismaMock.client.profile.count.mockResolvedValue(10);
      prismaMock.client.project.count.mockResolvedValue(5);
      prismaMock.client.jobRecord.count.mockResolvedValue(1);
      prismaMock.client.tokenUsage.aggregate.mockResolvedValue({
        _sum: { inputTokens: 5000, outputTokens: 10000, costMinor: 150 },
      });
      prismaMock.client.generatedDocument.count.mockResolvedValue(4);
      prismaMock.client.storageObject.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 15 * 1024 * 1024 }, // 15 MB
      });

      // Mock PDF config and storage config lookup
      prismaMock.client.costConfig.findFirst.mockImplementation(
        async ({ where }: { where: { key: string } }) => {
          if (where.key === "pdf-render") {
            return { flatCostMinor: 12 };
          }
          if (where.key === "storage-per-mb") {
            return { flatCostMinor: 3 };
          }
          return null;
        },
      );

      // Mock risk projects check (returns 2 projects at risk)
      prismaMock.client.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

      const res = await adminService.getOverviewMetrics({
        platformRole: "admin",
      } as any);

      expect(res.users).toBe(10);
      expect(res.projects).toBe(5);
      expect(res.aiCost).toBe(150); // From tokenUsage.aggregate
      expect(res.pdfCost).toBe(48); // 4 docs * 12 cents = 48 cents
      expect(res.storageCost).toBe(45); // 15 MB * 3 cents = 45 cents
      expect(res.totalCost).toBe(150 + 48 + 45); // 243 cents
      expect(res.configuredRevenue).toBe(5 * 5000); // 5 projects * 5000
      expect(res.margin).toBe(99); // Math.round((25000 - 243) / 25000 * 100) = 99%
      expect(res.riskProjectsCount).toBe(2);
    });

    it("falls back to default pricing metrics when cost configs are missing", async () => {
      prismaMock.client.profile.count.mockResolvedValue(1);
      prismaMock.client.project.count.mockResolvedValue(1);
      prismaMock.client.jobRecord.count.mockResolvedValue(0);
      prismaMock.client.tokenUsage.aggregate.mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0, costMinor: 0 },
      });
      prismaMock.client.generatedDocument.count.mockResolvedValue(2);
      prismaMock.client.storageObject.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 0 },
      });

      // Cost configs return null (fallback to flatCostMinor: 5 for pdf, 2 for storage)
      prismaMock.client.costConfig.findFirst.mockResolvedValue(null);
      prismaMock.client.project.findMany.mockResolvedValue([]);

      const res = await adminService.getOverviewMetrics({
        platformRole: "admin",
      } as any);

      expect(res.aiCost).toBe(0);
      expect(res.pdfCost).toBe(10); // 2 docs * 5 cents = 10 cents
      expect(res.storageCost).toBe(0); // 0 MB * 2 cents = 0 cents
      expect(res.totalCost).toBe(10);
    });
  });

  describe("Support Workspace Redaction & Auditing", () => {
    it("returns project details with private content redacted and creates support audit log", async () => {
      const mockProject = {
        id: "project-1",
        name: "Confidential Project",
        owner: { email: "owner@example.com" },
        memberships: [
          { role: "admin", user: { id: "user-2", email: "user2@example.com", preferredName: "Alice" } },
        ],
        jobs: [
          {
            id: "job-1",
            queue: "ai-generation",
            status: "failed",
            attempts: 1,
            error: "Prompt exceeded safety limits",
            payload: { secretKey: "extremely-secret-value", prompt: "Explain the formula" },
            result: { error: "Something bad happened", traceback: "file.ts line 10" },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      prismaMock.client.project.findUniqueOrThrow.mockResolvedValue(mockProject);
      prismaMock.client.auditEvent.findMany.mockResolvedValue([
        {
          id: "audit-1",
          eventType: "project.update",
          entityType: "project",
          entityId: "project-1",
          createdAt: new Date(),
          metadata: { name: "Confidential Project", updatedBy: "user-2" },
          before: { name: "Old Name" },
          after: { name: "Confidential Project" },
        },
      ]);

      // Mock aggregated usage tokens
      prismaMock.client.tokenUsage.aggregate.mockResolvedValue({
        _sum: { inputTokens: 50, outputTokens: 100 },
      });

      const res = await adminService.getSupportProjectDetails(
        { userId: "support-user-1", platformRole: "support" } as any,
        "project-1",
      );

      // Verify audit trail generated for support view
      expect(prismaMock.client.platformAuditEvent.create).toHaveBeenCalledWith({
        data: {
          actorId: "support-user-1",
          eventType: "platform.support.view",
          targetType: "project",
          targetId: "project-1",
          metadata: { projectId: "project-1" },
        },
      });

      // Verify returned project information
      expect(res.name).toBe("Confidential Project");
      expect(res.ownerEmail).toBe("owner@example.com");

      // Verify redact assertions on job details
      expect(res.recentJobs[0].payload).toBe("[Redacted for Security]");
      expect(res.recentJobs[0].result).toBe("[Redacted for Security]");
      expect(res.recentJobs[0].error).toBe("Prompt exceeded safety limits"); // Diagnostic error message is left intact for support

      // Verify redact assertions on audit logs
      expect(res.recentAudits[0].metadata).toBe("[Redacted for Security]");
      expect(res.recentAudits[0].before).toBe("[Redacted for Security]");
      expect(res.recentAudits[0].after).toBe("[Redacted for Security]");
    });
  });

  describe("Template Versioning & Compilation Previews", () => {
    it("compiles micro-templates successfully and executes AJV schema check", async () => {
      const body = {
        html: "<h1>{{projectName}}</h1><ul>{{#each keyFeatures}}<li>{{this}}</li>{{/each}}</ul>",
        css: "h1 { color: red; }",
        schema: {
          type: "object",
          required: ["projectName", "keyFeatures"],
          properties: {
            projectName: { type: "string" },
            keyFeatures: { type: "array", items: { type: "string" } },
          },
        },
        sampleData: {
          projectName: "Alpha Project",
          keyFeatures: ["Feature A", "Feature B"],
        },
      };

      const res = await adminService.previewTemplate(
        { platformRole: "admin" } as any,
        "founder-pack",
        body,
      );

      // Verify HTML compiles with data substitution and escaped tags
      expect(res.html).toContain("<!doctype html><html><head><meta charset=\"utf-8\"><style>h1 { color: red; }</style></head>");
      expect(res.html).toContain("<h1>Alpha Project</h1><ul><li>Feature A</li><li>Feature B</li></ul></body></html>");
    });

    it("throws BadRequestException when sampleData violates the schema contract during preview", async () => {
      const body = {
        html: "<h1>{{projectName}}</h1>",
        css: "",
        schema: {
          type: "object",
          required: ["projectName"],
          properties: {
            projectName: { type: "string" },
          },
        },
        sampleData: {
          // Missing required 'projectName'
        },
      };

      await expect(
        adminService.previewTemplate(
          { platformRole: "admin" } as any,
          "founder-pack",
          body,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("deactivates older template versions and activates the target version in a transaction", async () => {
      prismaMock.client.documentTemplateVersion.update.mockResolvedValue({
        id: "version-2",
        documentTemplateId: "founder-pack",
        version: 2,
        active: true,
      });

      const res = await adminService.activateTemplateVersion(
        { userId: "admin-1", platformRole: "admin" } as any,
        "founder-pack",
        "version-2",
      );

      // Check transaction updates
      expect(prismaMock.client.documentTemplateVersion.updateMany).toHaveBeenCalledWith({
        where: { documentTemplateId: "founder-pack" },
        data: { active: false },
      });
      expect(prismaMock.client.documentTemplateVersion.update).toHaveBeenCalledWith({
        where: { id: "version-2" },
        data: { active: true },
      });
      expect(prismaMock.client.platformAuditEvent.create).toHaveBeenCalledWith({
        data: {
          actorId: "admin-1",
          eventType: "template.version.activated",
          targetType: "document_template_version",
          targetId: "version-2",
          metadata: { templateId: "founder-pack", version: 2 },
        },
      });
      expect(res.active).toBe(true);
    });
  });

  describe("Dynamic Skills & Event Mappings", () => {
    it("retrieves skills in a paginated structure", async () => {
      prismaMock.client.skill.findMany.mockResolvedValue([{ id: "skill-1", name: "Skill 1", versions: [] }]);
      prismaMock.client.skill.count.mockResolvedValue(1);

      const res = await adminService.skills({ platformRole: "admin" } as any, 1, 10);

      expect(prismaMock.client.skill.findMany).toHaveBeenCalledWith({
        include: { versions: { orderBy: { version: "desc" } } },
        orderBy: { id: "asc" },
        skip: 0,
        take: 10,
      });
      expect(prismaMock.client.skill.count).toHaveBeenCalled();
      expect(res).toEqual({
        items: [{ id: "skill-1", name: "Skill 1", versions: [] }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it("transactionally creates a new skill with active v1 version", async () => {
      prismaMock.client.skill.findUnique.mockResolvedValue(null);
      prismaMock.client.skill.create.mockResolvedValue({
        id: "test-skill",
        name: "Test Skill",
        description: "Test Desc",
      });
      prismaMock.client.skillVersion.create.mockResolvedValue({
        id: "version-1-id",
        skillId: "test-skill",
        version: 1,
        active: true,
      });

      const res = await adminService.createSkill(
        { userId: "admin-1", platformRole: "admin" } as any,
        {
          id: "test-skill",
          name: "Test Skill",
          description: "Test Desc",
          systemPrompt: "Test Prompt",
        },
      );

      expect(prismaMock.client.skill.findUnique).toHaveBeenCalledWith({ where: { id: "test-skill" } });
      expect(prismaMock.client.skill.create).toHaveBeenCalledWith({
        data: {
          id: "test-skill",
          name: "Test Skill",
          description: "Test Desc",
        },
      });
      expect(prismaMock.client.skillVersion.create).toHaveBeenCalledWith({
        data: {
          skillId: "test-skill",
          version: 1,
          active: true,
          systemPrompt: "Test Prompt",
          contextRequirements: {},
          inputSourceMap: {},
          constraints: [],
          examples: [],
          retryPolicy: {},
        },
      });
      expect(prismaMock.client.platformAuditEvent.create).toHaveBeenCalledWith({
        data: {
          actorId: "admin-1",
          eventType: "skill.created",
          targetType: "skill",
          targetId: "test-skill",
          metadata: { name: "Test Skill", version: 1 },
        },
      });
      expect(res.id).toBe("test-skill");
      expect(res.versions[0].version).toBe(1);
    });

    it("throws BadRequestException if skill already exists", async () => {
      prismaMock.client.skill.findUnique.mockResolvedValue({ id: "test-skill" });

      await expect(
        adminService.createSkill(
          { userId: "admin-1", platformRole: "admin" } as any,
          {
            id: "test-skill",
            name: "Test Skill",
            description: "Test Desc",
            systemPrompt: "Test Prompt",
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a new skill version", async () => {
      prismaMock.client.skillVersion.findFirstOrThrow.mockResolvedValue({
        id: "version-1-id",
        skillId: "test-skill",
        version: 1,
        systemPrompt: "Old Prompt",
        contextRequirements: [],
        inputSourceMap: {},
        outputSchema: null,
        constraints: [],
        examples: [],
        retryPolicy: {},
      });
      prismaMock.client.skillVersion.create.mockResolvedValue({
        id: "version-2-id",
        skillId: "test-skill",
        version: 2,
        active: false,
      });

      await adminService.createSkillVersion(
        { userId: "admin-1", platformRole: "admin" } as any,
        "test-skill",
        {
          systemPrompt: "New Prompt",
        },
      );

      expect(prismaMock.client.skillVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          skillId: "test-skill",
          version: 2,
          systemPrompt: "New Prompt",
        }),
      });
    });

    it("creates a new skill version and updates skill name/description if provided", async () => {
      prismaMock.client.skillVersion.findFirstOrThrow.mockResolvedValue({
        id: "version-1-id",
        skillId: "test-skill",
        version: 1,
        systemPrompt: "Old Prompt",
        contextRequirements: [],
        inputSourceMap: {},
        outputSchema: null,
        constraints: [],
        examples: [],
        retryPolicy: {},
      });
      prismaMock.client.skillVersion.create.mockResolvedValue({
        id: "version-2-id",
        skillId: "test-skill",
        version: 2,
        active: false,
      });

      await adminService.createSkillVersion(
        { userId: "admin-1", platformRole: "admin" } as any,
        "test-skill",
        {
          systemPrompt: "New Prompt",
          name: "Updated Skill Name",
          description: "Updated Skill Description",
        },
      );

      expect(prismaMock.client.skill.update).toHaveBeenCalledWith({
        where: { id: "test-skill" },
        data: {
          name: "Updated Skill Name",
          description: "Updated Skill Description",
        },
      });

      expect(prismaMock.client.skillVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          skillId: "test-skill",
          version: 2,
          systemPrompt: "New Prompt",
        }),
      });
    });

    it("updates an existing skill version in place and updates skill name/description if provided", async () => {
      prismaMock.client.skillVersion.findUniqueOrThrow.mockResolvedValue({
        id: "version-2-id",
        skillId: "test-skill",
        version: 2,
        systemPrompt: "Old Prompt",
        contextRequirements: [],
        inputSourceMap: {},
        outputSchema: null,
        constraints: [],
        examples: [],
        retryPolicy: {},
      });
      prismaMock.client.skillVersion.update.mockResolvedValue({
        id: "version-2-id",
        skillId: "test-skill",
        version: 2,
      });

      await adminService.updateSkillVersion(
        { userId: "admin-1", platformRole: "admin" } as any,
        "test-skill",
        "version-2-id",
        {
          systemPrompt: "Updated Prompt",
          name: "Updated Skill Name",
          description: "Updated Skill Description",
        },
      );

      expect(prismaMock.client.skill.update).toHaveBeenCalledWith({
        where: { id: "test-skill" },
        data: {
          name: "Updated Skill Name",
          description: "Updated Skill Description",
        },
      });

      expect(prismaMock.client.skillVersion.update).toHaveBeenCalledWith({
        where: { id: "version-2-id" },
        data: expect.objectContaining({
          systemPrompt: "Updated Prompt",
        }),
      });
    });

    it("deletes an inactive skill version when another version remains", async () => {
      prismaMock.client.skillVersion.findUniqueOrThrow.mockResolvedValue({
        id: "version-2-id",
        skillId: "test-skill",
        version: 2,
        active: false,
      });
      prismaMock.client.skillVersion.count.mockResolvedValue(2);
      prismaMock.client.skillVersion.delete.mockResolvedValue({ id: "version-2-id" });

      const res = await adminService.deleteSkillVersion(
        { userId: "admin-1", platformRole: "admin" } as any,
        "test-skill",
        "version-2-id",
      );

      expect(prismaMock.client.skillVersion.delete).toHaveBeenCalledWith({
        where: { id: "version-2-id" },
      });
      expect(res).toEqual({ success: true });
    });

    it("blocks deleting the active skill version", async () => {
      prismaMock.client.skillVersion.findUniqueOrThrow.mockResolvedValue({
        id: "version-2-id",
        skillId: "test-skill",
        version: 2,
        active: true,
      });

      await expect(
        adminService.deleteSkillVersion(
          { userId: "admin-1", platformRole: "admin" } as any,
          "test-skill",
          "version-2-id",
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.client.skillVersion.delete).not.toHaveBeenCalled();
    });

    it("returns project-related tables and columns dynamically", async () => {
      prismaMock.client.$queryRaw.mockResolvedValue([
        { table_name: "Project", column_name: "name" },
        { table_name: "Project", column_name: "summary" },
        { table_name: "Ambition", column_name: "projectId" },
        { table_name: "Ambition", column_name: "title" },
        { table_name: "IgnoredTable", column_name: "someCol" },
      ]);

      const res = await adminService.getDbSchema({ platformRole: "admin" } as any);

      expect(res).toEqual({
        Project: ["name", "summary"],
        Ambition: ["projectId", "title"],
      });
    });

  });
});
