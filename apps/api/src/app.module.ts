import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { OrgsModule } from "./orgs/orgs.module.js";
import { AgentsModule } from "./agents/agents.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { KnowledgeModule } from "./knowledge/knowledge.module.js";
import { DnaModule } from "./dna/dna.module.js";
import { EducationModule } from "./education/education.module.js";
import { StudentsModule } from "./students/students.module.js";
import { ContentModule } from "./content/content.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { CompetitorsModule } from "./competitors/competitors.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [
    AuthModule,
    OrgsModule,
    AgentsModule,
    ApprovalsModule,
    KnowledgeModule,
    DnaModule,
    EducationModule,
    StudentsModule,
    ContentModule,
    AnalyticsModule,
    CompetitorsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
