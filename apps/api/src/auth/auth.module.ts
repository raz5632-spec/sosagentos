import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./jwt.guard.js";
import { TenantGuard } from "./tenant.guard.js";
import { RolesGuard } from "./roles.guard.js";

export const JWT_SECRET = () => process.env.JWT_SECRET ?? "salesos-dev-secret-change-me";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: JWT_SECRET(),
      signOptions: { expiresIn: "12h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, TenantGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, TenantGuard, RolesGuard],
})
export class AuthModule {}
