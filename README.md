# DDEAR — 能源數位孿生沙盒

> **Dynamic Digital Energy Asset ROI**
> 讓企業在投資前，先用數位孿生看到結果。

---

## 這個專案是什麼？

DDEAR 是一個**企業能源資產投資決策沙盒**。企業在決定是否安裝太陽能、儲能、風力發電等設備前，可以：

1. 匯入自己的 15 分鐘用電資料（或使用內建示範資料）
2. 自由組合各種能源資產
3. 即時看到「導入後的電費節省、碳排減少、ROI 回本期」
4. 透過 AI 最佳化引擎，找出最適合參與台電需量反應（DR）的資產配置

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
• 上傳 15 分鐘 CSV  →  • 太陽能 PPA        →   • 年度電費節省金額
• 或載入示範資料       • 儲能 BESS              • RE% 再生能源比例
• 或輸入月帳單         • 風力 / 水力            • 碳排減少量
                       • 天然氣機組             • NPV / IRR / 回本期
                       • SOFC 燃料電池          • DR 需量反應收益
```

### 主要功能頁面

| 頁面 | 功能 |
|------|------|
| **Dashboard** `/dashboard` | 匯入用電資料 → 組合能源資產 → 即時 KPI + 圖表 |
| **能源策略規劃** `/strategy` | 7 種真實客戶情境 → AI 三模型最佳化 → DR 時段排名 |
| **Settings** `/settings` | 自訂台電費率、折現率、年期等財務參數 |

> **最快體驗路徑**：直接開啟 `/strategy`，不需要任何帳號或後端服務，選擇一個客戶情境即可立刻看到 AI 分析結果。

---

## 台電電費計算方法

### 費率結構

台電高壓時間電價（TOU）分為三個時段，夏月（5/16–10/15）與非夏月費率不同：

| 時段 | 定義 | 夏月費率 | 非夏月費率 |
|------|------|---------|-----------|
| **尖峰** | 平日 10:00–12:00、13:00–17:00 | NT$ 6.07/kWh | — |
| **半尖峰** | 平日 07:30–10:00、12:00–13:00、17:00–22:30 | NT$ 3.29/kWh | NT$ 2.49/kWh |
| **離峰** | 其餘時間（含週末、假日全天） | NT$ 1.56/kWh | NT$ 1.56/kWh |

**基本電費（需量費）**：NT$ 290.6 / kW / 月，依契約容量或當月最高 15 分鐘需量計收。

> 費率為近似值，以最新台電公告為準。可在 Settings 頁面自行調整。

### 模擬計算邏輯

加入能源資產後，模擬引擎按以下順序計算：

```
1. 原始負載（每 15 分鐘）
        │
        ▼
2. 扣除資產發電 / 節能量
   → 太陽能：正弦曲線 × 裝置容量 × 地區日照效率
   → 儲能：離峰充電、尖峰放電，削減需量費
   → 風力：容量因子 × 風速日夜曲線
   → 水力：穩定基載（0.88 容量因子）
   → HVAC 節能：效率提升 × 原空調負載
   → EV 充電：可切換「智慧排程」移至離峰
        │
        ▼
3. 計算淨用電 → 套用 TOU 費率 → 月度帳單
        │
        ▼
4. 餘電售回：超出自用的 RE 發電 × NT$ 4.0/kWh
        │
        ▼
5. 碳排計算：台電排放係數 0.494 kgCO₂e/kWh（MOEA 2023）
        │
        ▼
6. ROI 計算：
   • 簡單回本期 = CAPEX ÷ 年淨效益
   • NPV = 20 年現金流以折現率（預設 5%）貼現
   • IRR = Newton-Raphson 法求解
```

---

## AI 最佳化決策引擎

位於 `/strategy` 頁面，純前端運算，不需後端。針對 **台電需量反應（DR）** 情境提供三種 AI 決策模型。

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

#### Step 4：三個 DR 時段評分，找出最佳時段

| 時段 | 費率加乘 | 年事件次數 |
|------|---------|----------|
| 夏季尖峰（10–17時） | × 1.35 | 60 次 |
| 夏季半尖峰（17–22時） | × 1.00 | 80 次 |
| 非夏月半峰（07–22時） | × 0.80 | 50 次 |

各模型分別對三個時段計算分數，排出 🥇🥈🥉：

| 模型 | 評分公式 | 指標 |
|------|---------|------|
| 財務最大化 | `DR 收益 − CAPEX / 20` | 年度 DR 收益 |
| ESG 永續 | `CFE% × 100 − CAPEX / 500萬` | CFE 達成率 |
| 碳排最小化 | `−碳排 + DR收益 / 30萬` | 年度碳排 tCO₂e |

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
| **天然氣機組** | 最低成本的 DR 備援電力 | 參與 DR 財務優先 |
| **SOFC 燃料電池** | 高效率、低碳強度，適合 24h 基載 + DR | 碳排優先 |

---

---

# 給工程師

## 技術架構

### 服務拓樸

```
                        ┌──────────────────┐
                        │  React Frontend  │
                        │  (Vite + nginx)  │
                        └────────┬─────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │ /api/simulation/ │                   │ /api/data/
              ▼                  │                   ▼
  ┌─────────────────────┐        │        ┌──────────────────┐
  │  simulation-service  │        │        │  data-service    │
  │  Python FastAPI      │        │        │  Go + chi        │
  │  + Anthropic SDK     │        │        │  CSV 檔案接收    │
  └────────┬────────────┘        │        └──────────────────┘
           │                     │
    ┌──────┴──────┐               │  ⚡ /strategy 頁面完全在
    │             │               │  瀏覽器運算，不需後端
    ▼             ▼               │
PostgreSQL      Redis
baselines       baseline
tariff_presets  cache 24h TTL
```

### 各服務職責

| 服務 | 技術 | 埠 | 職責 |
|------|------|---|------|
| **frontend** | React 18 + TypeScript + Vite + nginx | 80 / 5173 | SPA、路由、API Proxy |
| **simulation-service** | Python FastAPI + Pandas + NumPy | 8000 | 電費計算、ROI、AI 洞察、DR 分析 |
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
```

> **降級設計**：`DATABASE_URL` / `REDIS_URL` 未設定時，simulation-service 自動切換 in-memory 模式，服務照常運作，資料重啟後遺失。

### 前端 API 模組

| 模組 | 功能 |
|------|------|
| `api/simulation.ts` | 產生範例負載、上傳 CSV、執行模擬、AI 洞察 |
| `api/demand_response.ts` | DR 需量反應收益計算 |
| `api/settings.ts` | 讀取 / 更新費率設定 |
| `api/client.ts` | HTTP 基底封裝（simApi / dataApi） |

---

## 快速啟動

### 選項 A：只看前端（零依賴，30 秒）

不需 Node.js 以外的任何東西。`/strategy` 頁面完全在瀏覽器運算。

```bash
cd frontend
npm install
npm run dev
# 開啟 http://localhost:5173/strategy
```

---

### 選項 B：Docker Compose 完整服務（推薦）

一行指令啟動全部 5 個服務。

```bash
cp .env.example .env
docker compose up --build
```

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
docker compose up --build simulation-service  # 單獨重建
docker compose down                        # 停止（保留資料）
docker compose down -v                     # 停止並清除所有資料
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

uvicorn app.main:app --reload --port 8000
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

### Production Build 預覽

```bash
cd frontend
npm run build    # 輸出至 frontend/dist/
npm run preview  # http://localhost:4173
```

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

# Step 4：套用
kubectl apply -k k8s/overlays/on-premise

# Step 5：驗證
kubectl -n ddear get pods,svc,ingress
kubectl -n ddear exec -it deploy/simulation-service -- curl localhost:8000/health
kubectl -n ddear exec -it deploy/data-service      -- wget -qO- localhost:8080/health
```

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
| `POST` | `/api/v1/baseline/sample` | 產生示範工廠負載 | — |
| `POST` | `/api/v1/baseline/upload` | 上傳 15 分鐘 CSV | — |
| `DELETE` | `/api/v1/baseline/{data_id}` | 刪除基準資料 | — |
| `POST` | `/api/v1/simulate` | 執行 Digital Twin 模擬 | — |
| `POST` | `/api/v1/insights` | AI（Claude）洞察建議 | — |
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
│   │   ├── api/                     # HTTP 客戶端
│   │   │   ├── client.ts            # simApi / dataApi 基底封裝
│   │   │   ├── simulation.ts        # 模擬、基準負載、AI 洞察
│   │   │   ├── demand_response.ts   # DR 需量反應
│   │   │   └── settings.ts          # 費率設定 CRUD
│   │   │
│   │   ├── components/
│   │   │   ├── charts/              # HeatmapChart / LoadChart / CostChart
│   │   │   │                        # RoiChart / DrChart（Recharts + D3）
│   │   │   ├── dashboard/           # KpiCards
│   │   │   ├── layout/              # Header / Sidebar / Layout
│   │   │   ├── sandbox/             # AssetForm 資產沙盒
│   │   │   └── sidebar/             # MonthlyBillForm
│   │   │
│   │   ├── context/                 # ThemeContext（深色 / 淺色）
│   │   ├── hooks/                   # useTilt（3D 傾斜）/ useTheme
│   │   ├── pages/
│   │   │   ├── Welcome.tsx          # 首頁
│   │   │   ├── Dashboard.tsx        # 主沙盒儀表板
│   │   │   ├── EnergyStrategy.tsx   # AI 策略規劃（D3 + 純前端運算）
│   │   │   └── Settings.tsx         # 費率 / 財務參數設定
│   │   ├── store/                   # Zustand 全域狀態
│   │   ├── types/                   # TypeScript 型別定義
│   │   └── utils/                   # fmtNtd / fmtPct / fmtKwh
│   │
│   ├── nginx.conf                   # Production nginx + API proxy
│   └── Dockerfile                   # 多階段：Node build → nginx
│
├── services/
│   ├── simulation-service/          # Python FastAPI
│   │   └── app/
│   │       ├── api/routes/          # 7 個路由模組
│   │       ├── assets/              # 各資產發電曲線產生
│   │       ├── core/                # 電費計算 / 模擬引擎 / ROI / DR
│   │       ├── db/
│   │       │   ├── connection.py    # PG + Redis 連線（自動降級）
│   │       │   └── __init__.py
│   │       ├── schemas/             # Pydantic 請求 / 回應模型
│   │       ├── utils/               # 示範負載產生器
│   │       ├── store.py             # 基準負載讀寫（PG + Redis + fallback）
│   │       └── main.py              # FastAPI 入口
│   │
│   └── data-service/                # Go 1.21 + chi
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
├── docker-compose.yml               # 一鍵本地啟動
├── .env.example                     # 環境變數範本
└── README.md
```

---

## 開發注意事項

### 環境變數

| 變數 | 說明 | 預設 / 必填 |
|------|------|-----------|
| `ALLOWED_ORIGINS` | simulation-service CORS 允許來源 | `*`（開發）→ 需改為具體域名（生產） |
| `DATABASE_URL` | PostgreSQL 連線字串 | 選填，未設定 → in-memory |
| `REDIS_URL` | Redis 連線字串 | 選填，未設定 → 快取停用 |
| `DATA_DIR` | data-service 檔案儲存目錄 | `/data/uploads` |
| `ANTHROPIC_API_KEY` | Claude AI 洞察（`/insights` 端點） | 選填，未設定 → rule-based fallback |
| `VITE_SIMULATION_API_URL` | 前端 Vite dev proxy 目標 | `http://localhost:8000/api/v1` |
| `VITE_DATA_API_URL` | 前端 Vite dev proxy 目標 | `http://localhost:8080/api/v1` |

### PostgreSQL Schema

```sql
baselines        -- 基準負載序列（gzip 壓縮存 BYTEA）
tariff_presets   -- 使用者儲存的費率設定預設
```

模擬結果**不持久化**，每次請求即時計算回傳。

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

### 台電費率調整

費率儲存於：`services/simulation-service/app/core/tariff_data.json`

docker-compose 已將此檔案以 volume mount 方式掛載，修改後**不需重建 image**，直接呼叫 `PUT /api/v1/settings` 即可熱更新。

---

> DDEAR MVP · Energy Digital Twin Sandbox
> 台電費率資料僅供參考，實際費率以台電公告為準。
