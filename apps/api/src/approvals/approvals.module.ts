import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AgentsModule } from "../agents/agents.module.js";
import { KnowledgeModule } from "../knowledge/knowledge.module.js";
import { ContentModule } from "../content/content.module.js";
import { ApprovalsController } from "./approvals.controller.js";
import { ApprovalsService } from "./approvals.service.js";

@Module({
  imports: [AuthModule, AgentsModule, KnowledgeModule, ContentModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
