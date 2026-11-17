import { useEffect, useMemo, useRef, useState } from "react";
import { getContainRect } from "../lib/containRect";
import {
  effectHoldMs,
  effectSparkCount,
  effectUsesScreenFlash,
  getEmojiRule,
} from "../lib/emojiRules";
import type { DonationEvent, EffectId, FaceAnchor, FacePoints } from "../types";

interface Props {
  face: FacePoints;
  donations: DonationEvent[];
  containerWidth: number;
  containerHeight: number;
  mediaWidth: number;
  mediaHeight: number;
}

interface ActiveGlyph {
  key: string;
  donationId: string;
  effectId: EffectId;
  emoji: string;
  userName: string;
  amount: number;
  anchor: FaceAnchor;
  showMeta: boolean;
}

function pickPoint(face: FacePoints, anchor: FaceAnchor) {
  return face[anchor];
}

function resolveEffectId(donation: DonationEvent): EffectId {
  if (donation.effectId) return donation.effectId;
  return getEmojiRule(donation.amount)?.effectId ?? "clap";
}

function resolveAnchors(donation: DonationEvent): FaceAnchor[] {
  if (donation.anchors?.length) return donation.anchors;
  return getEmojiRule(donation.amount)?.anchors ?? ["center"];
}

export function EmojiOverlay({
  face,
  donations,
  containerWidth,
  containerHeight,
  mediaWidth,
  mediaHeight,
}: Props) {
  const [active, setActive] = useState<ActiveGlyph[]>([]);
  const [screenFlash, setScreenFlash] = useState<EffectId | null>(null);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    for (const donation of donations) {
      if (seenIds.current.has(donation.id)) continue;
      seenIds.current.add(donation.id);

      const effectId = resolveEffectId(donation);
      const anchors = resolveAnchors(donation);
      const glyphs: ActiveGlyph[] = anchors.map((anchor, index) => ({
        key: `${donation.id}-${anchor}-${index}`,
        donationId: donation.id,
        effectId,
        emoji: donation.emoji,
        userName: donation.userName,
        amount: donation.amount,
        anchor,
        showMeta: index === 0,
      }));

      setActive((prev) => [...prev, ...glyphs]);

      if (effectUsesScreenFlash(effectId)) {
        setScreenFlash(effectId);
        window.setTimeout(() => {
          setScreenFlash((current) => (current === effectId ? null : current));
        }, 700);
      }

      window.setTimeout(() => {
        setActive((prev) => prev.filter((d) => d.donationId !== donation.id));
      }, effectHoldMs(effectId));
    }
  }, [donations]);

  const rect = useMemo(
    () => getContainRect(containerWidth, containerHeight, mediaWidth, mediaHeight),
    [containerWidth, containerHeight, mediaWidth, mediaHeight],
  );

  return (
    <div className="emoji-overlay" aria-hidden>
      {screenFlash && (
        <div className={`fx-screen-flash fx-screen-flash-${screenFlash}`} />
      )}
      {!face.detected && (
        <div className="face-lost-badge">顔を検出中…</div>
      )}
      {active.map((item) => {
        const point = pickPoint(face, item.anchor);
        const left = rect.left + point.x * rect.width;
        const top = rect.top + point.y * rect.height;
        const sparks = Array.from({ length: effectSparkCount(item.effectId) }, (_, i) => i);
        const holdMs = effectHoldMs(item.effectId);
        const fadeDelaySec = Math.max(0, (holdMs - 800) / 1000);
        return (
          <div
            key={item.key}
            className="emoji-anchor"
            style={{ left, top }}
          >
            <div
              className={`emoji-item emoji-fx-${item.effectId}`}
              style={{ ["--fade-delay" as string]: `${fadeDelaySec}s` }}
            >
              <span className="fx-ring fx-ring-a" />
              <span className="fx-ring fx-ring-b" />
              {sparks.map((i) => (
                <span
                  key={i}
                  className={`fx-spark fx-spark-${i % 8}`}
                  style={{ ["--spark-i" as string]: i }}
                />
              ))}
              <span className="emoji-glyph">{item.emoji}</span>
              {item.showMeta && (
                <span className="emoji-meta">
                  {item.userName} · {item.amount}pt
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
