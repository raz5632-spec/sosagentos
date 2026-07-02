import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ROLES = [
  { code: "owner", description: "CEO / owner — full authority, L3 approver" },
  { code: "manager", description: "Operations manager — L2 approver" },
  { code: "coach", description: "Sales coach — student-facing operations" },
  { code: "student", description: "S.O.S. student" },
];

const AGENTS = [
  { code: "supreme_orchestrator", department: "executive" },
  { code: "ceo_interface", department: "executive" },
  { code: "project_manager", department: "executive" },
  { code: "model_router", department: "runtime" },
  { code: "brand_dna", department: "dna" },
  { code: "knowledge_intake", department: "knowledge" },
  { code: "knowledge_curator", department: "knowledge" },
  { code: "knowledge_graph", department: "knowledge" },
  { code: "student_intelligence", department: "student" },
  { code: "coach_support", department: "student" },
  { code: "lesson", department: "education" },
  { code: "assignment_review", department: "education" },
  { code: "research", department: "research" },
  { code: "competitor_intelligence", department: "research" },
  { code: "opportunity", department: "research" },
  { code: "content_strategy", department: "content" },
  { code: "copy", department: "content" },
  { code: "design_brief", department: "content" },
  { code: "publishing_readiness", department: "content" },
  { code: "communications", department: "communications" },
  { code: "analytics", department: "analytics" },
  { code: "digital_twin", department: "analytics" },
  { code: "automation", department: "automation" },
  { code: "integration", department: "integration" },
  { code: "security_compliance", department: "security" },
  { code: "quality_review", department: "quality" },
  { code: "learning_promotion", department: "knowledge" },
];

async function main() {
  const org = await db.organization.upsert({
    where: { slug: "sos" },
    update: {},
    create: { name: "S.O.S. Sales Coaching", slug: "sos", packageType: "core" },
  });

  for (const role of ROLES) {
    await db.role.upsert({ where: { code: role.code }, update: {}, create: role });
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await db.user.upsert({
    where: { email: "raz5632@gmail.com" },
    update: { passwordHash },
    create: { email: "raz5632@gmail.com", displayName: "Raz (CEO)", passwordHash },
  });

  const ownerRole = await db.role.findUniqueOrThrow({ where: { code: "owner" } });
  await db.membership.upsert({
    where: { orgId_userId_roleId: { orgId: org.id, userId: admin.id, roleId: ownerRole.id } },
    update: {},
    create: { orgId: org.id, userId: admin.id, roleId: ownerRole.id },
  });

  for (const agent of AGENTS) {
    await db.agent.upsert({ where: { code: agent.code }, update: {}, create: agent });
  }

  await db.auditEvent.create({
    data: {
      orgId: org.id,
      actorType: "system",
      actorId: "seed",
      action: "seed.completed",
      subjectType: "organization",
      subjectId: org.id,
    },
  });

  console.log(`Seed complete: org=${org.slug}, admin=${admin.email}, roles=${ROLES.length}, agents=${AGENTS.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
