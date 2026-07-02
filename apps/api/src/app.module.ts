import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { OrgsModule } from "./orgs/orgs.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [AuthModule, OrgsModule],
  controllers: [HealthController],
})
export class AppModule {}
