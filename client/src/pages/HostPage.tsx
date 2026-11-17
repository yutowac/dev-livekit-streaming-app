import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { VideoStage } from "../components/VideoStage";
import { createDefaultFace, detectFace, smoothFacePoints } from "../lib/face";
import { connectAsHost, fetchLiveKitToken } from "../lib/livekit";
import { getSocket } from "../lib/socket";
import type { DonationEvent, FacePoints, RoomSnapshot } from "../types";
import type { LocalVideoTrack, Room } from "livekit-client";

export function HostPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [roomInfo, setRoomInfo] = useState<RoomSnapshot | null>(null);
  const [face, setFace] = useState<FacePoints>(createDefaultFace());
  const [donations, setDonations] = useState<DonationEvent[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const roomRef = useRef<Room | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastDetectedAt = useRef(0);

  const watchUrl = useMemo(() => `${window.location.origin}/`, []);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("join", { role: "host" }, (ack: RoomSnapshot & { ok?: boolean }) => {
      if (ack) {
        setRoomInfo(ack);
        if (ack.donations) setDonations(ack.donations);
        if (ack.face) setFace(ack.face);
      }
    });

    const onRoom = (snap: RoomSnapshot) => setRoomInfo(snap);
    const onFace = (points: FacePoints) => setFace(points);
    const onDonation = (event: DonationEvent) => {
      setDonations((prev) => [...prev.slice(-40), event]);
    };

    socket.on("room:update", onRoom);
    socket.on("face:update", onFace);
    socket.on("donation", onDonation);

    return () => {
      socket.off("room:update", onRoom);
      socket.off("face:update", onFace);
      socket.off("donation", onDonation);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(watchUrl, { margin: 1, width: 280 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [watchUrl]);

  useEffect(() => {
    if (!started || !stream) return;
    const socket = getSocket();
    let raf = 0;
    let lastSent = 0;
    let smoothed = createDefaultFace();
    let heldFace = createDefaultFace();
    let detecting = false;

    const loop = async (ts: number) => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      if (ts - lastSent < 50) return; // ~20 fps
      if (detecting) return;
      lastSent = ts;
      detecting = true;

      try {
        const points = await detectFace(video, performance.now());
        if (points.detected) {
          smoothed = smoothFacePoints(smoothed, points, 0.4);
          heldFace = smoothed;
          lastDetectedAt.current = Date.now();
          setFace(smoothed);
          socket.emit("face:update", smoothed);
        } else if (Date.now() - lastDetectedAt.current < 600) {
          const held = { ...heldFace, detected: true };
          setFace(held);
          socket.emit("face:update", held);
        } else {
          smoothed = points;
          setFace(points);
          socket.emit("face:update", points);
        }
      } catch {
        // MediaPipe may fail until model loads
      } finally {
        detecting = false;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started, stream]);

  useEffect(() => {
    return () => {
      trackRef.current?.stop();
      roomRef.current?.disconnect();
      wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  const startBroadcast = async () => {
    setBusy(true);
    setError("");
    try {
      const identity = `host-${crypto.randomUUID()}`;
      let localStream: MediaStream;

      if (roomInfo?.livekitConfigured !== false) {
        try {
          const creds = await fetchLiveKitToken("host", identity, "presenter");
          const { room, videoTrack } = await connectAsHost(creds);
          roomRef.current = room;
          trackRef.current = videoTrack;
          localStream = new MediaStream([videoTrack.mediaStreamTrack]);
        } catch (livekitError) {
          // Fallback: local camera only (donations/face still work)
          console.warn(livekitError);
          localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" },
            audio: false,
          });
          setError(
            livekitError instanceof Error
              ? `LiveKit 未接続（ローカル映像のみ）: ${livekitError.message}`
              : "LiveKit 未接続（ローカル映像のみ）",
          );
        }
      } else {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        setError("LiveKit 未設定のため、視聴側には映像が届きません");
      }

      setStream(localStream);
      setStarted(true);

      if ("wakeLock" in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          // optional
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "カメラを開始できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const recent = [...donations].reverse().slice(0, 4);

  if (!started) {
    return (
      <div className="page host-setup">
        <h1>配信者</h1>
        <p className="muted">Android Chrome 向け · 視聴上限 {roomInfo?.maxViewers ?? 50} 人</p>

        <div className="qr-card">
          {qrDataUrl ? <img src={qrDataUrl} alt="視聴用QR" /> : <div className="qr-skel" />}
          <p className="mono">{watchUrl}</p>
          <p className="hint">カメラ開始前に QR を共有してください</p>
        </div>

        {error && <p className="warn">{error}</p>}

        <button type="button" className="primary-btn" disabled={busy} onClick={startBroadcast}>
          {busy ? "開始中…" : "配信を開始"}
        </button>
      </div>
    );
  }

  return (
    <div className="page host-live">
      <VideoStage
        videoRef={videoRef}
        stream={stream}
        face={face}
        donations={donations}
        muted
        mirror={false}
      >
        <div className="hud top">
          <div>
            <strong>合計 {roomInfo?.sessionTotal ?? 0} pt</strong>
          </div>
          <div>
            視聴 {roomInfo?.viewerCount ?? 0}/{roomInfo?.maxViewers ?? 50}
          </div>
        </div>

        <div className="hud bottom-log">
          {recent.length === 0 ? (
            <div className="muted">まだ寄付はありません</div>
          ) : (
            recent.map((d) => (
              <div key={d.id} className="log-row">
                <span>
                  {d.emoji} {d.userName}
                </span>
                <span>{d.amount}pt</span>
              </div>
            ))
          )}
        </div>

        <a className="mini-link" href={watchUrl} target="_blank" rel="noreferrer">
          視聴URL
        </a>
      </VideoStage>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
