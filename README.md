# AI Math Tutor

React (Vite) + Tailwind v4 + Framer Motion + KaTeX  |  FastAPI + Gemini

## Ishga tushirish
### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # GEMINI_API_KEY ni yozing (kalitsiz DEMO rejim ishlaydi)
uvicorn main:app --reload --port 8000
```
### Frontend
```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173  (/api -> :8000 proxy)
```
Ovoz (STT/TTS) brauzer Web Speech API orqali ishlaydi (Chrome tavsiya etiladi).
