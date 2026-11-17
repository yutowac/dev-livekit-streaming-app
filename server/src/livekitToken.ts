import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const ROOM_NAME = "presentation";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      !process.env.LIVEKIT_API_KEY.includes("your_api"),
  );
}

export async function ensureRoom(maxParticipants: number): Promise<void> {
  if (!isLiveKitConfigured()) return;

  const host = getHttpUrl(requireEnv("LIVEKIT_URL"));
  const client = new RoomServiceClient(
    host,
    requireEnv("LIVEKIT_API_KEY"),
    requireEnv("LIVEKIT_API_SECRET"),
  );

  try {
    await client.createRoom({
      name: ROOM_NAME,
      maxParticipants,
      emptyTimeout: 60 * 60,
    });
  } catch {
    // Room may already exist
  }
}

export async function createToken(options: {
  identity: string;
  name: string;
  canPublish: boolean;
}): Promise<{ token: string; url: string; roomName: string }> {
  if (!isLiveKitConfigured()) {
    throw new Error("LiveKit is not configured");
  }

  const at = new AccessToken(
    requireEnv("LIVEKIT_API_KEY"),
    requireEnv("LIVEKIT_API_SECRET"),
    {
      identity: options.identity,
      name: options.name,
      ttl: "6h",
    },
  );

  at.addGrant({
    roomJoin: true,
    room: ROOM_NAME,
    canPublish: options.canPublish,
    canSubscribe: true,
    canPublishData: false,
  });

  return {
    token: await at.toJwt(),
    url: requireEnv("LIVEKIT_URL"),
    roomName: ROOM_NAME,
  };
}

export { ROOM_NAME };
