import { AMOUNT_OPTIONS, getEmojiRule } from "../lib/emojiRules";

interface Props {
  balance: number;
  busy?: boolean;
  onDonate: (amount: number) => void;
  onClose: () => void;
}

export function DonateSheet({ balance, busy, onDonate, onClose }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>ポイントを贈る</h2>
        <p className="muted">残高 {balance} pt</p>
        <div className="amount-grid">
          {AMOUNT_OPTIONS.map((amount) => {
            const rule = getEmojiRule(amount)!;
            const disabled = amount > balance || busy;
            return (
              <button
                key={amount}
                type="button"
                className="amount-btn"
                disabled={disabled}
                onClick={() => onDonate(amount)}
              >
                <span className="amount-emoji">{rule.emoji}</span>
                <span className="amount-value">{amount}</span>
                <span className="amount-label">{rule.label}</span>
              </button>
            );
          })}
        </div>
        {balance < 100 && <p className="warn">ポイントが足りません</p>}
        <button type="button" className="ghost-btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
