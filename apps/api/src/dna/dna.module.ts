import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AgentsModule } from "../agents/agents.module.js";
import { DnaController } from "./dna.controller.js";
import { DnaService } from "./dna.service.js";

@Module({
  imports: [AuthModule, AgentsModule],
  controllers: [DnaController],
  providers: [DnaService],
  exports: [DnaService],
})
export class DnaModule {}
