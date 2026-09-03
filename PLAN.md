# Weapon Ball Arena — жоба жоспары

Күні: 2026-09-04. Бұл файл — жобаның басты жоспары. Әр қадам өзгергенде осы
файлды жаңартып отырамыз (marble-race-bot-тағы `PROGRESS.md` сияқты).

---

## 0. Ең маңызды ереже: БӨЛЕК

Бұл жоба қазіргі боттардан **толығымен бөлек**. Мыналарға **тиіспейміз**:

| Тиіспейтін нәрсе | Неге |
|------------------|------|
| `D:\weapon-ball-bot\` коды/репо/арнасы | Ол Shorts шығарып жатыр, тұрақты жұмыс істеуі керек |
| `D:\marble-race-bot\` және т.б. боттар | Бөлек тіршілік, бөлек арналар |
| Ортақ GCP жоба `youtube-automation-489306` OAuth клиенттері | Жаңа арнаға **жаңа OAuth Client ID** жасаймыз, ескісін өзгертпейміз |
| Ескі Telegram bot токендері | Қажет болса жаңа bot немесе жаңа env-айнымалы префикс (`WBA_...`) |

Ортақ болатын жалғыз нәрсе — **YouTube Data API v3-ті пайдалану әдісі**
(код емес, тек тәсіл). Жаңа `client_secrets.json` + `youtube_token.json`
жаңа арнаға тиесілі, бұл репода бөлек тұрады.

---

## 1. Жоба идентификациясы

- **Атауы:** Weapon Ball Arena
- **Түрі:** гибрид — (а) браузерде **ойнатылатын** ойын, (ә) сол код
  **автоматты Shorts** шығарады ("director mode").
- **Стек:** таза HTML5 Canvas + vanilla JavaScript. Бір `index.html`,
  **нөл тәуелділік**, build қадамы жоқ (dropzone үлгісі).
- **Орны:** `D:\weapon-ball-arena\` (өз git репозиторийі).
- **Идея көзі:** `weapon-ball-bot/battle_sim.py` — қару статтары, урон
  формуласы, арена тақырыптары, "lunge" AI. **Код көшірілмейді**, тек
  тексерілген сандар/ережелер қайта жазылды.
- **Қосымша идеялар** (`D:\game-research\` ішінде клондалған):
  - `dropzone` (Stormfall Royale) — бір файлды BR, тарылатын шторм, синт-дыбыс
  - `suroi` — `client/common/server` архитектурасы (ауқымдалса)
  - `canvas-record`, `ccapture.js` — canvas → mp4/webm тұрақты FPS-пен
  - `YodasWs/racing` — "симуляция → HD видео рендер" паттерні

---

## 2. Жаңа YouTube арна (қолмен, бір рет)

> Бұл қадамдарды пайдаланушы өзі орындайды. Мен дайын болғанда белгілеймін.

1. **Жаңа арна.** Бар Google аккаунтта жаңа **Brand Account** құру
   (жаңа Gmail міндетті емес). Атауы: "Weapon Ball Arena" (немесе балама).
2. **Бренд суреттері.** Баннер + аватар ойынның өз рендерінен генерацияланады
   (`branding.html` — кейін жасаймын, ешбір сыртқы актив жоқ).
3. **Google Cloud OAuth.**
   - Ортақ `youtube-automation-489306` жобасында **жаңа OAuth Client ID
     (Desktop app)** жасау, атауы "Weapon Ball Arena Uploader".
   - (жаңа GCP жоба ашудың қажеті жоқ — аккаунт квотасы толы, marble-race-bot
     да солай істеді.)
   - Consent screen сол жобада **"In production"** күйінде — refresh token
     7 күнде бітпейді. Тексерілген.
   - JSON жүктеп → `D:\weapon-ball-arena\client_secrets.json` (gitignore-де).
4. **Жергілікті OAuth логин** бір рет (`node upload/login.js`, тек auth,
   upload жасамайды) → `youtube_token.json` жасалады, дәл жаңа арнаға
   тиесілі екені `channels().list(mine=true)`-пен тексеріледі.
5. **Арна баптаулары.** "About" сипаттама (EN + RU), keywords
   (weapon ball, physics battle, who wins, satisfying, simulation,
   1v1 fight, arena, marble battle), сілтемелер.

---

## 3. Ойын дизайны

### 3.1 Ойнатылатын режим (адам ойнайды)

- Сен бір weapon-ball басқарасың (fighter #0).
- **Басқару:** тінтуір/саусақ = бағыт; басып ұстау = итеру (thrust).
  Қосымша WASD/көрсеткілер. Мобильде де жұмыс істейді (touch).
- 1–7 AI қарсылас. Арена **бірте-бірте тарылады** (шторм) —
  сыртта қалсаң HP азаяды.
- HP 0 → шығасың. Соңғы тірі — жеңімпаз. Уақыт бітсе — ең көп HP.
- Меню → 3-2-1-FIGHT → шайқас → жеңіс экраны → R (қайта).

### 3.2 Механика (battle_sim.py-дан порт)

| Элемент | Мәні |
|---------|------|
| Қару саны | v0.1-де 20, толық 26-ға дейін кеңейеді |
| `power` | урон қатынасын басқарады, `POWER_DMG_EXPONENT=0.38` арқылы сығылған |
| `material` | metal / blunt / wood / whip / mechanical — соқтығысу серпімділігі/үйкелісі |
| `reach` | дене радиусының көбейткіші |
| active zone | нақты урон тек қарудың жүзі/басынан (`ACTIVE_DAMAGE_MULT` vs `GUARD_DAMAGE_MULT`) |
| clean hit | қорғанбаған қарсыласқа тиген соққыға бонус |
| crit | 10%, ×2, өз RNG ағыны (детерминизм бұзылмайды) |
| parry | екеуі бір мезгілде active-zone → 40% нөл урон + қатты серпіліс |
| whole-body | shuriken/boomerang — бүкіл дене active, бірақ `WHOLE_BODY_DISCOUNT` |

- **Детерминизм:** барлық кездейсоқтық `mulberry32(seed)` арқылы. Бір seed →
  бір нәтиже (video replay үшін міндетті).
- **Физика:** тіркелген қадам `DT = 1/120`, өз impulse-solver (Matter.js
  емес — детерминизм + нөл тәуелділік үшін).

### 3.3 Арена тақырыптары

v0.1-де 8 (Midnight, Neon City, Lava Pit, Ice Cave, Cyber Grid, Deep Space,
Toxic Lab, Blood Moon) → 16-ға дейін кеңейеді. Әрқайсысы фон/тор/бөлшек
түсін өзгертеді.

**Бірегейлік:** C(26,2..4) матчап × 16 арена ≈ 280 000+ нұсқа.

---

## 4. Видео (director) құбыры

### 4.1 Мәселе (бүгін табылған)

Браузер `requestAnimationFrame`-ді фон/headless табта ~1 FPS-ке дейін
баяулатады. Wall-clock-қа сүйенген цикл видео жазуға жарамайды
(сим 4× баяу жүреді).

### 4.2 Шешім

- `?auto=1&record=1` режимінде цикл **wall-clock емес, тіркелген кадр
  санағышымен** жүреді: `render_frame(i)` дәл `i/FPS` секундқа сәйкес
  сим күйін есептейді, нақты уақытқа қарамайды (ccapture.js паттерні).
- **Жазу нұсқалары:**
  1. **Браузерде** `MediaRecorder` → `.webm` (қазір істейді) → `ffmpeg`-пен
     жергілікті/CI-де `.mp4` (H.264, YouTube талабы).
  2. **Node + Playwright/Puppeteer** — headless Chrome ашып, кадр-кадр
     `page.screenshot()` немесе `canvas-record` (WebCodecs) → тікелей `.mp4`.
     CI үшін ыңғайлы. `canvas-record` FFmpeg-тен 20× жылдам.
- **Аудио:** сим "hit event log" береді → numpy/Web Audio емес, Node жағында
  `ffmpeg`-пен синт-clang миксі (battle_sim `build_sfx_array` логикасын
  порт). Фон музыка — Openverse (кілтсіз CC0/CC-BY), weapon-ball-bot
  тәсілімен бірдей бірақ бөлек код.
- **Thumbnail:** `thumb.html` — жеңімпаз + матчап + арена силуэті, canvas-тан
  `.jpg` (1280×720).

### 4.3 Жүктеу

`upload/` папкасы — кішкентай Node скрипт:
- `googleapis` (npm) арқылы `youtube.videos.insert`
- `client_secrets.json` + `youtube_token.json` (жаңа арна)
- тақырып/сипаттама/тег шаблондары (weapon-ball-bot `video_gen.py`
  шаблондарын порт, бөлек файл)
- Telegram хабарландыру (жаңа `WBA_TELEGRAM_*` env)

---

## 5. Деплой

| Мақсат | Қалай |
|--------|-------|
| **Ойнатылатын нұсқа** | GitHub Pages — `index.html` тікелей. itch.io-ға да салуға болады. |
| **Director + upload** | GitHub Actions cron (күнде 2–3 рет), weapon-ball-bot workflow-мен **бөлек** repo, бөлек secrets (`WBA_*`). Cron уақыттары басқа боттармен соқтықпайтындай ығыстырылған. |
| **Secrets** | `WBA_CLIENT_SECRETS_JSON`, `WBA_YOUTUBE_TOKEN_JSON`, `WBA_TELEGRAM_NOTIFY_TOKEN`, `WBA_TELEGRAM_NOTIFY_CHAT_ID` |

---

## 6. Кезеңдер

### v0.1 — ІСТЕЛДІ ✅
- [x] Жоба `D:\weapon-ball-arena\` бөлек құрылды, git init.
- [x] Бір файлды `index.html` прототипі: seeded детерминистік сим,
      20 қару, 8 арена, тарылатын шторм, өз физика-solver, HP/урон/crit/parry,
      3-2-1-FIGHT, жеңіс экраны, синт-дыбыс, MediaRecorder ілмегі.
- [x] Ойнатылатын режим (тінтуір/thrust/WASD) + director режимі (`?auto=1`).
- [x] `game-research/` ішіне 7 пайдалы репо клондалды, зерттелді.

### v0.2 — ІСТЕЛДІ ✅
- [x] rAF throttle шешілді: director режимінде тіркелген кадр-санағыш
      (`__WBA_TICK__` / `__WBA_STATE__` / `__WBA_META__`, `?drive=ext`).
- [x] Қару 26-ға, арена 16-ға толтырылды, урон қайта бапталды.

### v0.3 — ІСТЕЛДІ ✅
- [x] Juice + UX пасс (hitstop, screenshake, callout, HP bar trail, MENU).
- [x] `record/record.js` — Node + puppeteer headless рекордер → `.mp4`.

### v0.4 — ІСТЕЛДІ ✅
- [x] In-page WebCodecs H.264 encode жолы (screenshot fallback қалды).
- [x] Синт-аудио: `__WBA_AUDIO_LOG__` + `record/audio.js` (SFX + музыка бед)
      → ffmpeg AAC микс.
- [x] `thumb.html` — 1280×720 thumbnail генераторы, рекордер оны да түсіреді.
- [x] `branding.html` — арна баннер (2560×1440) + аватар (800×800) генераторы.
- [x] `upload/` — `meta.js` (title/desc/tags), `login.js` (бір реттік OAuth),
      `upload.js` (videos.insert + thumbnail + Telegram), `lib.js` (creds + .env).
- [x] `.github/workflows/` — `pages.yml` (GitHub Pages) + `director.yml`
      (күнде 2× cron: жаса → артефакт → жүкте, немесе dry_run).
- [x] Private GitHub репо: `galymzhan120202-cyber/weapon-ball-arena`.
- [x] Telegram хабарландыру: `@WeaponBallFightArena_bot`, repo secrets
      `WBA_TELEGRAM_NOTIFY_TOKEN` / `WBA_TELEGRAM_NOTIFY_CHAT_ID` орнатылды.

### v0.5 — АРНАНЫ ІСКЕ ҚОСУ (екеуіміз бірге — §9 қараңыз)
- [ ] Жаңа YouTube арна + Brand Account (пайдаланушы қолмен).
- [ ] Ортақ GCP жобада жаңа OAuth Client ID (Desktop) → `client_secrets.json`.
- [ ] `cd upload && npm install && node login.js` — `youtube_token.json` мint,
      арна дұрыс екенін тексеру.
- [ ] `client_secrets.json` + `youtube_token.json` → repo secrets
      `WBA_CLIENT_SECRETS_JSON` / `WBA_YOUTUBE_TOKEN_JSON`.
- [ ] GitHub Pages-ті қосу (Settings → Pages → GitHub Actions).
- [ ] `director.yml` → Run workflow (dry_run: true) — рендер тексеру.
- [ ] Бір видеоны `--privacy=unlisted`-пен қолмен жүктеп көру.
- [ ] Cron-ды қосу (қазір жоспарланған, secrets жоқта өзі skip етеді).

### v1.0 — тұрақты
- [ ] Күнде 2 Shorts автоматты, тұрақты.
- [ ] Рекордер өнімділігі (~9 fps, ұзын клипте баяулайды) — керек болса баптау.
- [ ] Retention өлшеу, механика баптау (weapon-ball-bot тәрізді rebalance циклі).

---

## 7. Ашық сұрақтар

- ✅ Арна атауы шешілді: YouTube арнасы **"Weapon Ball Arena"** (2026-09-04 құрылды).
  Telegram bot `@WeaponBallFightArena_bot` күйінде қалды.
- Director видео форматы: тек Shorts (1080×1920) — landscape "tournament"
  кейінге қалды.
- ✅ Жазу жолы шешілді: Node + puppeteer, WebCodecs H.264 (screenshot fallback).
- Музыка: қазір процедуралық синт-бед (`record/audio.js`). Кейін Openverse
  CC0 тректерін қосу керек пе? Әзірге `music/` папкасы жоқ, керегі жоқ.
- Мобиль ойын (Godot/Unity порт) — кейінгі мақсат, әзірге web жеткілікті.

---

## 8. Файл құрылымы (нақты)

```
D:\weapon-ball-arena\
  index.html              # ойын (playable + director + рекордер ілмектері)
  serve.js                # жергілікті дев-сервер (http://localhost:8778)
  thumb.html              # 1280×720 thumbnail генераторы (standalone)
  branding.html           # баннер 2560×1440 + аватар 800×800 генераторы
  PLAN.md  README.md  .gitignore
  record/
    record.js             # Node + puppeteer → mp4 (WebCodecs / screenshot)
    audio.js              # audio-log → WAV (синт SFX + процедуралық музыка)
    package.json  package-lock.json
  upload/
    lib.js                # creds жүктеу (.env / WBA_*_JSON) + Telegram
    login.js              # бір реттік loopback OAuth → youtube_token.json
    upload.js             # videos.insert + thumbnails.set + Telegram
    meta.js               # seed-детерминистік title / description / tags
    package.json  package-lock.json
  .github/workflows/
    pages.yml             # index/thumb/branding → GitHub Pages
    director.yml          # cron 2×/күн: жаса → артефакт → жүкте (немесе dry_run)
  out/                    # рендер шығысы (gitignore)
  .env                    # жергілікті creds (gitignore)
  client_secrets.json     # (жоқ әзірге — §9) OAuth Desktop client, gitignore
  youtube_token.json      # (жоқ әзірге — §9) login.js жазады, gitignore
```

---

## 9. Арнаны іске қосу — қалған жұмыс (v0.5)

Код түгел дайын. Аккаунт жұмысының **көбі де бітті** (2026-09-04):

### Бітті ✅
- **YouTube арна** `Weapon Ball Arena` (ID `UC7xEyQHGWkUVH4zyXFQ08kQ`) құрылды.
- **Banner + avatar** — Apple-стиль `branding_banner.png` / `branding_avatar.png`
  (`branding.html` → `record/branding-shot.js`), YT Studio-ға жүктеліп жарияланды.
- **Арна сипаттамасы** (EN, 3 абзац) + **15 keyword** енгізілді.
- **OAuth**: `client_secrets.json` + `youtube_token.json` бар; токен дәл осы
  арнаны авторизациялайды (тексерілді: `channels.list mine=true`).
- **Repo secrets**: `WBA_CLIENT_SECRETS_JSON`, `WBA_YOUTUBE_TOKEN_JSON`,
  `WBA_TELEGRAM_NOTIFY_TOKEN`, `WBA_TELEGRAM_NOTIFY_CHAT_ID` — бәрі орнатылды.
- **`director.yml`** dry-run бір рет сәтті өтті (seed 12345, артефакт шықты).
- **Cron** белсенді: `17 8 * * *` және `43 16 * * *` UTC + `workflow_dispatch`.

### Қалды
1. **Ойнатылатын нұсқаны хостинг** (басты бөгет). Репо private + free →
   GitHub Pages өшірулі (`pages.yml`-дегі `push:` комментте, API 404).
   Таңдау:
   - (а) репоны **public** жасау → `pages.yml`-дегі `push:` триггерін қайтару →
     Pages өзі қосылады → play URL = `https://galymzhan120202-cyber.github.io/weapon-ball-arena/`
     (бұл `upload/meta.js`-тегі default — өзгертпейсің).
   - (ә) private қалдырып itch.io / Netlify / Cloudflare Pages-ке салу →
     `upload/meta.js`-тегі `playUrl` + арна сілтемесін жаңарту.
   Шешілмейінше әр видео сипаттамасындағы "▶ Play it yourself" сілтемесі өлі.
2. **Бірінші нақты жүктеу тесті**. Actions → "Director" → Run workflow,
   `dry_run: false`, `privacy: unlisted` → арнада шыққанын (thumbnail, мета,
   Telegram) тексер → көр → өшір/қалдыр. Содан кейін ғана cron-ға сен.
3. **Арна сілтемелері** (косметика) — хостинг болғанда қосу: Play → URL;
   Source → GitHub (репо public болса ғана); Telegram (қаласаң).
4. **Video watermark (Логотип канала)** — міндетті емес; ≤1 МБ, 150×150 PNG
   керек (`branding.html` мark-інен бөлек `branding_watermark.png` рендерлеуге болады).
5. **Псевдоним** `@WeaponBallArenaa` (қос "a") — косметика; `@WeaponBallArena`
   бос болса 14 күнде ауыстыруға болады.
6. **Страна проживания** YT Studio-да орнатылмаған — қаласаң қой.

### v1.0 / жалғасатын
- Рекордер ~9 fps, ұзын клипте баяу — керек болса баптау.
- Retention өлшеу + механика rebalance циклі (видео жиналған соң).
- Cron кадансын / басқа боттармен соқтығысты бір апта бақылау.
