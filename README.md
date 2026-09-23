# 脆熱門貼文

整理 Threads（脆）上近期的熱門貼文，並提供網頁瀏覽。

- 網頁：<https://jac741026.github.io/Kat/>（GitHub Pages）
- 資料：[`data/posts.json`](data/posts.json)（最新）、`data/archive/YYYY-MM-DD.json`（每日存檔）

## 怎麼運作

1. [`scraper/scrape.mjs`](scraper/scrape.mjs) 用 Playwright（無登入）打開 Threads 首頁，以及 [`scraper/keywords.json`](scraper/keywords.json) 裡每個關鍵字的搜尋結果（熱門排序）。
2. 從頁面內嵌的 JSON 取出貼文的內容、作者、讚／回覆／轉發／引用數。
3. 去除重複與回覆，只留近 7 天的貼文，依「綜合熱度」排序取前 300 則。
   綜合熱度 = 讚 + 回覆×3 + 轉發×5 + 引用×5
4. GitHub Actions 每天台灣時間 08:00、14:00、20:00 自動更新並 commit。

## 本機執行

```bash
npm install
npx playwright install chromium
npm run scrape
npx serve .   # 開 http://localhost:3000
```

可用環境變數調整：`MAX_AGE_DAYS`（預設 7）、`MAX_POSTS`（預設 300）。想追蹤其他主題，直接編輯 `scraper/keywords.json`。

## 注意

- 未登入的 Threads 每個搜尋只會回傳約 20 則熱門結果，所以涵蓋範圍取決於關鍵字清單。
- 圖片與大頭貼連結來自 Instagram CDN，幾天後會過期，網頁會自動隱藏失效的圖片；下次更新時會換成新連結。
- 貼文版權屬於原作者，本專案僅做索引與連結。
