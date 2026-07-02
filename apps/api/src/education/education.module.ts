import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AgentsModule } from "../agents/agents.module.js";
import { KnowledgeModule } from "../knowledge/knowledge.module.js";
import { EducationController } from "./education.controller.js";
import { EducationService } from "./education.service.js";

@Module({
  imports: [AuthModule, AgentsModule, KnowledgeModule],
  controllers: [EducationController],
  providers: [EducationService],
})
export class EducationModule {}
