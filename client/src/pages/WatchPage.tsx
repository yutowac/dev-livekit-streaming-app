import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { DonateSheet } from "../components/DonateSheet";
import { VideoStage } from "../components/VideoStage";
import { createDefaultFace, smoothFacePoints } from "../lib/face";
import { getOrCreateDeviceId } from "../lib/deviceId";
import { connectAsViewer, fetchLiveKitToken } from "../lib/livekit";
import { getSocket } from "../lib/socket";
import type { DonationEvent, FacePoints, JoinResult, RoomSnapshot } from "../types";

type Phase = "loading" | "full" | "name" | "live" | "error";

export function WatchPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [userName, setUserName] = useState("");
  const [balance, setBalance] = useState(1000);
  const [roomInfo, setRoomInfo] = useState<RoomSnapshot | null>(null);
  const [face, setFace] = useState<FacePoints>(createDefaultFace());
  const [donations, setDonations] = useState<DonationEvent[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoStatus, setVideoStatus] = useState("映像を待っています…");
  const livekitRoomRef = useRef<Room | null>(null);
  const faceRef = useRef<FacePoints>(createDefaultFace());

  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  useEffect(() => {
    const socket = getSocket();

    const onRoom = (snap: RoomSnapshot) => setRoomInfo(snap);
    const onFace = (points: FacePoints) => {
      const smoothed = smoothFacePoints(faceRef.current, points, 0.45);
      faceRef.current = smoothed;
      setFace(smoothed);
    };
    const onDonation = (event: DonationEvent) => {
      setDonations((prev) => [...prev.slice(-40), event]);
    };
    const onBalance = (payload: { balance: number }) => setBalance(payload.balance);

    socket.on("room:update", onRoom);
    socket.on("face:update", onFace);
    socket.on("donation", onDonation);
    socket.on("balance", onBalance);

    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        setRoomInfo((prev) => ({
          maxViewers: cfg.maxViewers,
          viewerCount: cfg.viewerCount,
          sessionTotal: prev?.sessionTotal ?? 0,
          donations: prev?.donations ?? [],
          face: prev?.face ?? createDefaultFace(),
          publicUrl: cfg.publicUrl,
          livekitConfigured: cfg.livekitConfigured,
        }));
        if (cfg.viewerCount >= cfg.maxViewers) {
          setPhase("full");
          setMessage(`ただいま満員です（${cfg.maxViewers}人）`);
        } else {
          setPhase("name");
        }
      })
      .catch(() => {
        setPhase("error");
        setMessage("サーバに接続できません");
      });

    return () => {
      socket.off("room:update", onRoom);
      socket.off("face:update", onFace);
      socket.off("donation", onDonation);
      socket.off("balance", onBalance);
      livekitRoomRef.current?.disconnect();
      livekitRoomRef.current = null;
    };
  }, []);

  const startSession = useCallback(
    async (name: string) => {
      setBusy(true);
      setMessage("");
      const socket = getSocket();

      const joinResult = await new Promise<JoinResult>((resolve) => {
        socket.emit(
          "join",
          { role: "viewer", deviceId, userName: name },
          (ack: JoinResult) => resolve(ack),
        );
      });

      if (!joinResult.ok) {
        setBusy(false);
        if (joinResult.error === "full") {
          setPhase("full");
          setMessage(joinResult.message || "満員です");
          return;
        }
        setPhase("error");
        setMessage(joinResult.message || "入場に失敗しました");
        return;
      }

      setBalance(joinResult.balance ?? 1000);
      setRoomInfo(joinResult);
      if (joinResult.face) setFace(joinResult.face);
      if (joinResult.donations?.length) setDonations(joinResult.donations);

      try {
        if (joinResult.livekitConfigured) {
          const creds = await fetchLiveKitToken("viewer", deviceId, name);
          const room = await connectAsViewer(creds, (track) => {
            setStream(new MediaStream([track]));
            setVideoStatus("配信に接続しました");
          });
          livekitRoomRef.current = room;
          setVideoStatus("配信者のカメラを待っています…");
        } else {
          setVideoStatus("LiveKit 未設定のため映像はオフラインです");
        }
        setPhase("live");
      } catch (error) {
        setVideoStatus(
          error instanceof Error ? error.message : "映像の接続に失敗しました",
        );
        setPhase("live");
      } finally {
        setBusy(false);
      }
    },
    [deviceId],
  );

  const onSubmitName = async (e: FormEvent) => {
    e.preventDefault();
    const name = userName.trim() || "ゲスト";
    setUserName(name);
    await startSession(name);
  };

  const onDonate = (amount: number) => {
    setBusy(true);
    const socket = getSocket();
    socket.emit(
      "donate",
      { amount, userName },
      (ack: { ok: boolean; balance?: number; message?: string }) => {
        setBusy(false);
        if (!ack?.ok) {
          setMessage(ack?.message || "寄付に失敗しました");
          return;
        }
        if (typeof ack.balance === "number") setBalance(ack.balance);
        setSheetOpen(false);
        setMessage("");
      },
    );
  };

  if (phase === "loading") {
    return (
      <div className="page center">
        <p>接続中…</p>
      </div>
    );
  }

  if (phase === "full") {
    return (
      <div className="page center">
        <h1>満員です</h1>
        <p className="warn">{message || `ただいま満員です（${roomInfo?.maxViewers ?? 50}人）`}</p>
        <p className="muted">誰かが退出すると枠が空きます。しばらくしてから再読み込みしてください。</p>
        <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="page center">
        <h1>エラー</h1>
        <p className="warn">{message}</p>
        <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  if (phase === "name") {
    return (
      <div className="page center">
        <h1>ワチナナLIVE</h1>
        <p className="muted">
          視聴 {roomInfo?.viewerCount ?? 0}/{roomInfo?.maxViewers ?? 50} 人
        </p>
        <form className="name-form" onSubmit={onSubmitName}>
          <label htmlFor="userName">ニックネーム</label>
          <input
            id="userName"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="例: ゆうと"
            maxLength={20}
            autoComplete="nickname"
            enterKeyHint="go"
          />
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? "入場中…" : "入場する"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page watch-live">
      <VideoStage stream={stream} face={face} donations={donations}>
        <div className="hud top">
          <div>
            <strong>{userName}</strong>
            <span className="muted"> · {balance} pt</span>
          </div>
          <div className="muted">
            {roomInfo?.viewerCount ?? 0}/{roomInfo?.maxViewers ?? 50}
          </div>
        </div>
        {!stream && <div className="video-placeholder">{videoStatus}</div>}
        {message && <div className="toast">{message}</div>}
      </VideoStage>

      <div className="watch-actions">
        <button
          type="button"
          className="primary-btn donate-trigger"
          onClick={() => setSheetOpen(true)}
          disabled={balance < 100}
        >
          ポイントを贈る
        </button>
      </div>

      {sheetOpen && (
        <DonateSheet
          balance={balance}
          busy={busy}
          onDonate={onDonate}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
