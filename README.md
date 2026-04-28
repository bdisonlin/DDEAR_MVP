# DDEAR — 能源數位孿生沙盒

> **Dynamic Digital Energy Asset ROI**
> 讓企業在投資前，先用數位孿生看到結果。

---

## 這個專案是什麼？

DDEAR 是一個**企業能源資產投資決策沙盒**。企業在決定是否安裝太陽能、儲能、風力發電等設備前，可以：

1. 匯入自己的 15 分鐘用電資料（或一鍵載入示範資料）
2. 自由組合各種能源資產
3. 即時看到「導入後的電費節省、碳排減少、ROI 回本期」
4. 透過 AI 最佳化引擎（後端 Python + Anthropic Claude），找出最適合參與台電需量反應（DR）的資產配置與時段

核心價值：**讓一張投影片都沒有的決策，變成有數字支撐的方案**。

---

## 目錄

**給一般使用者**
- [使用流程](#使用流程)
- [台電電費計算方法](#台電電費計算方法)
- [AI 最佳化決策引擎](#ai-最佳化決策引擎)
- [支援資產類型](#支援資產類型)

**給工程師**
- [技術架構](#技術架構)
- [快速啟動](#快速啟動)
- [完整本地開發環境](#完整本地開發環境)
- [部署：GitHub Pages（前端展示）](#部署github-pages前端展示)
- [部署：地端 On-Premise](#部署地端-on-premise)
- [部署：雲端](#部署雲端)
- [API 文件](#api-文件)
- [專案結構](#專案結構)
- [開發注意事項](#開發注意事項)

---

# 給一般使用者

## 使用流程

```
步驟 1                    步驟 2                    步驟 3
載入用電資料           加入能源資產              查看模擬結果
─────────────         ─────────────           ──────────────────
• 一鍵載入示範資料  →  • 太陽能 PPA        →   • 年度電費節省金額
• 或上傳 15 分鐘 CSV   • 儲能 BESS              • RE% 再生能源比例
• 或輸入月帳單         • 風力 / 水力            • 碳排減少量
                       • 天然氣機組             • NPV / IRR / 回本期
                       • SOFC 燃料電池          • DR 需量反應收益
```

> **最快體驗路徑**：開啟 `http://localhost`，在主畫面點擊「🚀 一鍵載入示範」，系統自動產生 1,000 kW 工廠負載 + 太陽能 300 kW + 儲能 1,000 kWh + 風力 PPA 150 kW，並自動執行模擬、繪製完整分析圖表，無需手動設定任何資產。

### 主要功能頁面

| 頁面 | 功能 |
|------|------|
| **Dashboard** `/` | 無資料時顯示資料載入面板（示範 / CSV / 電費單）；載入後切換為 KPI 卡片 + 六大分析分頁 |
| **能源策略規劃** `/strategy` | 7 種真實客戶情境（可上傳自訂 CSV）→ AI 三模型最佳化 → DR 時段排名 |
| **Settings** `/settings` | 自訂台電費率、折現率、年期等財務參數 |

### 資料重置

資料載入後，左側 Sidebar 的「基準資料已載入」狀態列右側有「**更換**」按鈕，點擊後清除基準負載、能源資產與模擬結果，回到資料載入面板重新開始。

### Dashboard 六大分析圖表

| 分頁 | 內容 |
|------|------|
| 總覽 | 逐月電費比較 + 能源結構 + AI 洞察 |
| 用電曲線 | 典型週負載曲線（可切換月份 / 週次）+ 月均熱圖 |
| 電費分析 | 月別電費對比表 + 尖峰 / 半尖峰 / 離峰明細 |
| 減碳分析 | 碳排比較 + 等效換算（種樹、車公里、飛行次數） |
| ROI 回本 | CAPEX / NPV / IRR + 20 年累積現金流量圖 |
| 需量反應 | DR 月度收益分解圖 + 年度結算明細 + 月別明細表 |

---

## 台電電費計算方法

### 費率結構

台電高壓時間電價（TOU）分為三個時段，夏月（5/16–10/15）與非夏月費率不同：

| 時段 | 定義 | 夏月費率 | 非夏月費率 |
|------|------|---------|-----------|
| **尖峰** | 平日 10:00–12:00、13:00–17:00 | NT$ 9.39/kWh | — |
| **半尖峰** | 平日 07:30–10:00、12:00–13:00、17:00–22:30 | NT$ 4.15/kWh | NT$ 3.06/kWh |
| **離峰** | 其餘時間（含週末、假日全天） | NT$ 2.53/kWh | NT$ 1.88/kWh |

**基本電費（需量費）**：NT$ 290.6 / kW / 月，依契約容量或當月最高 15 分鐘需量計收。

> 費率為系統預設值，以最新台電公告為準。可在 Settings 頁面自行調整。

### 模擬計算邏輯

加入能源資產後，模擬引擎按以下順序計算：

```
1. 原始負載（每 15 分鐘，全年 35,040 筆）
        │
        ▼
2. 扣除資產發電 / 節能量
   → 太陽能（自發）：正弦曲線 × 裝置容量 × 日照效率 0.90
   → 太陽能 PPA：同上 × 0.85，另依年度 / 月度採購上限截斷
   → 風力 PPA：容量因子 × 日夜風速曲線（cos + sin 疊加）
   → 水力 PPA：穩定基載（0.88 容量因子）
   → 儲能 BESS：離峰充電、尖峰放電，削減需量費
   → HVAC 節能：效率提升率 × 原空調負載曲線
   → EV 充電：可切換「智慧排程」移至離峰充電
   → SOFC：高效率（60%+）穩定基載，碳強度低於天然氣 40%
   → 天然氣機組：DR 調度期間啟動，其餘待機
        │
        ▼
3. 計算淨用電 → 套用 TOU 費率 → 月度帳單
        │
        ▼
4. 餘電售回：超出自用的 RE 發電 × 售電費率
        │
        ▼
5. 碳排計算：台電排放係數 0.494 kgCO₂e/kWh（MOEA 2023）
        │
        ▼
6. ROI 計算
   • 簡單回本期 = CAPEX ÷ 年淨效益
   • NPV = 20 年現金流以折現率（預設 5%）貼現
   • IRR = Newton-Raphson 法求解
```

---

## AI 最佳化決策引擎

位於 `/strategy` 頁面，核心算法在**後端 Python 服務**保護，前端僅負責渲染圖表。針對**台電需量反應（DR）** 情境提供三種 AI 決策模型，並選擇性整合 Anthropic Claude 生成自然語言投資建議。

### 什麼是台電 DR？

企業與台電簽訂 DR 合約後，台電在電網尖峰時要求企業降低用電。企業可透過啟動自備發電機或儲能系統來「頂」掉用電，並獲得每 kW 每小時約 NT$ 5 的補貼。

**關鍵約束：每次調度上限 2 小時（`DR_DISPATCH_H = 2`）**
天然氣機組、SOFC 燃料電池、BESS 儲能系統，每次 DR 事件至多連續供電 2 小時。

---

### 三種 AI 模型

| 模型 | 目標 | 核心策略 |
|------|------|---------|
| ⚡ **財務最大化** | DR 收益最大、成本最低 | 天然氣機組 70–85% + BESS 15%，化石燃料為主 |
| 🌱 **ESG 永續** | CFE 達成率優先、零天然氣 | 太陽能 PPA 60% + BESS 90%，全程潔淨電力 |
| ♻️ **碳排最小化** | 碳強度最低 | SOFC 60%（效率高、碳強度低 40%）+ BESS 35% |

### 計算流程

#### Step 1：確定「需要補多少電」

```
peak2hLoad  = DR 時段內，連續 2 小時平均負載的最大值
              （取最惡化時刻，而非全窗口平均）

genOffset   = 既有並聯機組 × 0.9
              （已有緊急發電機的企業，這部分不需新增）

solarOffset = 既有太陽能 × DR 時段平均日照因子

netNeeded   = max(0, peak2hLoad − genOffset − solarOffset)
              ↑ 這才是真正需要新增資產的容量
```

#### Step 2：按模型分配容量

| 資產 | 財務最大化 | ESG 永續 | 碳排最小化 |
|------|-----------|---------|-----------|
| 天然氣 kW | netNeeded × 70–85% | 0 | 0 |
| SOFC kW | 0 | 0 | netNeeded × 60% |
| BESS kWh | `2h × netNeeded × 15%` | `2h × netNeeded × 90%` | `2h × netNeeded × 35%` |
| 太陽能 PPA kW | 日間 × 20% | 日間 × 60% | 日間 × 25% |
| 風力 PPA kW | 早峰 × 20% | 日間 15% / 夜間 45% | 日間 15% / 夜間 38% |
| 水力 PPA kW | 0 | × 20% | × 13% |

> **BESS kWh 換算**：BESS 容量單位是 kWh（能量），DR 2 小時的出力功率 = `kWh ÷ 2h`。

#### Step 3：計算 DR 收益

```
drCapacity = min(
  natgas × 0.5 + (bess_kWh ÷ 2h) × 0.90 + sofc × 0.6,
  peakKw × 35%    ← 台電申報上限
)

drRevenue = drCapacity × 2h × 年事件次數 × NT$5/kW/h × 費率加乘
```

#### Step 4：負載吻合度評分，選出最佳 DR 時段

同一個客戶情境，三個 DR 時段的最佳選擇**不同**。評分時同時考量台電費率與客戶自身的負載分布：

| 時段 | 費率加乘 | 年事件次數 |
|------|---------|----------|
| 夏季尖峰（10–17時） | × 1.35 | 60 次 |
| 夏季半尖峰（17–22時） | × 1.00 | 80 次 |
| 非夏月半峰（07–22時） | × 0.80 | 50 次 |

**負載吻合度（loadAlignment）**：

```
peak2h_in_window = 此 DR 時段內，連續 2h 平均負載的最大值
loadAlignment    = min(1, peak2h_in_window / 客戶尖峰 kW)
loadPct          = round(loadAlignment × 100)  ← 顯示於 UI 卡片
```

各模型評分公式（含吻合度加權）：

| 模型 | 評分公式 | 指標 |
|------|---------|------|
| 財務最大化 | `DR 收益 × (0.3 + 0.7 × loadAlignment) − CAPEX / 20` | 年度 DR 收益 |
| ESG 永續 | `CFE% × 100 − CAPEX / 500萬` | CFE 達成率 |
| 碳排最小化 | `(−碳排 + DR收益 / 30萬) × (0.4 + 0.6 × loadAlignment)` | 年度碳排 tCO₂e |

> 日間尖峰的工廠（如 EV 充電站）會推薦夏季尖峰（10–17時）；深夜高負載的場域（如藝文場館）則推薦非夏月半峰。負載吻合度差的時段，即使費率較高，得分仍會降低。

#### Step 5：Claude AI 生成自然語言說明

後端設定 `ANTHROPIC_API_KEY` 後，每個推薦結果將由 Claude 生成 2–3 句個人化投資建議，包含負載吻合度、資產配置理由與預估收益。未設定 API Key 時自動 fallback 到內建模板文字。

### 新增資產造價參考

| 資產 | 單位 | 造價（NT$） |
|------|------|-----------|
| 自發太陽能 | kW | 50,000 |
| 太陽能 PPA | kW | 3,000（服務費） |
| 風力 PPA | kW | 5,000 |
| 水力 PPA | kW | 4,000 |
| 天然氣發電 | kW | 25,000 |
| SOFC 燃料電池 | kW | 80,000 |
| BESS 儲能系統 | kWh | 60,000 |

---

## 支援資產類型

| 資產 | 說明 | 適合情境 |
|------|------|---------|
| **太陽能（自發自用）** | 屋頂裝設，直接抵扣白天用電 | 有自有廠房屋頂 |
| **太陽能 PPA** | 外購太陽能電力，無需建置成本 | 無屋頂但想用綠電 |
| **風力 PPA** | 外購風力，夜間與清晨發電穩定 | 24 小時運作工廠 |
| **水力 PPA** | 外購水力，最穩定的再生能源基載 | 追求 CFE 100% |
| **HVAC 節能改造** | 空調效率提升，直接降低尖峰用電 | 辦公室 / 百貨 |
| **儲能系統 BESS** | 離峰充電、尖峰放電，削減需量費 + DR 收益 | 有明顯尖離峰差價 |
| **EV 充電樁** | 支援智慧排程，移至離峰充電 | 有 EV 車隊 / 停車場 |
| **天然氣機組** | DR 調度期間啟動（2h 上限），其餘待機 | 參與 DR 財務優先 |
| **SOFC 燃料電池** | 高效率、低碳強度，適合 24h 基載 + DR | 碳排優先 |

---

---

# 給工程師

## 技術架構

### 服務拓樸

```
                        ┌──────────────────────┐
                        │    React Frontend     │
                        │  Vite build → nginx   │
                        │     port 80           │
                        └──────────┬───────────┘
                                   │ nginx reverse proxy
              ┌────────────────────┼───────────────────────┐
     /api/simulation/*             │              /api/data/*
              ▼                    │                        ▼
  ┌───────────────────────┐        │           ┌──────────────────────┐
  │   simulation-service  │        │           │    data-service      │
  │   Python FastAPI      │        │           │    Go + chi          │
  │   port 8000           │        │           │    port 8080         │
  │                       │        │           │    CSV 上傳 / 下載   │
  │   ┌───────────────┐   │        │           └──────────────────────┘
  │   │ strategy_     │   │        │
  │   │ engine.py     │   │        │
  │   │ (AI 最佳化    │   │        │
  │   │  核心算法)    │   │        │
  │   └───────────────┘   │        │
  │          │            │        │
  │   Anthropic Claude    │        │
  │   API（選填）         │        │
  └─────────┬─────────────┘        │
            │                      │
     ┌──────┴──────┐               │
     ▼             ▼               │
 PostgreSQL      Redis             │
 baselines       baseline          │
 tariff_presets  cache 24h TTL     │
```

**商業 IP 保護**：AI 最佳化算法（資產配置、DR 評分、負載吻合度）全部在後端 Python 運算，JS bundle 不包含核心業務邏輯。

### 各服務職責

| 服務 | 技術 | 埠 | 職責 |
|------|------|---|------|
| **frontend** | React 18 + TypeScript + Vite + nginx | 80 | SPA、路由、API Proxy |
| **simulation-service** | Python FastAPI + Pandas + NumPy + Anthropic | 8000 | 電費計算、ROI、AI 洞察、DR 分析、**AI 策略最佳化** |
| **data-service** | Go 1.21 + chi | 8080 | CSV 上傳 / 下載 |
| **postgres** | PostgreSQL 16 | 5432 | 基準負載持久化、費率預設 |
| **redis** | Redis 7 | 6379 | 基準負載熱快取（24h TTL） |

### 資料流

```
用戶上傳 CSV
  → data-service 存檔
  → 前端解析後 POST /baseline/upload
  → simulation-service 存入 PostgreSQL + Redis 快取

用戶執行模擬
  → POST /simulate（帶 data_id + assets）
  → Redis 讀取基準負載（cache hit）或 PostgreSQL（fallback）
  → 即時計算 Digital Twin → 回傳結果（不持久化）

用戶使用 AI 策略規劃
  → POST /strategy/optimize（帶 scenario + objective）
  → strategy_engine.py 計算資產配置 + DR 評分 + 負載吻合度
  → 選填：呼叫 Claude API 生成自然語言建議
  → 回傳排序後的 DR 時段推薦 + 逐時模擬資料 + KPI
```

> **降級設計**：`DATABASE_URL` / `REDIS_URL` 未設定時，simulation-service 自動切換 in-memory 模式，服務照常運作，資料重啟後遺失。`ANTHROPIC_API_KEY` 未設定時，AI 文字說明 fallback 到內建模板。

### 前端 API 模組

| 模組 | 功能 |
|------|------|
| `api/simulation.ts` | 產生範例負載、上傳 CSV、執行模擬、AI 洞察、示範情境定義 |
| `api/demand_response.ts` | DR 需量反應收益計算 |
| `api/settings.ts` | 讀取 / 更新費率設定 |
| `api/client.ts` | HTTP 基底封裝（simApi / dataApi） |

---

## 快速啟動

### Docker Compose 完整服務（推薦，一行指令）

```bash
cp .env.example .env
# 選填：在 .env 填入 ANTHROPIC_API_KEY 啟用 Claude 自然語言建議
docker compose up --build
```

啟動後開啟 **http://localhost**，在主畫面點「🚀 一鍵載入示範」即可看到完整分析圖表。

| 服務 | 網址 |
|------|------|
| 前端 | http://localhost |
| Simulation API Swagger | http://localhost:8000/docs |
| Data Service 健康 | http://localhost:8080/health |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

```bash
# 常用指令
docker compose ps                          # 查看服務狀態
docker compose logs -f simulation-service  # 即時 log
docker compose build simulation-service   # 單獨重建後端
docker compose build frontend             # 單獨重建前端
docker compose up -d                      # 背景啟動
docker compose down                       # 停止（保留資料）
docker compose down -v                    # 停止並清除所有資料
```

---

## 完整本地開發環境

適合需要修改後端程式碼並熱重載的情境。

### 1. 啟動 PostgreSQL + Redis（可選）

```bash
docker compose up -d postgres redis
# 未啟動也沒關係，simulation-service 會自動降級為 in-memory 模式
```

### 2. simulation-service（Python 3.11+）

```bash
cd services/simulation-service
pip install -r requirements.txt

# 選填：設定 DB / Redis（不設定則 in-memory 模式）
export DATABASE_URL=postgresql://ddear:ddear_dev@localhost:5432/ddear
export REDIS_URL=redis://localhost:6379/0
export ALLOWED_ORIGINS=http://localhost:5173
export ANTHROPIC_API_KEY=sk-ant-...   # 選填，啟用 Claude 建議

python3 -m uvicorn app.main:app --reload --port 8000
# Swagger：http://localhost:8000/docs
```

### 3. data-service（Go 1.21+）

```bash
cd services/data-service
go mod download
go run ./cmd/server
# 監聽 :8080
```

### 4. frontend（Node.js 18+）

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
# Vite 自動 proxy：
#   /api/simulation/* → http://localhost:8000/api/v1/*
#   /api/data/*       → http://localhost:8080/api/v1/*
```

> **注意**：`/strategy` 頁面需要後端服務（`simulation-service`）才能運作，請確保 simulation-service 已啟動。

---

## 部署：地端 On-Premise

### 前置需求

| 元件 | 版本 | 說明 |
|------|------|------|
| Kubernetes | ≥ 1.27 | kubeadm / RKE2 / k3s 均可 |
| NGINX Ingress Controller | ≥ 1.10 | `helm install ingress-nginx ingress-nginx/ingress-nginx` |
| NFS Provisioner | — | nfs-subdir-external-provisioner（提供 ReadWriteMany PVC） |
| Container Registry | — | Harbor / Docker Registry |
| kubectl + kustomize | ≥ 5.x | — |

### 部署步驟

```bash
# Step 1：建置並推送 Image
docker build -t registry.corp.internal/ddear/frontend:1.0.0           ./frontend
docker build -t registry.corp.internal/ddear/simulation-service:1.0.0 ./services/simulation-service
docker build -t registry.corp.internal/ddear/data-service:1.0.0       ./services/data-service

docker push registry.corp.internal/ddear/frontend:1.0.0
docker push registry.corp.internal/ddear/simulation-service:1.0.0
docker push registry.corp.internal/ddear/data-service:1.0.0

# Step 2：修改 Image 名稱
vim k8s/overlays/on-premise/kustomization.yaml

# Step 3：設定內部 DNS
vim k8s/overlays/on-premise/patches/ingress-patch.yaml
# 將 ddear.corp.internal 替換為實際 DNS

# Step 4：設定 Anthropic API Key（選填）
kubectl -n ddear create secret generic ddear-secrets \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-...

# Step 5：套用
kubectl apply -k k8s/overlays/on-premise

# Step 6：驗證
kubectl -n ddear get pods,svc,ingress
kubectl -n ddear exec -it deploy/simulation-service -- curl localhost:8000/health
kubectl -n ddear exec -it deploy/data-service      -- wget -qO- localhost:8080/health
```

---

## 部署：GitHub Pages（前端展示）

GitHub Pages 僅能托管靜態檔案，因此只有 React 前端會部署；後端 Python / Go 服務需另行部署（或使用 Docker Compose 在本地運行）。

### 一次性設定（只需做一次）

1. **啟用 GitHub Pages**：前往 `https://github.com/bdisonlin/DDEAR_MVP/settings/pages`，將 **Source** 設為 **GitHub Actions**。

2. **（選填）設定後端 API URL**：若已將 simulation-service 部署至外部主機，前往 repo **Settings → Variables → Actions**，新增：

   | 變數名稱 | 值（範例） |
   |---------|-----------|
   | `VITE_SIMULATION_API_URL` | `https://your-backend.example.com/api/v1` |
   | `VITE_DATA_API_URL` | `https://your-data-service.example.com/api/v1` |

   未設定時，前端 API 呼叫會因無法連線後端而失敗（靜態展示模式）。

### 自動部署

推送到 `main` 分支後，GitHub Actions 自動執行建置並發布：

```bash
git push origin main
# ⏳ 等待約 1–2 分鐘
# ✅ 完成後開啟：https://bdisonlin.github.io/DDEAR_MVP/
```

### 手動觸發

```
GitHub repo → Actions → Deploy to GitHub Pages → Run workflow
```

### 工作流程說明

`.github/workflows/deploy-pages.yml` 執行以下步驟：

```
1. checkout 原始碼
2. node 20 + npm ci 安裝依賴
3. npm run build（帶入 VITE_BASE_PATH=/DDEAR_MVP/）
4. 複製 dist/index.html → dist/404.html（處理 SPA 直連路由 404）
5. upload-pages-artifact → deploy-pages
```

> **SPA 路由說明**：GitHub Pages 不認識 React Router 的客戶端路由，直接輸入 `/DDEAR_MVP/strategy` 會得到 404。藉由讓 GitHub Pages 的自訂 404 頁面回傳 React 的 `index.html`，瀏覽器仍能正確渲染對應的元件。

---

## 部署：雲端

透過 Kustomize Overlays 管理各雲端差異，僅需切換 StorageClass 與 Ingress。

### AWS EKS

```bash
kubectl apply -k k8s/overlays/aws
```

| 元件 | 選型 |
|------|------|
| Ingress | ALB（Application Load Balancer） |
| Storage | `efs-sc`（Amazon EFS，ReadWriteMany） |
| Registry | ECR |

### GCP GKE

```bash
kubectl apply -k k8s/overlays/gcp
```

| 元件 | 選型 |
|------|------|
| Ingress | GKE Ingress（GCE L7 LB） |
| Storage | `filestore-rwx`（Cloud Filestore） |
| Registry | Artifact Registry |

### Azure AKS

```bash
kubectl apply -k k8s/overlays/azure
```

| 元件 | 選型 |
|------|------|
| Ingress | AGIC（Application Gateway Ingress Controller） |
| Storage | `azurefile-csi`（Azure Files） |
| Registry | Azure Container Registry（ACR） |

---

## API 文件

完整互動式文件：啟動後開啟 **http://localhost:8000/docs**

### simulation-service

| Method | Path | 說明 | 需要 DB |
|--------|------|------|---------|
| `POST` | `/api/v1/baseline/sample` | 產生示範工廠負載（合成全年 15 分鐘序列） | — |
| `POST` | `/api/v1/baseline/upload` | 上傳 15 分鐘 CSV | — |
| `DELETE` | `/api/v1/baseline/{data_id}` | 刪除基準資料 | — |
| `POST` | `/api/v1/simulate` | 執行 Digital Twin 模擬（電費 / 碳排 / ROI） | — |
| `POST` | `/api/v1/strategy/optimize` | **AI 策略最佳化**（資產配置 + DR 評分 + Claude 建議） | — |
| `POST` | `/api/v1/insights` | AI 洞察建議（Claude，基於模擬結果） | — |
| `POST` | `/api/v1/demand_response` | DR 需量反應收益計算 | — |
| `POST` | `/api/v1/baseline/monthly` | 月電費帳單合成分析 | — |
| `GET`  | `/api/v1/assets` | 資產類型清單 | — |
| `GET`  | `/api/v1/settings` | 讀取費率設定 | — |
| `PUT`  | `/api/v1/settings` | 更新費率設定 | — |
| `GET`  | `/api/v1/settings/presets` | 列出費率預設 | ✓ |
| `POST` | `/api/v1/settings/presets` | 新增費率預設 | ✓ |
| `PUT`  | `/api/v1/settings/presets/{id}` | 更新費率預設 | ✓ |
| `DELETE` | `/api/v1/settings/presets/{id}` | 刪除費率預設 | ✓ |
| `POST` | `/api/v1/settings/presets/{id}/apply` | 套用費率預設 | ✓ |
| `GET`  | `/health` | 服務 + DB + Redis 狀態 | — |

> 標示 ✓ 的端點在未設定 `DATABASE_URL` 時回傳 HTTP 503。

#### `/api/v1/strategy/optimize` 請求 / 回應範例

```jsonc
// POST /api/v1/strategy/optimize
{
  "scenario": {
    "id": "factory",
    "label": "工廠",
    "load_profile": [/* 24 小時平均負載 kW */],
    "peak_kw": 1000,
    "existing_gen_kw": 0,
    "gen_paralleled": false,
    "existing_solar_kw": 0
  },
  "objective": "costMin"   // "costMin" | "esg" | "lowCarbon"
}

// Response
{
  "scores": [
    {
      "dr_id": "summer_peak",
      "dr_label": "夏季尖峰",
      "dr_start": 10, "dr_end": 17,
      "score": 12345.6,
      "value_label": "DR 42 萬/年",
      "load_pct": 88,         // 負載吻合度 %
      "params": { "natgas": 700, "bess": 210, ... },
      "hourly_data": [ ... ], // 25h 逐時模擬
      "kpis": { "capex": ..., "dr_revenue": ..., "cfe_rate": ..., "carbon": ... },
      "ai_text": "【財務最大化・夏季尖峰】此時段與貴廠用電尖峰吻合度 88%…"
    },
    ...   // 共 3 個 DR 時段，依分數排序
  ],
  "objective": "costMin",
  "scenario_id": "factory"
}
```

### data-service（Go）

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/v1/files/upload` | 上傳 CSV（multipart/form-data，field: `file`） |
| `GET`  | `/api/v1/files/{fileID}` | 下載 CSV |
| `DELETE` | `/api/v1/files/{fileID}` | 刪除檔案 |
| `GET`  | `/health` | 健康狀態 |

---

## 專案結構

```
DDEAR_MVP/
│
├── frontend/                        # React 18 + TypeScript + Vite
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts            # simApi / dataApi 基底封裝
│   │   │   ├── simulation.ts        # 模擬、基準負載、AI 洞察、示範情境 / DEMO_ASSETS
│   │   │   ├── demand_response.ts   # DR 需量反應
│   │   │   └── settings.ts          # 費率設定 CRUD
│   │   │
│   │   ├── components/
│   │   │   ├── charts/              # HeatmapChart / LoadChart / CostChart
│   │   │   │                        # RoiChart / DrChart（Recharts + D3）
│   │   │   ├── dashboard/           # KpiCards
│   │   │   ├── layout/              # Header / Sidebar（頁面上下文感知）/ Layout
│   │   │   ├── sandbox/             # AssetForm 資產沙盒
│   │   │   └── sidebar/             # MonthlyBillForm
│   │   │
│   │   ├── context/                 # ThemeContext（深色 / 淺色）
│   │   ├── hooks/                   # useTilt（3D 傾斜）/ useTheme
│   │   ├── pages/
│   │   │   ├── Welcome.tsx          # ★ 已棄用，路由已移除，邏輯整合至 Dashboard EmptyState
│   │   │   ├── Dashboard.tsx        # 主沙盒儀表板：無資料 → EmptyState（內嵌兩欄版型）
│   │   │   │                        #   有資料 → KPI 卡片 + 六大分析分頁
│   │   │   ├── EnergyStrategy.tsx   # AI 策略規劃（D3 圖表 + 後端 API）
│   │   │   └── Settings.tsx         # 費率 / 財務參數設定
│   │   ├── store/                   # Zustand 全域狀態（baseline / assets / simResult…）
│   │   ├── types/                   # TypeScript 型別定義
│   │   └── utils/                   # fmtNtd / fmtPct
│   │
│   ├── index.css                    # Liquid Glass 設計系統（.glass-liquid / .btn-glass…）
│   ├── nginx.conf                   # Production nginx + API proxy 設定
│   └── Dockerfile                   # 多階段：Node build → nginx
│
├── services/
│   ├── simulation-service/          # Python FastAPI（port 8000）
│   │   └── app/
│   │       ├── api/routes/
│   │       │   ├── baseline.py      # 基準負載上傳 / 示範生成
│   │       │   ├── simulate.py      # Digital Twin 模擬
│   │       │   ├── strategy.py      # AI 策略最佳化路由
│   │       │   ├── insights.py      # Claude AI 洞察
│   │       │   ├── demand_response.py
│   │       │   ├── monthly_bill.py
│   │       │   ├── assets.py
│   │       │   └── settings.py
│   │       ├── assets/              # 各資產發電曲線產生（solar / wind / hydro / sofc…）
│   │       ├── core/
│   │       │   ├── strategy_engine.py  # ★ AI 最佳化核心算法（IP 保護）
│   │       │   ├── simulator.py        # Digital Twin 模擬引擎
│   │       │   ├── tariff.py           # 台電費率計算
│   │       │   ├── tariff_config.py    # 費率配置管理
│   │       │   ├── roi.py              # NPV / IRR 計算
│   │       │   ├── demand_response.py  # DR 收益計算
│   │       │   └── tariff_data.json    # 台電費率資料（volume mount，可熱更新）
│   │       ├── db/
│   │       │   ├── connection.py    # PG + Redis 連線（自動降級）
│   │       │   └── __init__.py
│   │       ├── schemas/
│   │       │   ├── strategy.py      # AI 策略 Pydantic 模型
│   │       │   └── simulation.py    # 模擬 Pydantic 模型
│   │       ├── utils/               # 示範負載產生器
│   │       ├── store.py             # 基準負載讀寫（PG + Redis + in-memory fallback）
│   │       └── main.py              # FastAPI 入口（8 個路由）
│   │
│   └── data-service/                # Go 1.21 + chi（port 8080）
│       ├── cmd/server/              # 主程式
│       └── internal/
│           ├── handler/             # upload / health
│           └── storage/             # 本地檔案存取
│
├── k8s/
│   ├── base/                        # Kustomize base manifests
│   └── overlays/
│       ├── on-premise/              # NFS + nginx-ingress
│       ├── aws/                     # EFS + ALB
│       ├── gcp/                     # Filestore + GCE LB
│       └── azure/                   # Azure Files + AGIC
│
├── docker-compose.yml               # 一鍵本地啟動（5 個服務）
├── .env.example                     # 環境變數範本
└── README.md
```

---

## 前端 UX 架構

### Liquid Glass 設計系統

整體 UI 採用 Apple iOS 26「Liquid Glass」風格，核心原則為半透明材質感與層次光效。

| CSS class | 用途 | 核心屬性 |
|-----------|------|---------|
| `.glass-sidebar` | 左側導覽列 | `background: rgba(246,246,252,0.80); backdrop-filter: blur(48px)` |
| `.glass-liquid` | 一般卡片 / 面板 | `background: rgba(255,255,255,0.62); backdrop-filter: blur(40px) saturate(2.2)` |
| `.glass-header` | 頂部 Header | `background: rgba(255,255,255,0.76); backdrop-filter: blur(40px)` |
| `.btn-glass` | 透明玻璃按鈕 | `background: rgba(255,255,255,0.32); color: #007AFF` |
| `.btn-primary` | 主要行動按鈕 | 藍色系 + hover 時 shimmer 掃光動畫（`::before` pseudo） |
| `.segment-ctrl` | iOS 分段選擇器 | 仿原生 UISegmentedControl |

動畫 token（`tailwind.config.js`）：`animate-float`（漂浮）、`animate-glow-pulse`（光暈脈衝）、`animate-slide-up`（彈入，spring easing）。

### 頁面上下文感知 Sidebar

Sidebar 會依目前路由決定顯示哪些面板，避免跨頁殘留：

```tsx
const location = useLocation()
const isDashboard = location.pathname === '/'

// 以下三個區塊僅在 Dashboard 且已載入基準資料時顯示
{baseline && isDashboard && <BaselineStatusStrip />}   // 綠色狀態列 + 更換按鈕
{baseline && isDashboard && <AssetsPanel />}            // 能源資產配置
{baseline && isDashboard && <DemandResponsePanel />}    // 需量反應試算
```

切換至策略規劃 `/strategy` 或設定 `/settings` 時，Sidebar 只保留導覽列，不殘留資料設定面板。

### Dashboard EmptyState 兩欄版型

無基準資料時，Dashboard 渲染內嵌的 `EmptyState` 元件（而非跳轉到 Welcome 頁）。版型為響應式兩欄 grid，充分利用主內容區的寬度：

```
┌─────────────────────────────────────────────────────┐
│  左欄（1fr）                  右欄（1.05fr）         │
│  ┌────────────────────┐       ┌───────────────────┐ │
│  │  DDEAR logo        │       │ 示範 / CSV / 月帳單│ │
│  │  品牌說明          │       │ (segment-ctrl)    │ │
│  │  4 個功能特點      │       │                   │ │
│  └────────────────────┘       │ 表單內容          │ │
│                               │ ✦ 一鍵載入示範    │ │
│                               └───────────────────┘ │
└─────────────────────────────────────────────────────┘
  手機版自動折疊為單欄（grid-cols-1）
```

資料載入後，`baseline` 狀態更新，Dashboard 自動切換為 KPI + 圖表模式，無需路由跳轉。

### 資料重置流程

```tsx
const handleReset = () => {
  setBaseline(null)   // 清除基準負載 → Dashboard 回到 EmptyState
  clearAssets()        // 清除能源資產清單
  setSimResult(null)  // 清除模擬結果
  setInsights([])      // 清除 AI 洞察
  setSimError(null)
}
```

重置後 Sidebar 的三個資料面板因 `baseline` 為 null 而自動隱藏，回到乾淨初始狀態。

---

## 開發注意事項

### 環境變數

| 變數 | 說明 | 預設 / 必填 |
|------|------|-----------|
| `ALLOWED_ORIGINS` | simulation-service CORS 允許來源 | `*`（開發）→ 需改為具體域名（生產） |
| `DATABASE_URL` | PostgreSQL 連線字串 | 選填，未設定 → in-memory |
| `REDIS_URL` | Redis 連線字串 | 選填，未設定 → 快取停用 |
| `DATA_DIR` | data-service 檔案儲存目錄 | `/data/uploads` |
| `ANTHROPIC_API_KEY` | Claude AI（`/insights` + `/strategy/optimize` 端點） | 選填，未設定 → rule-based fallback |
| `VITE_SIMULATION_API_URL` | 前端 Vite dev proxy 目標 | `http://localhost:8000/api/v1` |
| `VITE_DATA_API_URL` | 前端 Vite dev proxy 目標 | `http://localhost:8080/api/v1` |

### PostgreSQL Schema

```sql
baselines        -- 基準負載序列（gzip 壓縮存 BYTEA）
tariff_presets   -- 使用者儲存的費率設定預設
```

模擬結果與 AI 策略分析結果**均不持久化**，每次請求即時計算回傳。

### Redis Cache

```
baseline:{id}:series  → gzip 壓縮的基準負載序列（TTL 24h）
baseline:{id}:meta    → voltage / contracted_kw / bill_type（TTL 24h）
```

### CSV 格式規範

上傳的 CSV 必須包含以下兩欄，15 分鐘間距，至少 1 天（96 筆）：

```csv
timestamp,load_kw
2024-01-01 00:00:00,312.5
2024-01-01 00:15:00,298.0
...
```

`/strategy` 頁面也支援上傳一週 CSV，系統會自動彙整為 24 小時平均負載曲線送後端分析。

### 台電費率調整

費率儲存於：`services/simulation-service/app/core/tariff_data.json`

docker-compose 已將此檔案以 volume mount 方式掛載，修改後**不需重建 image**，直接呼叫 `PUT /api/v1/settings` 即可熱更新。

### 程式碼重要節點

| 功能 | 位置 |
|------|------|
| AI 最佳化核心算法 | `services/simulation-service/app/core/strategy_engine.py` |
| DR 負載吻合度評分 | `strategy_engine.py → compute_dr_scores()` |
| Claude API 整合 | `strategy_engine.py → get_ai_text()` |
| Digital Twin 引擎 | `services/simulation-service/app/core/simulator.py` |
| 台電費率計算 | `services/simulation-service/app/core/tariff.py` |
| 前端示範情境定義 | `frontend/src/api/simulation.ts → DEMO_ASSETS` |
| Dashboard 空狀態（資料載入面板） | `frontend/src/pages/Dashboard.tsx → EmptyState()` |
| Sidebar 頁面上下文感知 | `frontend/src/components/layout/Sidebar.tsx → isDashboard` |
| 全域重置邏輯 | `frontend/src/components/layout/Sidebar.tsx → handleReset()` |
| Liquid Glass 設計系統 | `frontend/src/index.css` |
| nginx API proxy | `frontend/nginx.conf` |

---

> DDEAR MVP · Energy Digital Twin Sandbox
> 台電費率資料僅供參考，實際費率以台電公告為準。
