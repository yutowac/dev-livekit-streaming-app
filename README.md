# ワチナナLIVE

発表の賑やかし用プロトタイプです。プレゼンター（Android）のカメラ映像に、視聴者からの寄付ポイントに応じた絵文字が顔の位置へ重なります。視聴者は iPhone / Android 混在で、会場の同一 Wi-Fi は不要です。

## できること

- 視聴端末ごとに初回接続で **1000 ポイント** を付与
- **100 ポイント単位**で寄付（残高を超える金額は選べない）
- 金額ごとに絵文字・位置・演出が決まる（位置はユーザーが選ばない）
- プレゼンター映像の上に絵文字が張り付き、名前と金額が表示される
- 同時視聴は **最大 50 人**（51 人目は満員で入場不可）

### 寄付額と絵文字

| ポイント | 絵文字 | 位置 |
|---------|--------|------|
| 100 | 👏 拍手 | 顔の左（横） |
| 200 | 🐥 ひよこ | 顔の右 |
| 300 | ❤️ ハート | 顔の真ん中 |
| 400 | 😸 猫 | 顔の真ん中 |
| 500 | 🍉 スイカ | おでこ |
| 600 | 🍔 バーガー | 口 |
| 700 | 🎉 クラッカー | 左横＋右上寄り＋右下寄り（3個） |
| 800 | 🐽 ぶた鼻 | 顔の真ん中 |
| 900 | 💩 うんち | 顔の下 |
| 1000 | 👑 王冠 | 頭の上 |

## 対象端末

| 役割 | 端末 | ブラウザ |
|------|------|----------|
| 配信 | Android | Chrome |
| 視聴 | iPhone / Android | Safari / Chrome |

## 技術選定のポイント

参加者が増えても、各端末が動かす画面は同じです。同時接続数を決めるのは Next.js か Vite かではなく、**映像をどこで何本にコピーするか**です。

- **Vite + React + TypeScript（採用）**  
  カメラ・WebRTC・MediaPipe・絵文字はすべてブラウザ側です。静的ファイルを Node が配り、部屋と残高は同じ Node が持ちます。プロトタイプとして境界が分かりやすいです。
- **Next.js（不採用）**  
  画面のほぼ全部がクライアント処理で、参加人数も増えません。残高用の常駐接続はサーバレス関数に載らず、結局別の Node が必要です。

### 同じ Wi-Fi を使わない理由

ゲスト Wi-Fi の端末分離、iPhone が要求する正規の HTTPS、配信役が Android でサーバを置けないこと、が同時に壁になります。そのため次を採用しています。

- **公開 HTTPS + LiveKit Cloud**  
  アプリと残高用 Node を公開 URL でホストし、映像だけ LiveKit Cloud が分配します。視聴者はモバイル回線でも別 Wi-Fi でも、URL を開くだけで参加できます。NAT 越えは LiveKit の TURN が吸収します。

### 視聴 50 人の入場上限

配信本数は常に **1 本**（プレゼンターのカメラ）です。50 人になっても符号化は Android 上で 1 本のまま、コピーは LiveKit Cloud が行います。顔座標は毎秒約 8 回の小さな JSON です。

51 人目からは配信を増やさず **入場を止めます**。画面に「ただいま満員です（50人）」と出し、映像も寄付も始めません。誰かが切断すると枠が空きます。

## 要素技術

| 要素 | 役割 |
|------|------|
| Vite / React / TypeScript | 視聴・配信の UI |
| Node.js | 静的配信・API・残高の正 |
| Socket.IO | 入室・残高・寄付・顔座標の配信 |
| LiveKit Cloud | カメラ映像の SFU 分配 |
| MediaPipe Face Landmarker | 配信 Android 上での顔 4 点検出（WASM/モデルは `client/public/mediapipe` に同梱） |
| Wake Lock API | 配信中の画面消灯防止 |
| QR コード | 視聴 URL の共有 |

### アーキテクチャ

```
Android配信 ──顔座標──► 公開 Node ◄──名前・寄付── iPhone / Android 視聴
     │                      │
     │                      └── 座標・残額・寄付 ──► 全員
     │
     └──カメラ1本──► LiveKit Cloud ──分配──► 各視聴端末
```

## 画面

- **視聴 `/`** … 名前入力 → 映像視聴 → 寄付
- **配信 `/host`** … カメラ開始・QR・視聴人数・合計ポイント・寄付ログ

名前はリロードのたびに入力します。端末 ID は `localStorage` に置き、残高はサーバが **端末 ID ＋ニックネーム** の組で管理します。同じ名前で再入場すると残ポイントを継続し、名前を変えると 1000pt からになります。

## プロトタイプの範囲外

- ログインアカウント / 永続データベース
- 不正対策の強化 / 映像の録画
- 51 人目以降の入場
- 視聴端末からのカメラ配信

残高はサーバのメモリ上です。再起動すると残額は 1000 から、セッション合計は 0 からになります。

## セットアップ

### 必要なもの

- Node.js 20+
- [LiveKit Cloud](https://cloud.livekit.io/) のプロジェクト（URL / API Key / API Secret）

### 環境変数

`server/.env` を用意します（`server/.env.example` をコピー）。

```env
PORT=3000
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
MAX_VIEWERS=50
PUBLIC_URL=http://localhost:3000
```

`MAX_VIEWERS` を小さくすると、満員表示の動作確認がしやすいです。

### ローカル起動

```bash
# 依存関係
cd server && npm install
cd ../client && npm install

# 開発（2 ターミナル）
cd server && npm run dev
cd client && npm run dev
```

- 視聴: http://localhost:5173/
- 配信: http://localhost:5173/host  
  （開発時は Vite が Socket.IO を `localhost:3000` へプロキシします）

### 本番ビルド（1 ポート）

```bash
cd client && npm run build
cd ../server && npm start
```

`http://localhost:3000/` と `/host` で動作します。発表時は Render / Railway などにデプロイし、`PUBLIC_URL` を公開 HTTPS にしてください。API キーはサーバの環境変数のみに置き、ブラウザへは出しません。

## 発表時の使い方

1. サーバを公開 HTTPS で起動し、LiveKit の環境変数を設定する
2. Android Chrome で `/host` を開き、「配信を開始」を押す
3. 表示された QR / URL を視聴者に共有する
4. 視聴者は名前を入れて参加し、100 ポイント単位で寄付する
