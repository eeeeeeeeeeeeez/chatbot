import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { ChatbotError } from "@/lib/errors";

const MAX_MESSAGES = 60 * 60;
const TTL_SECONDS = 60 * 60;

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectPromise: Promise<RedisClient | null> | null = null;

async function getClient() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (client?.isReady) {
    return client;
  }

  if (connectPromise) {
    return connectPromise;
  }

  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", () => undefined);
  client.on("end", () => {
    client = null;
    connectPromise = null;
  });

  connectPromise = client
    .connect()
    .then(() => client)
    .catch(() => {
      client = null;
      return null;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

export async function checkIpRateLimit(ip: string | undefined) {
  if (!isProductionEnvironment || !ip) {
    return;
  }

  try {
    const redis = await getClient();
    if (!redis?.isReady) {
      return;
    }

    const key = `ip-rate-limit:${ip}`;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, TTL_SECONDS, "NX")
      .exec();

    if (typeof count === "number" && count > MAX_MESSAGES) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
  }
}
