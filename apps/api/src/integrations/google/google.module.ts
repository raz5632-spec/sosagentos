import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { KnowledgeModule } from "../../knowledge/knowledge.module.js";
import { GoogleController, GoogleCallbackController } from "./google.controller.js";
import { GoogleService } from "./google.service.js";

@Module({
  imports: [AuthModule, KnowledgeModule],
  controllers: [GoogleController, GoogleCallbackController],
  providers: [GoogleService],
  exports: [GoogleService],
})
export class GoogleModule {}
