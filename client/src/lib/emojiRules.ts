import type { EffectId, FaceAnchor } from "../types";

export interface EmojiRule {
  effectId: EffectId;
  emoji: string;
  anchors: FaceAnchor[];
  label: string;
}

const RULES: Record<number, EmojiRule> = {
  100: { effectId: "clap", emoji: "👏", anchors: ["side"], label: "拍手" },
  200: { effectId: "chick", emoji: "🐥", anchors: ["sideRight"], label: "ひよこ" },
  300: { effectId: "heart", emoji: "❤️", anchors: ["center"], label: "ハート" },
  400: { effectId: "cat", emoji: "😸", anchors: ["center"], label: "猫" },
  500: { effectId: "melon", emoji: "🍉", anchors: ["forehead"], label: "スイカ" },
  600: { effectId: "burger", emoji: "🍔", anchors: ["mouth"], label: "バーガー" },
  700: {
    effectId: "party",
    emoji: "🎉",
    anchors: ["side", "sideRightUp", "sideRightDown"],
    label: "クラッカー",
  },
  800: { effectId: "pig", emoji: "🐽", anchors: ["center"], label: "ぶた鼻" },
  900: { effectId: "poop", emoji: "💩", anchors: ["below"], label: "うんち" },
  1000: { effectId: "crown", emoji: "👑", anchors: ["above"], label: "王冠" },
};

export function getEmojiRule(amount: number): EmojiRule | null {
  if (amount < 100 || amount > 1000 || amount % 100 !== 0) {
    return null;
  }
  return RULES[amount] ?? null;
}

export const AMOUNT_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;

export function effectHoldMs(effectId: EffectId): number {
  switch (effectId) {
    case "party":
    case "poop":
      return 7000;
    case "crown":
      return 7500;
    case "melon":
    case "burger":
    case "pig":
      return 6000;
    case "heart":
    case "cat":
      return 5500;
    default:
      return 5000;
  }
}

export function effectSparkCount(effectId: EffectId): number {
  switch (effectId) {
    case "clap":
      return 2;
    case "chick":
      return 3;
    case "heart":
    case "cat":
      return 5;
    case "melon":
    case "burger":
      return 6;
    case "party":
    case "pig":
      return 8;
    case "poop":
      return 7;
    case "crown":
      return 12;
  }
}

export function effectUsesScreenFlash(effectId: EffectId): boolean {
  return effectId === "party" || effectId === "poop" || effectId === "crown";
}
