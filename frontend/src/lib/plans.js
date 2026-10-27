// Plan numbers shown in the UI. The server (backend/config.py) is the source of truth for what a plan really gives.
export const TELEGRAM = 'begimqulov_017'
export const TELEGRAM_URL = `https://t.me/${TELEGRAM}`
export const PLANS = {
  free: { id: 'free', tokens: 50, price: 0 },
  premium: { id: 'premium', tokens: 200, price: 20000 },
  vip: { id: 'vip', tokens: 500, price: 50000 },
}
export const fmtPrice = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
