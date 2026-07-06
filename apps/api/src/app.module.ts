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
import { SimulationsModule } from "./simulations/simulations.module.js";
import { WorkflowsModule } from "./workflows/workflows.module.js";
import { WhatsAppModule } from "./integrations/meta/whatsapp.module.js";
import { CanvaModule } from "./integrations/canva/canva.module.js";
import { GoogleModule } from "./integrations/google/google.module.js";
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
    SimulationsModule,
    WorkflowsModule,
    WhatsAppModule,
    CanvaModule,
    GoogleModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
