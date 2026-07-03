import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { MetaWebhookController } from "./webhook.controller.js";
import { WhatsAppController } from "./whatsapp.controller.js";
import { WhatsAppService } from "./whatsapp.service.js";

@Module({
  imports: [AuthModule],
  controllers: [MetaWebhookController, WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
