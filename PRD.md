# Pactum — Product Requirements Document

**Version**: 1.0.0  
**Status**: Draft  
**Last Updated**: 2026-03-19  
**Author**: (訪談整理)

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Authentication](#3-authentication)
4. [Data Models](#4-data-models)
5. [Document Management](#5-document-management)
6. [Role & Permission System](#6-role--permission-system)
7. [Editor](#7-editor)
8. [Review & Discussion System](#8-review--discussion-system)
9. [Approval (Sign-off) System](#9-approval-sign-off-system)
10. [Git Integration](#10-git-integration)
11. [Notification System](#11-notification-system)
12. [Image Upload](#12-image-upload)
13. [SBE Mode (Phase 2)](#13-sbe-mode-phase-2)
14. [API Specification](#14-api-specification)
15. [MVP Scope Summary](#15-mvp-scope-summary)

---

## 1. Product Overview

### 1.1 Problem Statement

PRD 文件散落在 Google Doc、Confluence、Slack 等各處，導致：

- 無法追查明確的變更時間點、異動原因與來源
- RD 不知道需求已更新，直到 QA 驗收時才發現問題
- 沒有強制的審核畫押機制，需求確認責任不清

### 1.2 Solution

Pactum 是一個基於 Git 的文件協作工具，核心理念：

- **Git 是唯一的 audit trail**：每個重要狀態轉換都有對應的 commit，帶有時間戳、作者、變更原因
- **資料庫是 operational store**：草稿、討論、權限等即時資料存在資料庫
- **文件即合約**：所有人畫押後的文件具有不可篡改的歷史紀錄

### 1.3 Target Users (MVP)

公司內部使用，使用公司 Google Workspace 帳號登入。

主要使用者：
- **PM / 需求方**：建立文件、發起審核
- **RD（前端/後端/APP）**：閱讀需求、參與討論、畫押確認
- **QA**：閱讀需求、參與討論、畫押確認

### 1.4 MVP Scope

MVP 包含以下功能：
- Google OAuth 登入
- 純文件模式（Rich Text + Markdown 雙模式編輯器）
- 角色與權限設定（建立者 / 編輯者 / 顧問 / 執行者）
- 段落級討論串
- 畫押（Sign-off）流程
- Git commit 自動紀錄（狀態轉換觸發）
- Git diff 檢視
- 通知機制（Email + Slack + 站內）
- 圖片上傳（Cloudflare R2）

**Phase 2（MVP 後）**：
- SBE 模式（AI 將 PRD 拆解為 Gherkin Scenario）
- 討論結案後 AI 自動編修內容

---

## 2. Technical Architecture

### 2.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (React) |
| Backend | Node.js (Express 或 Fastify) |
| Database | PostgreSQL |
| ORM | Prisma |
| Git 操作 | simple-git（操作本地 clone 的 docs repo） |
| 圖片儲存 | Cloudflare R2 |
| 認證 | Google OAuth 2.0（next-auth） |
| 通知 - Email | Google Workspace SMTP / Gmail API |
| 通知 - Slack | Slack Incoming Webhook |
| 部署（POC） | VPS 或本機 Mac mini |

### 2.2 Repository 架構

系統涉及兩個獨立的 Git repository：

```
pactum-app/          ← App 程式碼 repo（本文件所在）
pactum-docs/         ← 文件資料 repo（由 App 透過 simple-git 管理）
```

**pactum-docs repo 結構：**

```
pactum-docs/
  ├── {document-ulid}.md        ← 文件內容（Markdown）
  ├── {document-ulid}.md
  └── ...
```

- 檔名使用 ULID 確保唯一性與時間排序性
- 不使用目錄分層，所有文件平鋪在根目錄
- 文件的 metadata（標題、tag、作者、狀態等）存在資料庫，不存在檔案系統

### 2.3 Git 操作策略

App server 在啟動時，將 pactum-docs repo clone 到本地指定路徑（例如 `/app/docs-repo/`）。

所有 Git 操作（commit、log、diff）皆在本地執行，使用 `simple-git`。

在以下時機執行 `git push` 同步到 GitHub remote：
- 每次自動 commit 完成後立即 push
- Push 失敗時記錄錯誤 log，不影響主流程，背景重試

**GitHub App 設定：**
- 需要提供：GitHub App token、目標 docs repo 的 HTTPS clone URL
- App 以此 token 作為 git remote credential

### 2.4 系統架構圖（概念）

```
Browser
  │
  ▼
Next.js Frontend
  │
  ▼
Node.js API Server
  ├── PostgreSQL（草稿、討論、權限、通知佇列）
  ├── simple-git → /app/docs-repo/（本地 git 操作）
  │                      │
  │                      └── git push → GitHub (pactum-docs repo)
  └── Cloudflare R2（圖片上傳）
```

---

## 3. Authentication

### 3.1 Login Method

使用 Google OAuth 2.0，僅允許公司 Google Workspace 網域的帳號登入。

**限制登入網域**：在 OAuth callback 驗證 `hd`（hosted domain）欄位，不符合的帳號拒絕登入。

### 3.2 Session

使用 next-auth 管理 session，儲存在加密的 HTTP-only cookie。

Session 內容：

```typescript
{
  userId: string,      // 對應資料庫 users.id
  email: string,
  name: string,
  avatarUrl: string,
}
```

### 3.3 User Record

首次登入時自動建立 user record（upsert）。

---

## 4. Data Models

以下為 PostgreSQL schema 定義。

### 4.1 users

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 documents

```sql
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,              -- ULID
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft', -- draft | in_review | approved
  mode        TEXT NOT NULL DEFAULT 'doc',   -- doc | sbe (Phase 2)
  git_file    TEXT NOT NULL UNIQUE,          -- e.g. "01HZ...abc.md"
  created_by  UUID NOT NULL REFERENCES users(id),
  locked_by   UUID REFERENCES users(id),     -- 編輯鎖定，NULL 表示未鎖定
  locked_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**status 說明：**

| Status | 說明 |
|--------|------|
| `draft` | 草稿，可自由編輯 |
| `in_review` | 審核討論中 |
| `approved` | 全員畫押完成 |

**status 只能單向推進，除非明確的「重開」操作**（approved → draft 不允許；in_review → draft 允許，見 §5.5）。

### 4.3 document_tags

```sql
CREATE TABLE document_tags (
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag          TEXT NOT NULL,
  PRIMARY KEY (document_id, tag)
);
```

### 4.4 document_members

```sql
CREATE TABLE document_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  role         TEXT NOT NULL, -- editor | advisor | approver
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);
```

**角色說明（詳見 §6）：**
- `editor`：可編輯文件內容，需畫押
- `advisor`：可瀏覽文件、發起討論，不需畫押
- `approver`：可瀏覽文件、發起討論，需畫押

**建立者（creator）不存在 document_members 中，由 documents.created_by 識別，自動擁有最高權限。**

### 4.5 document_signoffs

```sql
CREATE TABLE document_signoffs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  commit_sha   TEXT,  -- 畫押當下對應的 git commit SHA
  UNIQUE (document_id, user_id)  -- 每份文件每人只有一筆（重開後清空重來）
);
```

### 4.6 discussions

```sql
CREATE TABLE discussions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES users(id),
  anchor_type  TEXT NOT NULL, -- 'range' | 'line'
  anchor_data  JSONB NOT NULL, -- { "from": 120, "to": 185 } 字元位移，或 { "lineNumber": 42 }
  status       TEXT NOT NULL DEFAULT 'open', -- open | resolved
  cta          TEXT, -- NULL（open 時）| 'no_change' | 'need_change'
  resolution   TEXT, -- AI 整理的結案摘要（resolved 後填入）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES users(id)
);
```

### 4.7 discussion_comments

```sql
CREATE TABLE discussion_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id  UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  author_id      UUID NOT NULL REFERENCES users(id),
  content        TEXT NOT NULL,  -- Markdown
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.8 discussion_signoffs

每個討論串的參與畫押（有別於整份文件的畫押）：

```sql
CREATE TABLE discussion_signoffs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id  UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id),
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (discussion_id, user_id)
);
```

### 4.9 document_git_commits

紀錄每次自動 commit 的 metadata：

```sql
CREATE TABLE document_git_commits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  TEXT NOT NULL REFERENCES documents(id),
  commit_sha   TEXT NOT NULL,
  event_type   TEXT NOT NULL, -- 見 §10.2
  summary      TEXT NOT NULL, -- commit message 的 subject line
  triggered_by UUID REFERENCES users(id),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.10 notifications

```sql
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  document_id  TEXT REFERENCES documents(id),
  type         TEXT NOT NULL,  -- 見 §11.2
  payload      JSONB NOT NULL DEFAULT '{}',
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. Document Management

### 5.1 建立文件

**入口**：首頁「新增文件」按鈕。

**流程：**
1. 使用者輸入文件標題（必填）
2. 選填 tag（可輸入任意字串，多個）
3. 系統產生 ULID 作為 `document.id` 與 `git_file` 名稱
4. 在 pactum-docs repo 建立對應的 `.md` 檔案（初始內容為空，或標題作為 H1）
5. 執行 initial commit：`docs: create - {title}`
6. 跳轉至文件編輯頁

**初始狀態**：`draft`，建立者擁有最高權限。

### 5.2 文件列表頁

**顯示欄位：**
- 文件標題
- 狀態 badge（draft / in_review / approved）
- Tag 列表
- 最後更新時間
- 建立者

**篩選功能：**
- 依 tag 篩選（多選 AND）
- 依狀態篩選
- 全文搜尋（標題）

**排序**：預設依 `updated_at` 降冪。

**存取控制**：所有登入使用者皆可看到所有文件列表（PRD 不含機敏資訊）。

### 5.3 文件詳情頁

URL 格式：`/documents/{document-id}`

頁面分區：
- **Header**：標題、狀態、tag、成員列表、操作按鈕
- **Editor 區域**：富文字 / Markdown 編輯器（見 §7）
- **Discussion 側欄**：目前 open 的討論串（見 §8）
- **History 側欄**：git commit 歷史與 diff（見 §10）

### 5.4 編輯鎖定機制

為避免多人同時覆寫，採用悲觀鎖（pessimistic lock）：

**取得鎖定：**
- 使用者點擊「編輯」時，系統嘗試將 `documents.locked_by` 設為該使用者
- 若 `locked_by` 已有值（且不是自己），顯示「{name} 正在編輯中，無法同時編輯」，按鈕 disabled
- `locked_at` 同時更新，用於逾時自動解鎖

**自動解鎖：**
- 使用者離開頁面時（beforeunload event）呼叫解鎖 API
- 若使用者非正常離線，背景任務每 5 分鐘掃描 `locked_at` 超過 10 分鐘的鎖，自動解除

**建立者強制解鎖：**
- 建立者可在任何時候強制解除他人的編輯鎖定

### 5.5 文件狀態轉換

```
draft ──[發起審核]──► in_review ──[全員畫押]──► approved
  ▲                       │                        │
  └──────[重開修訂]────────┴────────────────────────┘
```

**設計原則：** 文件不是法律合約，核心目標是確保每一次變更都有明確紀錄、所有相關人員都被通知並確認過。因此 `approved` 狀態允許重開，但重開行為本身必須留下不可篡改的 git 紀錄（包含重開原因），讓任何人都可以追查「這份文件曾在何時被誰因為什麼原因重開」。

**各操作的觸發條件：**

| 操作 | 誰可以觸發 | 前提條件 |
|------|-----------|---------|
| 發起審核 | 建立者 | status = draft，已設定至少一位 approver |
| 重開修訂 | 建立者 | status = in_review 或 approved，且提供重開原因（必填） |
| 全員畫押完成 | 系統自動 | 所有 approver + editor 皆已畫押 |

**重開修訂的行為（適用於 in_review → draft 與 approved → draft）：**
- 建立者必須填寫重開原因（不可為空）
- 清空所有 `document_signoffs`（畫押紀錄全部重來）
- 清空所有 `discussion_signoffs`（討論串畫押重來）
- 未結案的討論串維持 open 狀態
- 執行 git commit：`docs: reopen - {title} / reason: {原因}`
- commit body 記錄重開前的狀態（from: approved 或 in_review）、重開者、時間
- 通知所有 editor、approver

---

## 6. Role & Permission System

### 6.1 角色定義

| 角色 | 識別方式 | 可編輯 | 需畫押 | 可發起討論 | 可設定成員 | 可發起審核 | 可強制解鎖 |
|------|---------|-------|-------|-----------|-----------|-----------|-----------|
| **建立者** | documents.created_by | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **編輯者** (editor) | document_members | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **顧問** (advisor) | document_members | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **執行者** (approver) | document_members | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

### 6.2 角色設定

- 只有**建立者**可以新增/移除成員與變更角色
- 同一個人可以同時被設定為 editor + approver（例如 PM 自己也需要畫押）
- 若同一人有多個角色，取最高權限（editor 優先於 advisor；editor 需畫押，advisor 不需）
- 建立者無法被移除或降權

### 6.3 閱讀權限

所有登入使用者皆可閱讀所有文件（無需在 document_members 中）。

---

## 7. Editor

### 7.1 編輯器選型

使用 **Tiptap**（基於 ProseMirror 的 headless rich text editor）。

理由：
- 同時支援 Rich Text 與 Markdown 輸入/輸出
- 支援自定義 extension（段落錨點、討論標記）
- 活躍維護，React/Next.js 友善

### 7.2 Rich Text 模式

支援的格式元素：

| 類型 | 支援 |
|------|------|
| 標題 H1-H3 | ✅ |
| 粗體、斜體、刪除線 | ✅ |
| 有序 / 無序列表 | ✅ |
| 代碼區塊（語法高亮） | ✅ |
| 表格 | ✅ |
| 圖片（上傳至 R2） | ✅ |
| 外部連結 | ✅ |
| 水平分隔線 | ✅ |
| 引用區塊 | ✅ |

### 7.3 Markdown 模式

提供 Markdown 原始碼編輯器（CodeMirror 或 Monaco，擇一）。

**模式切換行為：**
- Rich Text → Markdown：將 Tiptap 的 JSON doc 轉換為 Markdown 字串，進入原始碼編輯
- Markdown → Rich Text：將 Markdown 解析回 Tiptap JSON doc，進入富文字編輯
- 轉換在 client 端執行，不觸發 API call
- 若 Markdown 包含 Tiptap 不支援的語法，轉換後以純文字保留

### 7.4 儲存機制

**草稿自動儲存（draft 狀態）：**
- 使用者停止輸入 2 秒後，自動將內容儲存至資料庫（非 git commit）
- 儲存中顯示「儲存中...」，完成後顯示「已儲存」
- 不產生 git commit

**發起審核時的儲存：**
- 系統先儲存目前內容至資料庫
- 將文件內容寫入 pactum-docs repo 的對應 `.md` 檔案
- 執行 git commit（詳見 §10）

**注意：draft 階段的中間編輯內容不進 git，只有狀態轉換時才產生 commit。**

### 7.5 段落錨點（Discussion Anchor）

討論串需要能關聯到文件的特定段落或文字範圍，實作方式如下：

- 使用者在 Rich Text 模式中選取文字後，右側出現「新增討論」按鈕
- 選取範圍以**字元位移（character offset）**紀錄在 `discussions.anchor_data`
- 被標記的段落在編輯器中以底線或背景色高亮顯示，顏色根據討論狀態區分（open = 黃色；resolved = 灰色）
- 文件內容更新後，若 anchor 位移因編輯而失效，顯示「錨點已失效」提示

---

## 8. Review & Discussion System

### 8.1 討論串的建立

**觸發方式：**
1. 選取文字範圍 → 點擊「新增討論」
2. 點擊段落旁的「+」按鈕（行級討論）

**必填欄位：**
- 首則留言內容（不可為空）
- 可 @mention 其他成員（格式：`@{email}` 或 `@{name}`）

**建立後：**
- 討論串狀態為 `open`
- 被 @mention 的成員收到通知
- 文件建立者收到通知

### 8.2 討論串的回覆

- 所有文件成員（含 advisor）皆可回覆
- 留言支援 Markdown 格式
- 留言支援 @mention

### 8.3 討論串的結案（CTA）

只有**建立者、editor、approver** 可以觸發結案。

**結案流程：**

1. 發起結案的人選擇 CTA：
   - `no_change`：不需修改，確認現有內容
   - `need_change`：需要修改文件

2. 若選擇 `need_change`，提供兩種修改方式：
   - **AI 編修**：AI 根據討論串內容自動修改對應段落，修改結果需 editor 確認後才套用
   - **手動修改**：editor 自行修改文件內容

3. 修改完成後（或選擇 `no_change`），進入**討論畫押**階段：
   - 所有 editor + approver 需對此討論串畫押確認
   - 已畫押者顯示綠色 checkmark + 姓名

4. 全員畫押後，討論串正式 **resolved**：
   - AI 自動整理討論串內容與結論，存入 `discussions.resolution`
   - 執行 git commit（見 §10.3）

### 8.4 討論狀態與文件狀態的關係

- 文件在 `in_review` 狀態時，**不允許**有任何 open 討論串的情況下進行整份文件畫押
- 建立者可以查看「還有 N 個討論未結案」的提示

### 8.5 討論串的顯示

**側欄模式（預設）：**
- 右側固定側欄，顯示所有 open 討論串
- 點擊討論串時，編輯器捲動至對應錨點位置並高亮

**懸浮模式：**
- 滑鼠 hover 段落高亮區域時，顯示討論串預覽氣泡

---

## 9. Approval (Sign-off) System

### 9.1 整份文件畫押

**前提條件：**
- 文件狀態為 `in_review`
- 沒有任何 open 的討論串

**誰需要畫押：**
- 建立者
- 所有 `editor`
- 所有 `approver`

（`advisor` 不需畫押）

**畫押操作：**
- 每位需畫押的人在文件頁面右上角看到「我確認此份文件」按鈕
- 點擊後顯示確認對話框：「確認畫押後代表您已閱讀並同意此份文件內容，此操作不可撤銷。」
- 確認後寫入 `document_signoffs`
- 通知建立者「{name} 已完成畫押」

**全員畫押完成：**
- 系統偵測到所有必要人員皆已畫押
- 文件狀態自動轉為 `approved`
- 執行 git commit（見 §10.4）
- 通知所有文件成員

### 9.2 畫押進度顯示

在文件頁面顯示畫押進度：

```
畫押進度：3 / 5
✅ Alice Chen（建立者）
✅ Bob Wang（approver）
⏳ Carol Liu（editor）
⏳ David Chen（approver）
✅ Eve Wu（editor）
```

---

## 10. Git Integration

### 10.1 事件型 Commit 的 Diff 機制

部分 commit 事件（如 reopen、approved）發生時，文件內容本身沒有變更，但仍需產生有效的 git diff 才能 commit。

**解決方式：在 `.md` 檔案尾端插入不可見的 metadata comment。**

格式：
```markdown
<!-- pactum:{event_type} {ISO8601_timestamp} by {email} -->
```

範例：
```markdown
<!-- pactum:reopen 2026-03-15T10:00:00Z by alice@company.com -->
<!-- pactum:approved 2026-03-20T14:30:00Z by alice@company.com,bob@company.com -->
```

**規則：**
- 每次事件型 commit 前，append 一行此 comment 至檔案尾端
- 這些 comment 在 Rich Text 模式與 Markdown 渲染時完全不顯示
- 每次 append 新的一行，不覆蓋舊的，形成可追溯的事件序列
- 文件內容有實際變更的 commit（如 `review_started`、`discussion_resolved`）不需要插入此 comment

**適用的 event type：**

| Event Type | 說明 |
|-----------|------|
| `reopen` | 重開修訂（from in_review 或 approved） |
| `approved` | 全員畫押完成 |

---



使用 `simple-git`（npm package）在 Node.js server 端操作本地的 docs repo clone。

初始化：

```typescript
import simpleGit from 'simple-git';
const git = simpleGit('/app/docs-repo');
```

每次 commit 前設定 author（使用觸發操作的使用者資訊）：

```typescript
await git
  .addConfig('user.name', user.name)
  .addConfig('user.email', user.email);
```

### 10.2 Git 操作套件

| Event Type | 觸發條件 | Commit Message 格式 |
|-----------|---------|-------------------|
| `create` | 文件建立 | `docs: create - {title}` |
| `review_started` | 發起審核 | `docs: review started - {title}` |
| `discussion_resolved` | 討論串結案 | `docs: discussion resolved - {title} / {AI 整理的結論摘要（80字以內）}` |
| `approved` | 全員畫押完成 | `docs: approved - {title} / signed by: {name1}, {name2}, ...` |
| `reopened` | 重開修訂（from in_review 或 approved）| `docs: reopen - {title} / reason: {原因}` |

**Commit body（extended description）：**
- `discussion_resolved` 的 commit body 包含完整討論串 AI 整理摘要
- `approved` 的 commit body 包含每位簽署者的 email 與簽署時間

### 10.3 Commit 觸發時機與格式

| Event Type | 觸發條件 | Commit Message 格式 |
|-----------|---------|-------------------|
| `create` | 文件建立 | `docs: create - {title}` |
| `review_started` | 發起審核 | `docs: review started - {title}` |
| `discussion_resolved` | 討論串結案 | `docs: discussion resolved - {title} / {AI 整理的結論摘要（80字以內）}` |
| `approved` | 全員畫押完成 | `docs: approved - {title} / signed by: {name1}, {name2}, ...` |
| `reopened` | 重開修訂（from in_review 或 approved）| `docs: reopen - {title} / reason: {原因}` |

**Commit body（extended description）：**
- `discussion_resolved` 的 commit body 包含完整討論串 AI 整理摘要
- `approved` 的 commit body 包含每位簽署者的 email 與簽署時間
- `reopened` 的 commit body 記錄重開前的狀態（from: approved 或 in_review）、重開者、時間

### 10.4 Discussion Resolved Commit 內容

範例：

```
docs: discussion resolved - 購物車功能 PRD / 確認加入購物車按鈕行為

討論摘要：
關於庫存為 0 時的按鈕狀態，討論後決定顯示「補貨中」文字並 disabled 按鈕，
不顯示「加入購物車」。此行為適用於所有商品類型。

CTA: need_change
修改方式: 手動修改
結案人: Alice Chen
畫押確認: Alice Chen, Bob Wang, Carol Liu
```



### 10.5 Approved Commit 內容

範例：

```
docs: approved - 購物車功能 PRD / signed by: Alice, Bob, Carol, David, Eve

簽署紀錄：
- Alice Chen (alice@company.com) — 2026-03-19T10:23:00Z
- Bob Wang (bob@company.com) — 2026-03-19T11:05:00Z
- Carol Liu (carol@company.com) — 2026-03-19T11:30:00Z
- David Chen (david@company.com) — 2026-03-19T12:00:00Z
- Eve Wu (eve@company.com) — 2026-03-19T12:15:00Z
```



### 10.6 Git Diff 檢視

在文件頁面的「歷史」側欄：

**功能：**
- 列出此文件相關的所有 commit（透過 `git log -- {git_file}` 取得）
- 點擊任一 commit 顯示 diff（`git diff {sha}^..{sha} -- {git_file}`）
- Diff 以 side-by-side 或 unified 格式顯示（前端用 `diff2html` 或類似 library 渲染）
- 顯示 commit message（包含 body）

**Commit 列表顯示：**
```
2026-03-19  docs: approved — Alice Chen
2026-03-18  docs: discussion resolved — Bob Wang
2026-03-18  docs: review started — Alice Chen
2026-03-17  docs: create — Alice Chen
```

---

## 11. Notification System

### 11.1 通知渠道

支援三種渠道，使用者可在個人設定中選擇開啟/關閉各渠道：

| 渠道 | 實作方式 |
|------|---------|
| 站內通知 | 資料庫 notifications table + polling 或 SSE |
| Email | Gmail API（使用公司 Google Workspace 服務帳號） |
| Slack | Incoming Webhook（使用者在個人設定中綁定自己的 Slack Webhook URL） |

### 11.2 通知事件對照表

| 事件 | 通知對象 |
|------|---------|
| 文件發起審核 | 所有 editor、advisor、approver |
| 有人對段落發起討論 | 被 @mention 的人 + 建立者 |
| 討論串有新回覆 | 該討論串的所有參與者（曾留言者） |
| 討論串發起結案投票 | 所有 editor、approver |
| 討論串全員畫押完成（結案）| 建立者 |
| 所有討論串結案（可發起文件畫押）| 建立者 |
| 有人完成文件畫押 | 建立者 |
| 文件全員畫押完成（approved）| 所有文件成員 |
| 文件重開修訂 | 所有 editor、approver |

### 11.3 通知內容格式

每則通知包含：
- 事件描述（例如「Bob Wang 對《購物車功能 PRD》發起了新討論」）
- 文件連結
- 觸發時間

### 11.4 站內通知

**顯示位置：** Header 右上角鈴鐺圖示，顯示未讀數 badge。

**互動：**
- 點擊通知項目跳轉至對應文件（若有討論串，直接高亮對應討論）
- 「全部標為已讀」功能

**實作：** 使用 SSE（Server-Sent Events）推送即時通知，或每 30 秒 polling（擇一，SSE 優先）。

---

## 12. Image Upload

### 12.1 Cloudflare R2 設定

- 建立一個 R2 bucket 作為圖床
- 設定 public access（圖片 URL 可直接存取）
- 在 App server 設定 R2 的 Account ID、Access Key ID、Secret Access Key

### 12.2 上傳流程

**支援兩種方式：**

1. **直接上傳**：點擊工具列圖片按鈕，選取本機圖片
2. **貼上上傳**：在編輯器中貼上（Cmd+V / Ctrl+V），自動偵測剪貼簿中的圖片並上傳

**技術流程：**

```
Client 取得圖片 binary
  → 呼叫 POST /api/upload/image（multipart/form-data）
  → Server 上傳至 R2，路徑為 /documents/{document-id}/{timestamp}-{random}.{ext}
  → 回傳圖片 URL
  → Editor 插入 ![](url) 至游標位置
```

**支援格式：** JPEG、PNG、GIF、WebP

**檔案大小限制：** 單張 10MB

**錯誤處理：**
- 上傳失敗顯示 toast 錯誤提示
- 不影響其他編輯操作

---

## 13. SBE Mode (Phase 2)

> 本章節為 Phase 2 規格，MVP 不實作，紀錄於此供未來參考。

### 13.1 模式切換條件

從 `doc` 模式切換至 `sbe` 模式的前提：
- 文件狀態為 `draft`
- 沒有任何 open 的討論串
- 建立者執行切換操作並確認

切換後：
- 所有現有 `document_signoffs` 清空（重新畫押）
- 文件 mode 欄位更新為 `sbe`

### 13.2 AI 拆解流程

1. PM 在切換確認對話框中貼入（或確認現有的）PRD 原文
2. 呼叫 AI API，將 PRD 拆解為 Gherkin 格式的 Scenario 列表
3. 產出結果標示為「草稿，待審核」
4. 原始 PRD 原文保留在獨立區塊，不可編輯

### 13.3 Gherkin 格式規範

```gherkin
Feature: {功能名稱}
  {功能簡述（選填）}

  Scenario: {情境名稱}
    Given {前提條件}
    When {使用者操作}
    Then {預期結果}
    # {備註（選填）}
```

允許：
- 多個 Given / When / Then 步驟
- `# 備註` 欄位補充說明
- `Scenario Outline` + `Examples` 表格（參數化情境）

### 13.4 SBE 模式的討論與畫押

- 討論串可以針對特定 Scenario 或特定步驟發起
- 畫押流程與 doc 模式相同

---

## 14. API Specification

### 14.1 Authentication

所有 API 需攜帶有效 session cookie。未驗證的請求回傳 `401`。

### 14.2 Documents

```
GET    /api/documents                    列出文件（支援 tag、status、search query）
POST   /api/documents                    建立文件
GET    /api/documents/:id                取得文件詳情（含 members、signoffs、discussions）
PATCH  /api/documents/:id                更新文件內容（draft 狀態才允許）
POST   /api/documents/:id/review         發起審核（draft → in_review）
POST   /api/documents/:id/reopen         重開修訂（in_review 或 approved → draft，建立者限定）
GET    /api/documents/:id/commits        取得 git commit 列表
GET    /api/documents/:id/diff/:sha      取得特定 commit 的 diff
```

### 14.3 Document Members

```
GET    /api/documents/:id/members        取得成員列表
POST   /api/documents/:id/members        新增成員（建立者限定）
PATCH  /api/documents/:id/members/:uid   修改角色（建立者限定）
DELETE /api/documents/:id/members/:uid   移除成員（建立者限定）
```

### 14.4 Signoffs

```
POST   /api/documents/:id/signoff        整份文件畫押
GET    /api/documents/:id/signoffs       取得畫押狀態列表
```

### 14.5 Discussions

```
GET    /api/documents/:id/discussions           取得討論串列表
POST   /api/documents/:id/discussions           建立討論串
GET    /api/discussions/:discussionId           取得討論串詳情（含留言）
POST   /api/discussions/:discussionId/comments  新增留言
POST   /api/discussions/:discussionId/resolve   發起結案（含 CTA）
POST   /api/discussions/:discussionId/signoff   討論串畫押
```

### 14.6 Image Upload

```
POST   /api/upload/image                 上傳圖片至 R2，回傳 URL
```

### 14.7 Notifications

```
GET    /api/notifications                取得目前使用者的通知列表
PATCH  /api/notifications/read-all       全部標為已讀
PATCH  /api/notifications/:id/read       單則標為已讀
GET    /api/notifications/stream         SSE 連線（即時通知推送）
```

### 14.8 User Settings

```
GET    /api/users/me                     取得個人設定
PATCH  /api/users/me/notification-prefs  更新通知偏好（各渠道開關）
PATCH  /api/users/me/slack-webhook       設定個人 Slack Webhook URL
```

---

## 15. MVP Scope Summary

### 15.1 功能清單

| # | 功能 | 優先級 | 備註 |
|---|------|--------|------|
| 1 | Google OAuth 登入（限公司網域）| P0 | |
| 2 | 文件建立 / 列表 / 詳情頁 | P0 | |
| 3 | Tag 系統 | P0 | |
| 4 | 角色設定（editor / advisor / approver）| P0 | |
| 5 | Rich Text 編輯器（Tiptap）| P0 | |
| 6 | Markdown 模式切換 | P0 | |
| 7 | 圖片上傳（R2，含貼上上傳）| P0 | |
| 8 | 編輯鎖定（悲觀鎖）| P0 | |
| 9 | 文件狀態機（draft / in_review / approved）| P0 | |
| 10 | 段落級討論串 | P0 | |
| 11 | @mention 功能 | P1 | |
| 12 | 討論串 CTA 與結案流程 | P0 | |
| 13 | 討論串畫押 | P0 | |
| 14 | 整份文件畫押 | P0 | |
| 15 | Git commit 自動紀錄 | P0 | |
| 16 | Git diff 檢視（歷史側欄）| P0 | |
| 17 | 站內通知（SSE）| P1 | |
| 18 | Email 通知 | P1 | |
| 19 | Slack 通知 | P1 | |

### 15.2 明確排除（Phase 2）

- SBE 模式（AI 拆解 PRD → Gherkin）
- 討論結案後 AI 自動編修文件
- 多租戶 / 多 workspace 支援
- 文件 versioning（approved 後的修訂管理）
- 多人即時協作編輯（Google Docs 體驗）
- 行動裝置最佳化

### 15.3 非功能性需求

| 項目 | 規格 |
|------|------|
| 部署環境（POC）| VPS 或本機 macOS，Single instance |
| 並發使用者 | POC 階段不需考慮高並發，預估 < 50 人同時使用 |
| 資料備份 | pactum-docs repo push 至 GitHub 即為備份 |
| 安全性 | HTTPS，session cookie httpOnly + secure，OAuth 限制公司網域 |
| 瀏覽器支援 | 最新版 Chrome / Safari / Firefox |

---

*Document generated from product interview. For questions, contact the document owner.*
