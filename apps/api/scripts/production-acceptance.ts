import { createClient } from "@supabase/supabase-js";
import { createPrismaClient } from "@remorra/database";

const apiBase = process.env.E2E_API_URL ?? "http://localhost:3001/api/v1";
process.env.DATABASE_POOL_MAX ??= "1";
process.env.PG_BOSS_POOL_MAX ??= "1";
const primaryEmail = required("E2E_PRIMARY_EMAIL");
const primaryPassword = required("E2E_PRIMARY_PASSWORD");
const fixturePassword = process.env.E2E_FIXTURE_PASSWORD ?? "RemorraE2E!2026";
const suffix = "20260615";
const emails = {
  team: `remorra.e2e.team.${suffix}@example.com`,
  supplier: `remorra.e2e.supplier.${suffix}@example.com`,
  admin: `remorra.e2e.admin.${suffix}@example.com`,
  gdpr: `remorra.e2e.gdpr.${suffix}@example.com`,
};

const supabaseUrl = required("SUPABASE_URL");
const anon = createClient(supabaseUrl, required("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = createClient(
  supabaseUrl,
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const prisma = createPrismaClient(required("DATABASE_URL"));

async function main() {
  const mode = process.argv[2] ?? "all";
  await prisma.$connect();
  try {
    const founder = await signIn(primaryEmail, primaryPassword);
    const project = await ensureFounderFixture(founder.user.id, founder.token);
    const users = await ensureRoleUsers(project.id);
    if (mode === "setup") {
      printFixture(project.id);
      return;
    }
    if (mode === "all" || mode === "api") {
      await runRoleAcceptance(project.id, founder.token, users);
      await runLoadAcceptance(founder.token);
    }
    if (mode === "all" || mode === "gdpr") {
      await runGdprAcceptance();
    }
    if (mode === "cleanup") {
      await cleanupRoleUsers();
    }
    printFixture(project.id);
  } finally {
    await prisma.$disconnect();
  }
}

async function ensureFounderFixture(userId: string, token: string) {
  const projects = await request<any[]>(token, "/projects");
  const project =
    projects[0] ??
    (await request<any>(token, "/projects", {
      method: "POST",
      body: JSON.stringify({ name: "Remorra Production Acceptance" }),
    }));
  const existingNeed = await prisma.userNeed.findFirst({
    where: { projectId: project.id },
  });
  if (!existingNeed) {
    await prisma.$transaction(async (tx: any) => {
      const ambition = await tx.ambition.create({
        data: {
          projectId: project.id,
          title: "Prove connected product delivery",
          detail: "Validate Remorra end to end.",
        },
      });
      const okr = await tx.okr.create({
        data: {
          projectId: project.id,
          ambitionId: ambition.id,
          objective: "Complete production acceptance",
          keyResults: ["All role journeys pass"],
        },
      });
      const persona = await tx.persona.create({
        data: {
          projectId: project.id,
          name: "Non-technical founder",
          description: "Needs traceable product decisions.",
        },
      });
      await tx.okrPersona.create({
        data: { okrId: okr.id, personaId: persona.id },
      });
      await tx.painPoint.create({
        data: {
          projectId: project.id,
          personaId: persona.id,
          statement: "Product decisions become disconnected from delivery.",
        },
      });
      const need = await tx.userNeed.create({
        data: {
          projectId: project.id,
          personaId: persona.id,
          statement: "Keep product intent linked to execution.",
        },
      });
      const story = await tx.userStory.create({
        data: {
          projectId: project.id,
          userNeedId: need.id,
          title: "Trace a decision into delivery",
          acceptance: ["A task retains its User Need parent"],
        },
      });
      const now = new Date();
      const cycle = await tx.cycle.create({
        data: {
          projectId: project.id,
          name: "Production acceptance",
          status: "active",
          isBuildCycle: true,
          startsAt: now,
          endsAt: new Date(now.getTime() + 14 * 86400000),
        },
      });
      await tx.task.create({
        data: {
          projectId: project.id,
          storyId: story.id,
          cycleId: cycle.id,
          title: "Verify role-restricted delivery",
        },
      });
    });
  }
  await prisma.profile.update({
    where: { id: userId },
    data: {
      privacyPolicyVersion: "2026-06-15",
      termsVersion: "2026-06-15",
      consentedAt: new Date(),
    },
  });
  return project;
}

async function ensureRoleUsers(projectId: string) {
  const team = await ensureUser(emails.team, "user");
  const supplier = await ensureUser(emails.supplier, "user");
  const admin = await ensureUser(emails.admin, "admin");
  await prisma.projectMembership.upsert({
    where: { projectId_userId: { projectId, userId: team.id } },
    create: { projectId, userId: team.id, role: "team" },
    update: { role: "team" },
  });
  await prisma.projectMembership.upsert({
    where: { projectId_userId: { projectId, userId: supplier.id } },
    create: { projectId, userId: supplier.id, role: "supplier" },
    update: { role: "supplier" },
  });
  const task = await prisma.task.findFirstOrThrow({ where: { projectId } });
  await prisma.task.update({
    where: { id: task.id },
    data: { assigneeId: supplier.id },
  });
  return { team, supplier, admin };
}

async function runRoleAcceptance(
  projectId: string,
  founderToken: string,
  users: Record<"team" | "supplier" | "admin", { id: string }>,
) {
  const team = await signIn(emails.team, fixturePassword);
  const supplier = await signIn(emails.supplier, fixturePassword);
  const admin = await signIn(emails.admin, fixturePassword);

  await expectStatus(founderToken, `/projects/${projectId}/venture`, 200);
  await expectStatus(founderToken, `/projects/${projectId}/product-pack`, 200);
  await expectStatus(founderToken, `/projects/${projectId}/linkage`, 200);
  const publish = await request<any>(founderToken, "/evolve/sessions", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      mode: "publish",
      topic: "Production acceptance publish guard",
      launchedFrom: "/acceptance",
    }),
  });
  await expectStatus(
    founderToken,
    `/evolve/sessions/${publish.id}/messages`,
    403,
    { method: "POST", body: JSON.stringify({ content: "must fail" }) },
  );

  await expectStatus(team.token, `/projects/${projectId}/venture`, 200);
  await expectStatus(
    team.token,
    "/evolve/sessions",
    403,
    {
      method: "POST",
      body: JSON.stringify({
        projectId,
        mode: "ideate",
        topic: "Team must not create Evolve",
        launchedFrom: "/acceptance",
      }),
    },
  );
  await expectStatus(
    team.token,
    `/projects/${projectId}/invitations`,
    403,
    {
      method: "POST",
      body: JSON.stringify({ email: "denied@example.com", role: "team" }),
    },
  );

  const supplierVenture = await request<any>(
    supplier.token,
    `/projects/${projectId}/venture`,
  );
  assert(supplierVenture.role === "supplier", "Supplier role was not resolved.");
  assert(
    supplierVenture.tasks.every((task: any) => task.assigneeId === users.supplier.id),
    "Supplier received an unassigned task.",
  );
  assert(supplierVenture.stories.length === 0, "Supplier received strategic stories.");
  await expectStatus(
    supplier.token,
    `/projects/${projectId}/health-score/calculate`,
    403,
    { method: "POST" },
  );
  await expectStatus(
    supplier.token,
    `/projects/${projectId}/tasks`,
    403,
    {
      method: "POST",
      body: JSON.stringify({ storyId: "00000000-0000-0000-0000-000000000000", title: "Denied" }),
    },
  );

  await expectStatus(admin.token, "/admin/metrics", 200);
  await expectStatus(team.token, "/admin/metrics", 403);

  const foreignProject = await prisma.project.create({
    data: { ownerId: users.admin.id, name: "Cross-tenant denial fixture" },
  });
  await expectStatus(founderToken, `/projects/${foreignProject.id}`, 403);
  await prisma.project.delete({ where: { id: foreignProject.id } });

  const first = await request<any>(
    founderToken,
    `/projects/${projectId}/health-score/calculate`,
    { method: "POST" },
  );
  const second = await request<any>(
    founderToken,
    `/projects/${projectId}/health-score/calculate`,
    { method: "POST" },
  );
  assert(first.id === second.id, "Duplicate health-score command created a second job.");
  console.log("role acceptance: passed");
}

async function runLoadAcceptance(token: string) {
  const started = Date.now();
  const total = Number(process.env.E2E_LOAD_REQUESTS ?? 45);
  const concurrency = Number(process.env.E2E_LOAD_CONCURRENCY ?? 6);
  const results: Array<{ ok: boolean; duration: number; status: number }> = [];
  const items = Array.from({ length: total }, (_, index) => index);
  for (let offset = 0; offset < items.length; offset += concurrency) {
    const batch = items.slice(offset, offset + concurrency);
    results.push(
      ...(await Promise.all(
        batch.map(async (index) => {
      const start = Date.now();
      const path = index % 3 === 0 ? "/health" : index % 3 === 1 ? "/projects" : "/auth/me";
      const response = await fetch(`${apiBase}${path}`, {
        headers: path === "/health" ? {} : { authorization: `Bearer ${token}` },
      });
      return { ok: response.ok, duration: Date.now() - start, status: response.status };
        }),
      )),
    );
  }
  const durations = results.map((result) => result.duration).sort((a, b) => a - b);
  const failures = results.filter((result) => !result.ok);
  assert(failures.length === 0, `Load probe had ${failures.length} failures.`);
  console.log(
    `load acceptance: passed (${results.length} requests, p95 ${durations[Math.floor(durations.length * 0.95)]} ms, total ${Date.now() - started} ms)`,
  );
}

async function runGdprAcceptance() {
  const gdpr = await ensureUser(emails.gdpr, "user");
  const session = await signIn(emails.gdpr, fixturePassword);
  const created = await request<any>(session.token, "/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Disposable GDPR acceptance" }),
  });
  await request(session.token, "/users/me/export", { method: "POST" });
  await poll(async () => {
    const latest = await request<any>(session.token, "/users/me/export");
    return latest?.status === "completed" && Boolean(latest.downloadUrl);
  }, 120_000, "GDPR export did not complete.");

  await request(session.token, "/users/me/deletion", { method: "POST" });
  await request(session.token, "/users/me/deletion", { method: "DELETE" });
  const active = await prisma.profile.findUniqueOrThrow({ where: { id: gdpr.id } });
  assert(active.status === "active", "Deletion cancellation did not restore active status.");

  const deletion = await request<any>(session.token, "/users/me/deletion", {
    method: "POST",
  });
  await prisma.deletionRequest.update({
    where: { id: deletion.request.id },
    data: { executeAt: new Date(Date.now() - 1000) },
  });
  const job = await prisma.jobRecord.findUniqueOrThrow({
    where: { id: deletion.job.id },
  });
  const { PgBoss } = await import("pg-boss");
  const boss = new PgBoss({
    connectionString: required("DATABASE_URL"),
    max: 1,
  });
  await boss.start();
  await boss.send("gdpr.delete", {
    ...(job.payload as object),
    jobRecordId: job.id,
  });
  await boss.stop({ graceful: true });
  await poll(async () => {
    const profile = await prisma.profile.findUnique({ where: { id: gdpr.id } });
    return profile?.status === "deleted";
  }, 120_000, "Disposable GDPR deletion did not complete.");
  const { error } = await anon.auth.signInWithPassword({
    email: emails.gdpr,
    password: fixturePassword,
  });
  assert(Boolean(error), "Deleted Auth identity can still sign in.");
  const project = await prisma.project.findUnique({ where: { id: created.id } });
  assert(project === null, "Owned tenant data survived final deletion.");
  console.log("GDPR acceptance: passed");
}

async function ensureUser(email: string, platformRole: "user" | "admin") {
  const existing = await prisma.profile.findUnique({ where: { email } });
  if (existing) {
    await prisma.profile.update({
      where: { id: existing.id },
      data: { platformRole, status: "active" },
    });
    return existing;
  }
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: fixturePassword,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
  return prisma.profile.create({
    data: {
      id: data.user.id,
      email,
      preferredName: email.split("@")[0],
      platformRole,
      privacyPolicyVersion: "2026-06-15",
      termsVersion: "2026-06-15",
      consentedAt: new Date(),
    },
  });
}

async function cleanupRoleUsers() {
  for (const email of [emails.team, emails.supplier, emails.admin]) {
    const profile = await prisma.profile.findUnique({ where: { email } });
    if (!profile) continue;
    await prisma.project.deleteMany({ where: { ownerId: profile.id } });
    await prisma.profile.delete({ where: { id: profile.id } });
    await service.auth.admin.deleteUser(profile.id);
  }
  console.log("fixture cleanup: passed");
}

async function signIn(email: string, password: string) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw error ?? new Error(`Sign-in failed for ${email}`);
  return { token: data.session.access_token, user: data.user };
}

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function expectStatus(
  token: string,
  path: string,
  expected: number,
  init: RequestInit = {},
) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${init.method ?? "GET"} ${path}: expected ${expected}, received ${response.status}: ${body}`);
  }
}

async function poll(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  error: string,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(error);
}

function printFixture(projectId: string) {
  console.log(
    JSON.stringify({
      projectId,
      emails: { team: emails.team, supplier: emails.supplier, admin: emails.admin },
    }),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
