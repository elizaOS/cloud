import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getInternalHeaders } from "../../helpers/auth";
import { recordHttpError } from "../../helpers/metrics";
import { Counter, Trend } from "k6/metrics";

const baseUrl = getBaseUrl();
const headers = getInternalHeaders();
const webhooksProcessed = new Counter("discord_webhooks_processed");
const webhookLatency = new Trend("discord_webhook_latency");

interface DiscordEvent { type: number; d: Record<string, unknown>; t?: string }

function createMessageEvent(content: string, guildId: string, channelId: string): DiscordEvent {
  return {
    type: 0, t: "MESSAGE_CREATE",
    d: {
      id: `${Date.now()}`, channel_id: channelId, guild_id: guildId,
      author: { id: "123456789", username: "loadtest", discriminator: "0000", bot: false },
      content, timestamp: new Date().toISOString(), tts: false, mention_everyone: false,
      mentions: [], mention_roles: [], attachments: [], embeds: [], type: 0,
    },
  };
}

function createInteractionEvent(customId: string, guildId: string): DiscordEvent {
  return {
    type: 0, t: "INTERACTION_CREATE",
    d: {
      id: `${Date.now()}`, type: 3, guild_id: guildId, channel_id: "1234567890",
      member: { user: { id: "123456789", username: "loadtest", discriminator: "0000" } },
      data: { custom_id: customId, component_type: 2 },
    },
  };
}

function createMemberJoinEvent(guildId: string): DiscordEvent {
  return {
    type: 0, t: "GUILD_MEMBER_ADD",
    d: {
      guild_id: guildId,
      user: { id: `${Date.now()}`, username: `loadtest_${Date.now()}`, discriminator: "0000", bot: false },
      joined_at: new Date().toISOString(),
    },
  };
}

export function sendDiscordEvent(event: DiscordEvent): boolean {
  const start = Date.now();
  const res = http.post(`${baseUrl}/api/internal/discord/events`, JSON.stringify(event), {
    headers, tags: { endpoint: "discord" },
  });
  webhookLatency.add(Date.now() - start);

  if (!check(res, { "discord 2xx": (r) => r.status >= 200 && r.status < 300 })) {
    recordHttpError(res.status);
    return false;
  }
  webhooksProcessed.add(1);
  return true;
}

export function discordMessageTraffic() {
  group("Discord Messages", () => {
    const guildId = "1234567890123456789", channelId = "9876543210987654321";
    for (const msg of ["Hello!", "How are you?", "Thanks!"]) {
      sendDiscordEvent(createMessageEvent(msg, guildId, channelId));
      sleep(0.1);
    }
  });
  sleep(0.5);
}

export function discordInteractionTraffic() {
  group("Discord Interactions", () => {
    const guildId = "1234567890123456789";
    for (const id of ["button_click", "menu_select"]) {
      sendDiscordEvent(createInteractionEvent(id, guildId));
      sleep(0.1);
    }
  });
  sleep(0.5);
}

export function discordMemberJoinBurst() {
  group("Discord Member Burst", () => {
    const guildId = "1234567890123456789";
    for (let i = 0; i < 10; i++) sendDiscordEvent(createMemberJoinEvent(guildId));
  });
  sleep(1);
}

export function discordWebhookCycle() {
  const ops = [discordMessageTraffic, discordInteractionTraffic, discordMemberJoinBurst];
  ops[__ITER % ops.length]();
}

export default function () {
  discordWebhookCycle();
}
