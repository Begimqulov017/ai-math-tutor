import { useRef, useCallback } from 'react'
import { SPEECH } from './i18n'

export function useVoice(lang) {
  const rec = useRef(null)
  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window) || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/\$/g, ''))
    u.lang = SPEECH[lang]
    window.speechSynthesis.speak(u)
  }, [lang])
  const listen = useCallback((onText, onEnd) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition is not supported in this browser'); onEnd?.(); return }
    const r = new SR()
    r.lang = SPEECH[lang]
    r.onresult = (e) => onText(e.results[0][0].transcript)
    r.onend = () => onEnd?.()
    r.start()
    rec.current = r
  }, [lang])
  const stop = useCallback(() => rec.current?.stop(), [])
  return { speak, listen, stop }
}
