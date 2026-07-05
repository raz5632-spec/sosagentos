import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AgentsModule } from "../../agents/agents.module.js";
import { DnaModule } from "../../dna/dna.module.js";
import { KnowledgeModule } from "../../knowledge/knowledge.module.js";
import { AnalyticsModule } from "../../analytics/analytics.module.js";
import { MetaWebhookController } from "./webhook.controller.js";
import { WhatsAppController } from "./whatsapp.controller.js";
import { WhatsAppService } from "./whatsapp.service.js";

@Module({
  imports: [AuthModule, AgentsModule, DnaModule, KnowledgeModule, AnalyticsModule],
  controllers: [MetaWebhookController, WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
