import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { CanvaController, CanvaCallbackController } from "./canva.controller.js";
import { CanvaService } from "./canva.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CanvaController, CanvaCallbackController],
  providers: [CanvaService],
  exports: [CanvaService],
})
export class CanvaModule {}
