import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AgentsModule } from "../agents/agents.module.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { SimulationsController } from "./simulations.controller.js";
import { SimulationsService } from "./simulations.service.js";

@Module({
  imports: [AuthModule, AgentsModule, AnalyticsModule],
  controllers: [SimulationsController],
  providers: [SimulationsService],
})
export class SimulationsModule {}
