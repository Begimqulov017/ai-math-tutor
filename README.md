# AI Math Tutor

React (Vite) + Tailwind v4 + Framer Motion + KaTeX  |  FastAPI + Gemini + SQLAlchemy (PostgreSQL / SQLite)

## Mahalliy ishga tushirish
**Backend**
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate        # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                                 # Mac/Linux: cp .env.example .env
uvicorn main:app --reload --port 8000
```
`.env` ichida kamida `GEMINI_API_KEY_1` (yoki eski `GEMINI_API_KEY`) bo'lsin. Kalitsiz DEMO rejim ishlaydi.
`DATABASE_URL` ni **bo'sh qoldiring** — lokal `backend/app.db` (SQLite) avtomatik ishlatiladi.

**Frontend**
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (API manzili: VITE_API_URL, standart http://localhost:8000)
```

## Sozlamalar (`backend/.env`)
| O'zgaruvchi | Vazifasi |
|---|---|
| `GEMINI_API_KEY_1` … `_8` | Kalitlar. Round-robin, 429/5xx/401/403 xatoda keyingisiga o'tadi |
| `GEMINI_MODEL` | Model nomi |
| `JWT_SECRET` | **Serverda majburiy.** Uzun tasodifiy matn (mehmon cheklovi ham shunga bog'liq) |
| `DATABASE_URL` | PostgreSQL havolasi (serverda). Lokal kompyuterda bo'sh |
| `BREVO_API_KEY`, `MAIL_FROM` | Email kodni yuborish (Brevo HTTPS API). **Render bepul tarifida SMTP yopiq**, shuning uchun shu yo'l tavsiya etiladi |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Oddiy SMTP (VPS yoki pullik hosting uchun; Render bepulda ishlamaydi) |
| `EMAIL_DEV_LOG` | `1` bo'lsa kod emailga emas, server konsoliga chiqadi (faqat lokal sinov uchun) |
| `REQUIRE_EMAIL_VERIFICATION` | `true` (standart) = email kod majburiy; `false` = kodsiz ro'yxatdan o'tish (faqat lokal) |
| `DAILY_TOKENS` | Har bir login qilgan foydalanuvchiga kuniga nechta masala (standart 50) |
| `ADMIN_PASSWORD` | Admin panel paroli: **aynan 16 ta raqam**. Faqat serverning o'zgaruvchilarida (Render → Environment) yoki lokal `.env` da turadi. Bo'sh bo'lsa admin panel butunlay o'chiq |
| `ADMIN_TOKEN_HOURS` | Admin seansi necha soat amal qiladi (standart 2) |
| `GUEST_PROBLEM_LIMIT` | Mehmon (login qilmagan) uchun bitta IP'dan nechta **turli** misol. Standart 3, `0` = cheklovsiz |
| `GUEST_WINDOW_HOURS` | `0` = cheklov hech qachon tiklanmaydi; `24` = 24 soatdan keyin tiklanadi |
| `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS` | Haqiqiy IP'ni topish (pastga qarang) |

CORS hamma domenlarga ochiq (`allow_origins=["*"]`, cookie ishlatilmaydi — login Bearer token bilan).

## "Network error" chiqsa — tekshiruv tartibi
1. Brauzerda `https://<backend>/api/health` ni oching. Ochilmasa — backend ishlamayapti yoki uxlayapti (Render bepul: 30–60 soniya).
2. `https://<backend>/api/health/db` — `"status":"ok"` bo'lishi kerak. `503` bo'lsa `DATABASE_URL` noto'g'ri yoki baza yetib bormayapti (Render **Logs** bo'limiga qarang).
3. Frontendda `VITE_API_URL` backend manziliga (`https://...onrender.com`, oxirida `/` yo'q, `https` bilan) qo'yilganmi? Qo'yilmasa sayt `localhost:8000` ga murojaat qiladi. O'zgartirgach frontendni **qayta build** qiling.
4. Backend loglarida `unhandled error` bormi? Endi bunday xatolar ham aniq JSON (`Server error...`) bo'lib keladi, "Network error" bo'lib emas.

## Ma'lumotlar bazasi
| `DATABASE_URL` | Natija |
|---|---|
| bo'sh | lokal SQLite fayl `backend/app.db` |
| `postgresql://...` yoki `postgres://...` | shu PostgreSQL bazasi (jadvallar birinchi ishga tushishda o'zi yaratiladi) |

**Neon.tech:** loyiha yarating → *Connection string* ni `DATABASE_URL` ga qo'ying.
**Supabase:** *Connect → Session pooler* satrini oling. Parolda `@ : / #` bo'lsa URL-kodlang.

Barqarorlik: ulanish har safar tekshiriladi (`pool_pre_ping`), 4 daqiqadan eskisi yangilanadi, TCP keepalive yoqilgan,
`sslmode=require` avtomatik, baza uxlab uyg'onayotgan bo'lsa so'rov o'zi qayta uriniladi. `/api/health` bazaga murojaat
qilmaydi (cron-ping bazani uyg'otib turmaydi), bazani tekshirish uchun `/api/health/db`.

## Mehmon cheklovi (IP bo'yicha)
Login qilmagan foydalanuvchi bitta IP'dan faqat **3 ta turli misol** yecha oladi (shu misolni qayta ochish hisobga olinmaydi).
Cheklov serverda, bazada saqlanadi (restartdan keyin ham tiklanmaydi); IP faqat kalitli xesh ko'rinishida saqlanadi.
AI xato bersa, ishlatilgan o'rin qaytariladi. Lokal kompyuterda (`127.0.0.1`) cheklov yo'q.

**Haqiqiy IP'ni sozlash (bir marta, deploydan keyin):**
1. Telefoningizda **Wi-Fi o'chirib** (mobil internet), `https://<backend>/api/ip-check` ni oching.
2. `"ip"` qiymati telefoningizning haqiqiy umumiy IP'siga (masalan, whatismyip.com) teng bo'lishi kerak.
3. Teng bo'lmasa, backend o'zgaruvchilaridan birini qo'ying va qayta tekshiring:
   `CLIENT_IP_HEADER=true-client-ip` yoki `TRUSTED_PROXY_HOPS=2`.
4. Tekshiruv: `curl -H "X-Forwarded-For: 1.2.3.4" https://<backend>/api/ip-check` — `"ip"` **1.2.3.4 bo'lmasligi** kerak
   (aks holda mehmon cheklovini aylanib o'tish mumkin).

## Render'ga joylash
**Backend (Web Service)**: Root Directory `backend` · Build `pip install -r requirements.txt` ·
Start `uvicorn main:app --host 0.0.0.0 --port $PORT` · Health Check Path `/api/health` ·
Environment: `PYTHON_VERSION=3.11.9`, `DATABASE_URL`, `GEMINI_API_KEY_1`, `JWT_SECRET`.
**Frontend (Static Site)**: Root Directory `frontend` · Build `npm install && npm run build` · Publish `dist` ·
Environment: `VITE_API_URL=https://<backend-nomi>.onrender.com`.
**Uxlab qolmasligi:** cron-job.org yoki UptimeRobot'da `https://<backend>/api/health` ni har 10 daqiqada chaqiring.

## Xavfsizlik va xarajat
- Gemini limitlari **kalit emas, Google Cloud loyihasi** bo'yicha hisoblanadi: bir loyihadagi 8 ta kalit limitni oshirmaydi.
  Ko'p loyiha/akkauntni kvotani aylanib o'tish uchun ishlatish cheklanishga olib kelishi mumkin. Eng ishonchlisi: billing + spend cap.
- Bepul tarifda so'rov/javoblar Google tomonidan ko'rib chiqilishi va o'qitishda ishlatilishi mumkin.
- Mashq javoblari serverda saqlanadi, XP faqat serverda hisoblanadi va har savol uchun bir marta beriladi.

## Tokenlar (kuniga 50 ta)
- Har bir login qilgan foydalanuvchi kuniga `DAILY_TOKENS` (50) ta masala yecha oladi. Hisob Toshkent vaqti bo'yicha yarim tunda yangilanadi.
- 1 ta masala = 1 token. **Shu masalani o'sha kuni qayta ochish bepul.** AI xato bersa token qaytariladi.
- Tokenlar tugasa, `/api/analyze-problem` `403` qaytaradi: `{"code": "tokens_exhausted", "message": "Daily tokens exhausted..."}`.
- Yangilanishda tokenlar 50 gacha **to'ldiriladi** (`max(joriy, 50)`): admin bergan ortiqcha tokenlar yo'qolmaydi.
- Eski bazalar uchun ustunlar (`tokens_remaining`, `last_token_reset`) server ishga tushganda o'zi qo'shiladi (`db.migrate()`, qayta-qayta ishlatish xavfsiz).

## Admin panel
- Kirish: sahifa pastidagi kichik ⚙ tugmasi yoki `https://<sayt>/#admin`.
- Parol serverda tekshiriladi (kodda yoki repoda saqlanmaydi), 10 daqiqada 5 ta urinish bilan cheklangan. Muvaffaqiyatli kirishda 2 soatlik admin tokeni beriladi (xotirada turadi, sahifa yangilansa chiqib ketasiz).
- Imkoniyatlar: foydalanuvchilar ro'yxati (email, ism, tokenlar, XP, streak, masalalar, to'g'ri/xato, oxirgi faollik), email bo'yicha qidiruv, istalgan foydalanuvchiga token qo'shish.

## Suhbatlar (xotirali AI chat)
- Login qilgan foydalanuvchi uchun har bir yechilgan masalaga **avtomatik alohida suhbat** ochiladi (`chat_threads`), xabarlar `chat_messages` da saqlanadi.
- AI har javobda shu suhbatning mavzu xulosasini (masala, mavzu, yechim qadamlari) va oxirgi 20 ta xabarini oladi, shuning uchun nima haqida gaplashilganini eslab qoladi.
- Chap paneldan yangi (erkin) suhbat ochish, almashish va o'chirish mumkin. Mehmonlar uchun chat vaqtinchalik (saqlanmaydi).

## Testlar
```bash
cd backend
python tests/test_features.py     # tokenlar, kunlik tiklanish, admin, suhbat xotirasi
python tests/test_migration.py    # eski bazani yangilash
python tests/test_tts_otp.py      # nutq normalizatori, /api/tts, email kod oqimi
```

## Neyron ovoz (UZ / RU / EN)
- `POST /api/tts` `{"text": "...", "lang": "uz|ru|en"}` MP3 (`audio/mpeg`) qaytaradi. Ovozlar: `uz-UZ-MadinaNeural`, `ru-RU-SvetlanaNeural`, `en-US-AriaNeural` (kutubxona: `edge-tts`).
- Matn avval so'zlarga aylantiriladi (`backend/speech.py`, `math_to_spoken_text`): `x^2` → «x kvadrat», `\sqrt` → «ildiz ostida», `=` → «teng», `\frac{a}{b}` → «kasr a bo'lingan b» va hokazo.
- Bir xil gap faqat bir marta sintez qilinadi (server xotirasida keshlanadi), daqiqasiga 30 ta so'rov chegarasi bor.
- Brauzer tomonda bitta umumiy `<audio>` elementi **birinchi bosishda** jim ovoz bilan "ochiladi" (iOS Safari / Android Chrome), keyin tarmoqdan kelgan har qanday ovoz shu orqali o'ynaydi. Server ovozi ishlamasa, brauzerning o'z ovozi (`speechSynthesis`) zaxira sifatida ishlatiladi.
- **Eslatma:** `edge-tts` Microsoft Edge'ning rasmiy bo'lmagan (hujjatlashtirilmagan) xizmatidan foydalanadi: kafolat yo'q, Microsoft uni o'zgartirishi yoki cheklashi mumkin. Kutubxona yangilanib turishi kerak (`pip install -U edge-tts`). Jiddiy foydalanish uchun rasmiy Azure Speech (xuddi shu ovoz nomlari) ga o'tish mumkin.

## Email tasdiqlash (6 xonali kod)
1. `POST /api/auth/register` → kod emailga yuboriladi, akkaunt **hali yaratilmaydi** (`email_verifications` jadvalida kutadi).
2. `POST /api/auth/verify` `{email, code}` → to'g'ri kod bo'lsa akkaunt yaratiladi va token beriladi.
3. `POST /api/auth/resend` → yangi kod (har 60 soniyada bir marta; urinishlar nolga qaytadi).
- Kod 10 daqiqa amal qiladi, 5 ta noto'g'ri urinishdan keyin yonib ketadi (qaytadan ro'yxatdan o'tish kerak), IP bo'yicha ham cheklangan (10 daqiqada 5 ta xat).
- Email yuborilmasa yoki sozlanmagan bo'lsa, kutuvchi yozuv o'chiriladi va foydalanuvchi aniq xabar oladi (kutish cheklovi qolib ketmaydi).

**Brevo (bepul) sozlash:** brevo.com'da ro'yxatdan o'ting → *Senders* bo'limida o'z email manzilingizni tasdiqlang (domen shart emas) → *SMTP & API → API keys* dan kalit oling →
`BREVO_API_KEY=...` va `MAIL_FROM=<tasdiqlangan manzil>` ni Render **Environment** ga qo'ying. Bepul tarifdagi kunlik xat chegarasini Brevo saytidan tekshiring.

**Lokal sinov:** `.env` ga `EMAIL_DEV_LOG=1` qo'ying — kod backend terminalida `VERIFICATION CODE for ...: 123456` ko'rinishida chiqadi.
