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
