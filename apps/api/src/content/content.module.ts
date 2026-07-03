import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AgentsModule } from "../agents/agents.module.js";
import { DnaModule } from "../dna/dna.module.js";
import { ContentController } from "./content.controller.js";
import { ContentService } from "./content.service.js";

@Module({
  imports: [AuthModule, AgentsModule, DnaModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
