// 抓取 Threads（脆）熱門貼文，輸出到 data/posts.json 與 data/archive/YYYY-MM-DD.json
// 用法：npm run scrape
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const KEYWORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scraper', 'keywords.json'), 'utf8'));

const MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS ?? 7);
const MAX_POSTS = Number(process.env.MAX_POSTS ?? 300);
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 從頁面內嵌的 <script type="application/json"> 找出所有貼文物件
function extractPosts(html) {
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.code && o.like_count !== undefined && o.user?.username) {
      found.push(o);
      return;
    }
    for (const k in o) walk(o[k]);
  };
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1].includes('like_count')) continue;
    try {
      walk(JSON.parse(m[1]));
    } catch {}
  }
  return found;
}

function pickImage(p) {
  const media = p.carousel_media?.[0] ?? p;
  const c = media.image_versions2?.candidates ?? [];
  // 取寬度約 640 左右的縮圖
  const best = [...c].sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640))[0];
  return best?.url ?? null;
}

function normalize(p, source) {
  const info = p.text_post_app_info ?? {};
  const text =
    p.caption?.text ??
    (info.text_fragments?.fragments ?? []).map((f) => f.plaintext ?? '').join('') ??
    '';
  const replies = info.direct_reply_count ?? 0;
  const reposts = info.repost_count ?? 0;
  const quotes = info.quote_count ?? 0;
  const likes = p.like_count ?? 0;
  return {
    id: p.code,
    url: `https://www.threads.com/@${p.user.username}/post/${p.code}`,
    username: p.user.username,
    verified: !!p.user.is_verified,
    avatar: p.user.profile_pic_url ?? null,
    text,
    takenAt: p.taken_at,
    likes,
    replies,
    reposts,
    quotes,
    score: likes + replies * 3 + reposts * 5 + quotes * 5,
    image: pickImage(p),
    mediaCount: p.carousel_media?.length ?? (pickImage(p) ? 1 : 0),
    isVideo: !!p.video_versions?.length,
    isReply: !!info.is_reply,
    sources: [source],
  };
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'zh-TW', userAgent: UA, viewport: { width: 1280, height: 1600 } });
  const page = await ctx.newPage();
  const all = new Map();

  const targets = [
    { source: '首頁', url: 'https://www.threads.com/' },
    ...KEYWORDS.map((k) => ({
      source: k,
      url: `https://www.threads.com/search?q=${encodeURIComponent(k)}&serp_type=default`,
    })),
  ];

  for (const { source, url } of targets) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('a[href*="/post/"]', { timeout: 15000 }).catch(() => {});
      await sleep(1000);
      const posts = extractPosts(await page.content());
      let added = 0;
      for (const raw of posts) {
        const n = normalize(raw, source);
        if (n.isReply) continue;
        const prev = all.get(n.id);
        if (prev) {
          if (!prev.sources.includes(source)) prev.sources.push(source);
        } else {
          all.set(n.id, n);
          added++;
        }
      }
      console.log(`[${source}] ${posts.length} 則，新增 ${added}`);
    } catch (e) {
      console.warn(`[${source}] 失敗：${e.message}`);
    }
    await sleep(1500 + Math.random() * 1500);
  }
  await browser.close();

  const now = Math.floor(Date.now() / 1000);
  const minTs = now - MAX_AGE_DAYS * 86400;
  const posts = [...all.values()]
    .filter((p) => p.takenAt >= minTs)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_POSTS);

  if (posts.length === 0) {
    console.error('沒有抓到任何貼文，保留舊資料不覆寫。');
    process.exit(1);
  }

  const out = { updatedAt: new Date().toISOString(), keywords: ['首頁', ...KEYWORDS], count: posts.length, posts };
  fs.mkdirSync(path.join(DATA_DIR, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'posts.json'), JSON.stringify(out, null, 1));
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 台灣時間
  fs.writeFileSync(path.join(DATA_DIR, 'archive', `${day}.json`), JSON.stringify(out));
  console.log(`完成：共 ${all.size} 則，近 ${MAX_AGE_DAYS} 天熱門 ${posts.length} 則 → data/posts.json`);
}

main();
