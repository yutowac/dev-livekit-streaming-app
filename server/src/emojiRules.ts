import type { EffectId, FaceAnchor } from "./types.js";

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
