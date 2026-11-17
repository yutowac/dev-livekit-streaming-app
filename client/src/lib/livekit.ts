import {
  createLocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";

export interface LiveKitCreds {
  token: string;
  url: string;
  roomName: string;
}

export async function fetchLiveKitToken(
  role: "host" | "viewer",
  identity: string,
  name: string,
): Promise<LiveKitCreds> {
  const params = new URLSearchParams({ role, identity, name });
  const res = await fetch(`/api/livekit-token?${params}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "LiveKit token failed");
  }
  return data as LiveKitCreds;
}

export async function connectAsHost(creds: LiveKitCreds): Promise<{
  room: Room;
  videoTrack: LocalVideoTrack;
}> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });
  await room.connect(creds.url, creds.token);

  const videoTrack = await createLocalVideoTrack({
    resolution: { width: 640, height: 480, frameRate: 24 },
    facingMode: "user",
  });
  await room.localParticipant.publishTrack(videoTrack, {
    name: "camera",
    source: Track.Source.Camera,
  });

  return { room, videoTrack };
}

export async function connectAsViewer(
  creds: LiveKitCreds,
  onTrack: (track: MediaStreamTrack) => void,
): Promise<Room> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  const attach = (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video) {
      const media = track.mediaStreamTrack;
      if (media) onTrack(media);
    }
  };

  room.on(
    RoomEvent.TrackSubscribed,
    (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      attach(track);
    },
  );

  await room.connect(creds.url, creds.token);

  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.track) attach(publication.track as RemoteTrack);
    }
  }

  return room;
}
