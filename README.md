# AC Car Studio — Assetto Corsa 車両作成・物理チューニング・サーバー管理スタジオ

Assetto Corsa の車両 Mod 作成・3D モデル改造・GT7 風 3D スキンペイント・物理エンジン＆サウンドシミュレーション・CSP AT/CVT・ハイブリッド／回生ブレーキ化・サスペンション 3D＆キネマティクス解析・`data.acd` 展開/再パック・専用サーバー設定＆起動までを 1 つにまとめた Electron + React + Three.js デスクトップアプリケーションです。

## 主な機能

- **ホームハブ & 独立スタジオ構成**:
  - **Mod作成 / モデル改造 / ペイント・スキン / エンジン音シミュレーター / 車両データ改造 / ACサーバー設定 / 設定** の 7 モードから作業を開始可能
  - **マウスサイドボタン（戻る・進む）** による画面履歴ナビゲーション、全編集領域での **`Ctrl+Z` / `Ctrl+Y`**（Undo / Redo）、ウィンドウサイズ連動 **自動 UI スケール調整**、**3D ビューワー単体 / 設定パネル単体のフローティング＆別ウィンドウ表示** に対応
- **モデル改造ハブ & 3D モデルスタジオ**:
  - 「モデルの改造」「モデルの保存」「保存されたモデルの確認」の 3 メニュー構成
  - Assetto Corsa `.kn5` バイナリのロスレス読込・書出、外部 `.kn5` / `.fbx` / `.glb` / `.gltf` / `.obj` インポート対応
  - **`Shift + 左クリック` による複数パーツ同時選択**＆ **`Ctrl+S`** でのパーツライブラリ保存、保存済みパーツの新規追加・車両丸ごと差し替え・4輪ホイール一括履き替えに対応
- **GT7 風 3D リバリー / スキンスタジオ**:
  - **3D カメラ / サーフェス直接投影デカール**（3D ギズモ・対称／文字可読ミラー複製）、隙間ゼロの高精度メッシュ領域塗りつぶし、メーカー純正色カタログ＆内装・樹脂マテリアルプリセット（成形ブラック / アルカンターラ / 本革 / 合皮 / カーボン）
  - デフォルト **4096×4096**（設定で `1024` / `2048` / `4096` / `8192` px 選択可能）の DDS＋CSP `ext_config.ini`＋`ui_skin.json`＋`preview.jpg` 一括書き出し
- **CSP AT / CVT トランスミッション実装**:
  - `car.ini` (`VERSION=extended-2`)・`drivetrain.ini`・`data/script.lua` を自動生成し、トルコンクリープ・ロックアップ・キックダウン対応の **CSP AT（4〜10速）** と、目標回転数マップ＆擬似ステップ変速対応の **CSP CVT（無段変速）** をワンクリック実装
- **ハイブリッド化（電気モーター & 回生ブレーキ）**:
  - `ers.ini`・`kers_torque_power.lut`・`kers_torque_coast.lut`・3 段階コックピット切替 `ctrl_ers_0〜2.ini`・CSP 拡張回生ブレンドを自動生成
  - エンジン＋モーター合算出力/トルク曲線＆回生ドラッグ曲線のリアルタイム表示、5 種のハイブリッドプリセット（48V MHEV / ストロング HV / スポーツ PHEV / ハイパーカー ERS / レース規定 ERS）
- **物理エンジン & サウンドシミュレーター**:
  - 10 種の名機プリセット、熱力学・1 次元管路音響・Web Audio `AudioWorklet` リアルタイム合成、WAV パック＆CSP Lua サウンド出力
- **サスペンション 3D & キネマティクスグラフ**:
  - 車高・キャンバー・トー・ロールを 3D モデルへリアルタイム反映し、荷重変化時のキャンバー／トー／車高変化およびロール挙動グラフを表示
- **Assetto Corsa 専用サーバー設定 & ランチャー**:
  - **プレビュー画像＆コース図付きサーキット選択 GUI**、**写真＆スキンサムネイル付き車両選択 GUI**
  - `cfg/server_cfg.ini`・`cfg/entry_list.ini`・`cfg/csp_extra_options.ini` の読込・編集・保存、5 種の用途プリセット、`acServer.exe` の直接起動・停止・ライブログ表示・Content Manager 招待リンク生成に対応

## ダウンロード & インストール方法

### 方法 1: GitHub オンラインインストーラー（推奨・超軽量 約 20 KB）
常に GitHub Releases から最新バージョンを自動取得してインストール・ショートカット作成・アンインストール登録まで行う GUI オンラインインストーラーです。

1. [GitHub Releases](https://github.com/Lagularge/ac-car-studio/releases/latest) から **`AC-Car-Studio-Online-Setup.exe`** をダウンロードして起動
2. 「最新版をインストール」をクリックすると、GitHub から最新ビルドを自動ダウンロードして検証・導入します

### 方法 2: PowerShell ワンライナー（コマンド1行でオンライン導入）
Windows PowerShell で以下の 1 行を実行すると、GitHub から最新版を自動取得してインストール・起動します：

```powershell
irm https://raw.githubusercontent.com/Lagularge/ac-car-studio/main/installer/install.ps1 | iex
```

### 方法 3: Windows ポータブル単体版（インストール不要）
1. [Latest Release](https://github.com/Lagularge/ac-car-studio/releases/latest) から **`AC-Car-Studio-x.x.x-win-portable.exe`** をダウンロード
2. ダブルクリックしてそのまま起動（初回起動時に Assetto Corsa の `content/cars` フォルダを自動検出します）

## 自動アップデート確認機能

- 起動時に自動で GitHub リポジトリ (`Lagularge/ac-car-studio`) の最新リリースを確認します。
- 新しいバージョンが公開されている場合は **アップデート確認ダイアログ** が表示され、更新内容を確認したうえで「今すぐアップデートを実行」を選ぶと自動で最新版へ更新・再起動できます。
- 「設定」画面から自動チェックの ON/OFF 切替や、手動での「今すぐアップデートを確認」も可能です。

## ソースからの起動・ビルド方法

```powershell
# 依存パッケージのインストール
npm install

# ビルドして起動（推奨）
npm start

# 開発モード（ホットリロード）
npm run dev

# 型チェック & コアテスト実行
npm run typecheck
npx tsx scripts/test-core.ts

# ポータブル Windows EXE ビルド
npm run dist
```

Windows では `start-ac-car-studio.bat` をダブルクリックしても起動できます。
