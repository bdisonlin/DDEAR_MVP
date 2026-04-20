# DDEAR — 能源數位孿生沙盒

**Dynamic Digital Energy Asset ROI**

企業用電分析與能源資產投資回本（ROI）評估平台。以 Digital Twin 技術，動態模擬太陽能、儲能、風力等資產加入後，對電費成本、再生能源比例（RE%）及碳排放的影響。

---

## 目錄

- [專案背景](#專案背景)
- [系統架構](#系統架構)
- [電費分析方法](#電費分析方法)
- [前後端分離說明](#前後端分離說明)
- [本地開發啟動](#本地開發啟動)
- [K8s 部署（地端 On-Premise）](#k8s-部署地端-on-premise)
- [遷移至雲端](#遷移至雲端)
- [API 文件](#api-文件)

---

## 專案背景

企業評估廠房設備投資時，需根據：
- 台電電費單（基本電費 + 流動電費）
- 每 15 分鐘用電資料
- 各類能源資產（太陽能、儲能、風力…）的發電/用電曲線

計算導入新設備後的 ROI（回本期、NPV、IRR）。

DDEAR 提供一個 **沙盒（Sandbox）工具**：每加入一種資產，即時更新模擬結果，讓決策者以視覺化方式比較「現況 vs 導入後」的差異。

---

## 系統架構

```
┌──────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                  │
│                                                      │
│  ┌─────────────┐   /api/simulation/   ┌───────────┐  │
│  │   Frontend  │ ──────────────────►  │ Simulation│  │
│  │  React + TS │                      │  Service  │  │
│  │   (nginx)   │ ──────────────────►  │ (FastAPI) │  │
│  └─────────────┘   /api/data/         └───────────┘  │
│        │                               ┌───────────┐  │
│        └──────────────────────────────►│   Data    │  │
│                                        │  Service  │  │
│                                        │   (Go)    │  │
│                                        └─────┬─────┘  │
│                                              │        │
│                                        PersistentVol  │
│                                        (CSV uploads)  │
└──────────────────────────────────────────────────────┘
```

### 微服務職責

| 服務 | 技術 | 埠號 | 職責 |
|------|------|------|------|
| **frontend** | React + TypeScript + Vite + nginx | 80 | SPA UI、API Proxy |
| **simulation-service** | Python FastAPI + Pandas + NumPy | 8000 | 用電模擬、電費計算、ROI、碳排分析 |
| **data-service** | Go + chi | 8080 | CSV 檔案上傳/下載、資料儲存 |

---

## 電費分析方法

### 台電高壓時間電價（TOU）

| 時段 | 夏季（6–9月） | 非夏季 |
|------|-------------|--------|
| **尖峰** 平日 10:00–12:00, 13:00–17:00 | NT$ 6.07/kWh | NT$ 4.27/kWh |
| **半尖峰** 平日 7:30–10:00, 12:00–13:00, 17:00–22:30 | NT$ 3.29/kWh | NT$ 2.49/kWh |
| **離峰** 其餘時間 | NT$ 1.56/kWh | NT$ 1.56/kWh |

**基本電費**：NT$ 290.6 / kW / 月（依契約容量或月最高需量計）

> 費率均為近似值，實際費率以台電公告為準。

### Digital Twin 模擬邏輯

1. **基準負載**：以企業 15 分鐘用電資料建立全年 35,040 筆基準線
2. **資產疊加**：每加入一種資產，套用對應發電/節能曲線
   - 太陽能 / 風力 / 水力：從淨負載中扣除再生能源發電量
   - 空調效率提升：依冷房月份與時段折減負載
   - 儲能：離峰（0–7時）充電，尖峰（10–17時 平日）放電
   - 充電樁：智慧排程 → 離峰充電；非智慧 → 日間充電
3. **餘電售回**：RE 發電超過自用量的部分，以 NT$ 4.0/kWh 計算收入
4. **碳排放**：以台電排放係數 **0.494 kgCO₂e/kWh**（MOEA 2023）計算

### ROI 計算

- **簡單回本期**：`CAPEX ÷ 年淨效益`
- **NPV**：以折現率（預設 5%）對 20 年現金流貼現
- **IRR**：Newton-Raphson 法求解內部報酬率

---

## 前後端分離說明

### 資料流

```
使用者上傳 CSV
    │
    ▼
React 前端
    │── POST /api/simulation/baseline/upload ──► simulation-service 解析並儲存
    │                                           回傳 data_id
    │
    │── POST /api/simulation/simulate ──────────► 以 data_id + assets 執行模擬
    │                                           回傳 KPI + monthly + ROI + load_chart
    ▼
Dashboard 即時更新圖表與指標
```

### Vite Proxy（開發模式）

```typescript
// vite.config.ts
proxy: {
  '/api/simulation' → http://localhost:8000/api/v1
  '/api/data'       → http://localhost:8080/api/v1
}
```

### nginx Proxy（Production/K8s）

```nginx
location /api/simulation/ { proxy_pass http://simulation-service:8000/api/v1/; }
location /api/data/       { proxy_pass http://data-service:8080/api/v1/; }
```

---

## 本地開發啟動

### 方式一：Docker Compose（推薦）

```bash
# 1. 複製環境變數範本
cp .env.example .env

# 2. 一鍵啟動所有服務
docker compose up --build

# 開啟瀏覽器
open http://localhost
```

服務位址：
- 前端：http://localhost
- simulation-service API 文件：http://localhost:8000/docs
- data-service 健康狀態：http://localhost:8080/health

### 方式二：手動分別啟動

#### 1. simulation-service（Python）

```bash
cd services/simulation-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 2. data-service（Go）

```bash
cd services/data-service
go mod download
go run ./cmd/server
```

#### 3. frontend（Node.js）

```bash
cd frontend
npm install
npm run dev        # 開發模式，http://localhost:3000
```

---

## K8s 部署（地端 On-Premise）

### 前置需求

| 元件 | 建議版本 | 說明 |
|------|----------|------|
| Kubernetes | ≥ 1.27 | kubeadm、RKE2、k3s 均可 |
| NGINX Ingress Controller | ≥ 1.10 | `helm install ingress-nginx ingress-nginx/ingress-nginx` |
| NFS Provisioner | nfs-subdir-external-provisioner | 提供 ReadWriteMany PVC |
| Container Registry | Harbor / Docker Registry | 存放企業內部 Image |
| kubectl + kustomize | ≥ 5.x | `kustomize build` 部署 |

### 步驟

```bash
# 1. 建置 Docker Image 並推送至企業內部 Registry
docker build -t registry.corp.internal/ddear/frontend:1.0.0           ./frontend
docker build -t registry.corp.internal/ddear/simulation-service:1.0.0 ./services/simulation-service
docker build -t registry.corp.internal/ddear/data-service:1.0.0       ./services/data-service

docker push registry.corp.internal/ddear/frontend:1.0.0
docker push registry.corp.internal/ddear/simulation-service:1.0.0
docker push registry.corp.internal/ddear/data-service:1.0.0

# 2. 更新 k8s/overlays/on-premise/kustomization.yaml 中的 image name

# 3. 修改 Ingress host
vim k8s/overlays/on-premise/patches/ingress-patch.yaml
# 將 ddear.corp.internal 改為實際內部 DNS

# 4. 套用 Kustomize
kubectl apply -k k8s/overlays/on-premise

# 5. 確認 Pod 狀態
kubectl -n ddear get pods

# 6. 開啟瀏覽器（確保 DNS 或 /etc/hosts 已設定）
open http://ddear.corp.internal
```

### 驗證部署

```bash
kubectl -n ddear get pods,svc,ingress

# 檢查 simulation-service 健康
kubectl -n ddear exec -it deploy/simulation-service -- curl localhost:8000/health

# 檢查 data-service 健康
kubectl -n ddear exec -it deploy/data-service -- wget -qO- localhost:8080/health
```

---

## 遷移至雲端

專案以 **Kustomize Overlays** 管理各環境差異，僅需更換 StorageClass 和 Ingress 設定。

### AWS EKS

```bash
# 前置：安裝 AWS Load Balancer Controller + EFS CSI Driver
kubectl apply -k k8s/overlays/aws
```

關鍵差異：
- **Ingress**：ALB（Application Load Balancer）
- **Storage**：`efs-sc`（Amazon EFS，ReadWriteMany）
- **Registry**：ECR（`aws ecr get-login-password | docker login ...`）
- **憑證**：AWS Certificate Manager（ACM）

### GCP GKE

```bash
kubectl apply -k k8s/overlays/gcp
```

關鍵差異：
- **Ingress**：GKE Ingress（GCE L7 LB）
- **Storage**：`filestore-rwx`（Cloud Filestore）
- **Registry**：Artifact Registry

### Azure AKS

```bash
kubectl apply -k k8s/overlays/azure
```

關鍵差異：
- **Ingress**：AGIC（Application Gateway Ingress Controller）
- **Storage**：`azurefile-csi`（Azure Files）
- **Registry**：Azure Container Registry（ACR）

---

## API 文件

### simulation-service（Python FastAPI）

啟動後開啟 http://localhost:8000/docs 查看完整 Swagger UI。

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/v1/baseline/sample` | 產生示範工廠負載（含 peak_kw、year 參數） |
| `POST` | `/api/v1/baseline/upload` | 上傳 CSV（欄位：timestamp, load_kw） |
| `DELETE` | `/api/v1/baseline/{data_id}` | 清除已儲存的基準資料 |
| `GET` | `/api/v1/assets` | 取得所有資產類型清單 |
| `POST` | `/api/v1/simulate` | 執行 Digital Twin 模擬，回傳完整分析結果 |
| `GET` | `/health` | 健康狀態 |

**模擬請求範例**

```json
POST /api/v1/simulate
{
  "data_id": "abc123",
  "assets": [
    {
      "id": "solar-01",
      "name": "300kWp 屋頂太陽能",
      "type": "solar_self",
      "params": {
        "capacity_kw": 300,
        "capex_ntd": 10500000,
        "annual_om_ntd": 157500
      }
    }
  ],
  "tariff_config": {
    "summer_peak": 6.07,
    "summer_semi_peak": 3.29,
    "summer_off_peak": 1.56,
    "non_summer_peak": 4.27,
    "non_summer_semi_peak": 2.49,
    "non_summer_off_peak": 1.56,
    "demand_charge": 290.6
  },
  "financial_config": {
    "discount_rate": 0.05,
    "project_years": 20
  }
}
```

### data-service（Go）

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/v1/files/upload` | 上傳 CSV 檔案（multipart/form-data，field: `file`） |
| `GET` | `/api/v1/files/{fileID}` | 下載已儲存的 CSV |
| `DELETE` | `/api/v1/files/{fileID}` | 刪除檔案 |
| `GET` | `/health` | 健康狀態 |

---

## 支援資產類型

| 類型 | 說明 | 主要參數 |
|------|------|---------|
| `solar_self` | 自發自用太陽能 | 裝置容量 (kWp)、造價 |
| `solar_purchase` | 外購太陽能 | 裝置容量 (kWp)、造價 |
| `wind` | 外購風力發電 | 裝置容量 (kW)、容量因子 |
| `hydro` | 外購水力發電 | 裝置容量 (kW) |
| `hvac` | 空調系統效率提升 | COP 改善幅度 (%)、設備投資 |
| `storage` | 儲能系統（BESS） | 容量 (kWh)、功率 (kW)、往返效率 |
| `ev` | 電動車充電樁 | 樁數、單樁功率、智慧排程 |

---

## 專案結構

```
DDEAR_MVP/
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/                 # API 客戶端
│   │   ├── components/          # UI 元件（layout, dashboard, charts, sandbox）
│   │   ├── pages/               # 頁面（Welcome, Dashboard）
│   │   ├── store/               # Zustand 全域狀態
│   │   ├── types/               # TypeScript 型別定義
│   │   └── utils/               # 格式化工具函式
│   ├── nginx.conf               # Production nginx 設定（含 API proxy）
│   └── Dockerfile               # 多階段建置（Node build → nginx serve）
│
├── services/
│   ├── simulation-service/      # Python FastAPI
│   │   └── app/
│   │       ├── api/routes/      # baseline / simulate / assets
│   │       ├── core/            # tariff / simulator / roi
│   │       ├── assets/          # 資產曲線產生
│   │       ├── schemas/         # Pydantic request/response 模型
│   │       └── store.py         # in-memory 資料暫存
│   │
│   └── data-service/            # Go
│       ├── cmd/server/          # 主程式進入點
│       └── internal/
│           ├── handler/         # HTTP handlers
│           └── storage/         # 本地檔案系統存取
│
├── k8s/
│   ├── base/                    # 共用 K8s manifest（Kustomize base）
│   └── overlays/
│       ├── on-premise/          # 地端：NFS + nginx-ingress
│       ├── aws/                 # AWS EKS：EFS + ALB
│       ├── gcp/                 # GCP GKE：Filestore + GCE LB
│       └── azure/               # Azure AKS：Azure Files + AGIC
│
├── docker-compose.yml           # 本地一鍵啟動
├── .env.example                 # 環境變數範本
└── README.md
```

---

## 開發注意事項

- **simulation-service 水平擴展**：目前 `store.py` 使用 in-memory dict。多副本部署時需改為 Redis（`redis-py` + `aioredis`）。
- **安全性**：生產環境請將 `ALLOWED_ORIGINS` 設為具體域名，並啟用 TLS。
- **台電費率**：費率為近似值，請依最新台電公告調整 `core/tariff.py` 中的常數。
- **CSV 格式**：上傳的 CSV 需包含 `timestamp`（ISO 8601）和 `load_kw` 兩欄，15 分鐘間距。

---

> DDEAR MVP — Energy Digital Twin Sandbox | 台電費率資料僅供參考，實際費率以台電公告為準。
