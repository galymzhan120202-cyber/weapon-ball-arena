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

### v0.1 — БҮГІН ІСТЕЛДІ ✅
- [x] Жоба `D:\weapon-ball-arena\` бөлек құрылды, git init.
- [x] Бір файлды `index.html` прототипі: seeded детерминистік сим,
      20 қару, 8 арена, тарылатын шторм, өз физика-solver, HP/урон/crit/parry,
      3-2-1-FIGHT, жеңіс экраны, синт-дыбыс, MediaRecorder ілмегі.
- [x] Ойнатылатын режим (тінтуір/thrust/WASD) + director режимі (`?auto=1`).
- [x] Браузерде рендер тексерілді (Blood Moon, Sword vs Warhammer).
- [x] `game-research/` ішіне 7 пайдалы репо клондалды, зерттелді.

### v0.2 — келесі
- [ ] rAF throttle мәселесін шешу: director режимінде тіркелген кадр-санағыш.
- [ ] Node + Playwright рекордер → `.mp4` (canvas-record немесе screenshot).
- [ ] Hit-event log → ffmpeg аудио микс (синт SFX + Openverse музыка).
- [ ] `thumb.html` thumbnail генераторы.
- [ ] Қару санын 26-ға, арена 16-ға толтыру + иконка сапасын көтеру.
- [ ] Меню экраны (қару таңдау, қарсылас саны).

### v0.3 — арна іске қосу
- [ ] Жаңа YouTube арна + Brand Account (пайдаланушы).
- [ ] Жаңа OAuth Client ID + `youtube_token.json` (жаңа арна).
- [ ] `upload/` Node скрипті + жергілікті бір рет қолмен жүктеу тесті.
- [ ] GitHub repo (жаңа, бөлек) + Actions secrets.
- [ ] GitHub Pages-ке ойнатылатын нұсқа.
- [ ] `workflow_dispatch` арқылы бір видео қолмен → тексеру → cron.

### v1.0 — тұрақты
- [ ] Күнде 2–3 Shorts автоматты.
- [ ] Ойнатылатын нұсқаға сілтеме видео сипаттамасында (трафик ойынға).
- [ ] Retention өлшеу, механика баптау (weapon-ball-bot тәрізді rebalance циклі).

---

## 7. Ашық сұрақтар

- Арна атауы түпкілікті ме? ("Weapon Ball Arena" әзірге жұмыс атауы.)
- Director видео форматы: тек Shorts (1080×1920) ме, әлде кейде landscape
  "tournament" де ме (marble-race-bot сияқты)?
- Мобиль ойын (Godot/Unity порт) — кейінгі мақсат, әзірге web жеткілікті.
- Жазу жолы: браузер-`MediaRecorder`+ffmpeg (қарапайым) vs Node-Playwright
  (CI-ге таза) — v0.2-де екеуін де сынап, біреуін таңдаймыз.

---

## 8. Файл құрылымы (жоспарланған)

```
D:\weapon-ball-arena\
  index.html              # ойын (playable + director) — БАР
  serve.js                # жергілікті дев-сервер — БАР
  PLAN.md                 # осы файл — БАР
  README.md               # қысқа сипаттама — келесі
  .gitignore              # secrets, node_modules, *.mp4 — келесі
  branding.html           # арна баннер/аватар генераторы
  thumb.html              # thumbnail генераторы
  record/
    record.js             # Node + Playwright → mp4
    audio.js              # hit-log → ffmpeg SFX/музыка микс
  upload/
    login.js              # бір реттік OAuth
    upload.js             # youtube.videos.insert + Telegram
    meta.js               # тақырып/сипаттама/тег шаблондары
  .github/workflows/
    pages.yml             # GitHub Pages деплой
    director.yml          # cron: видео жаса + жүкте
  music/                  # Openverse fallback тректер + attribution
```
