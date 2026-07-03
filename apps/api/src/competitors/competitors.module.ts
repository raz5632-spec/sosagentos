import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AgentsModule } from "../agents/agents.module.js";
import { CompetitorsController } from "./competitors.controller.js";
import { CompetitorsService } from "./competitors.service.js";

@Module({
  imports: [AuthModule, AgentsModule],
  controllers: [CompetitorsController],
  providers: [CompetitorsService],
})
export class CompetitorsModule {}
