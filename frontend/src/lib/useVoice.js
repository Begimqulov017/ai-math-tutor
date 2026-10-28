import { useCallback, useRef } from 'react'
import { SPEECH } from './i18n'
import { ttsBlob } from './api'

// ---------------------------------------------------------------------------------------------------------------
// Voice output: a neural voice from the server (POST /api/tts -> MP3). window.speechSynthesis is only the fallback.
//
// Mobile browsers (iOS Safari, Android Chrome) allow audio only after a user gesture, and an MP3 that arrives after
// a network round trip is no longer "inside" the gesture. Solution: ONE shared <audio> element is "unlocked" by playing
// a silent clip during a tap; afterwards the same element can play any later clip.
// ---------------------------------------------------------------------------------------------------------------
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

let audio = null
let audioCtx = null
let unlocked = false
let unlocking = false
let clipActive = false // a real clip is loaded / playing: do not touch the element
let seq = 0            // every speak() gets a number; an older, slower answer must not talk over a newer one
let controller = null
let currentUrl = null
const blobCache = new Map() // "lang|text" -> Blob, so "Listen" a second time is instant

export function getAudio() {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.setAttribute?.('playsinline', '')
  }
  return audio
}

/** Call this inside a click/tap handler (voice toggle, Play, Listen ...). Safe to call many times. */
export function unlockAudio() {
  if (unlocked || unlocking || clipActive) return
  try { // WebAudio is unlocked by the same gesture on iOS
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) { audioCtx = audioCtx || new AC(); audioCtx.resume?.()?.catch?.(() => {}) }
  } catch { /* no WebAudio */ }
  try {
    unlocking = true
    const a = getAudio()
    a.src = SILENT_WAV
    const p = a.play()
    if (p && p.then) {
      p.then(() => { unlocked = true; unlocking = false; if (!clipActive) a.pause() }).catch(() => { unlocking = false })
    } else { unlocked = true; unlocking = false }
  } catch { unlocking = false }
}

export function stopSpeaking() {
  seq++
  controller?.abort()
  controller = null
  clipActive = false
  try { audio?.pause() } catch { /* ignore */ }
  if (currentUrl) { URL.revokeObjectURL?.(currentUrl); currentUrl = null }
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
}

// Clean math & phonetic variables for browser fallback so even offline fallback says "iks" instead of "h"
function formatFallbackSpeech(text, lang) {
  let s = String(text || '')
    .replace(/\$/g, ' ')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, lang === 'ru' ? ' дробь $1 делённое на $2 ' : lang === 'en' ? ' $1 over $2 ' : " kasr $1 bo'lingan $2 ")
    .replace(/\\sqrt\{([^{}]*)\}/g, lang === 'ru' ? ' корень из $1 ' : lang === 'en' ? ' square root of $1 ' : ' ildiz ostida $1 ')
    .replace(/\^2(?!\d)|\^\{2\}/g, lang === 'ru' ? ' в квадрате ' : lang === 'en' ? ' squared ' : ' kvadrat ')
    .replace(/\^3(?!\d)|\^\{3\}/g, lang === 'ru' ? ' в кубе ' : lang === 'en' ? ' cubed ' : ' kub ')
    .replace(/=/g, lang === 'ru' ? ' равно ' : lang === 'en' ? ' equals ' : ' teng ')
    .replace(/\+/g, lang === 'ru' ? ' плюс ' : lang === 'en' ? ' plus ' : " qo'shuv ")
    .replace(/(?<=\s|-|^)-(?=\s|\d|[a-zA-Z])/g, lang === 'ru' ? ' минус ' : lang === 'en' ? ' minus ' : ' minus ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, ' ')
  if (lang === 'uz') {
    s = s.replace(/(?<=\d)([xXyYzZ])\b/g, ' $1')
    s = s.replace(/\b[xX]\b/g, 'iks').replace(/\b[yY]\b/g, 'igrek').replace(/\b[zZ]\b/g, 'zet')
  } else if (lang === 'ru') {
    s = s.replace(/(?<=\d)([xXyYzZ])\b/g, ' $1')
    s = s.replace(/\b[xX]\b/g, 'икс').replace(/\b[yY]\b/g, 'игрек').replace(/\b[zZ]\b/g, 'зет')
  }
  return s.replace(/\s+/g, ' ').trim()
}

function browserSpeak(text, lang) { // secondary fallback: the voices installed in the browser
  try {
    if (!('speechSynthesis' in window) || !text) return
    const spoken = formatFallbackSpeech(text, lang)
    const u = new SpeechSynthesisUtterance(spoken)
    u.lang = SPEECH[lang] || 'en-US'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* nothing else to try */ }
}

/** Reads `text` (may contain $LaTeX$) aloud. Resolves as soon as playback has started (or the fallback took over). */
export async function speakText(text, lang = 'uz') {
  const clean = String(text || '').trim()
  if (!clean) return
  stopSpeaking()
  const my = seq
  const key = lang + '|v2|' + clean
  try {
    let blob = blobCache.get(key)
    if (!blob) {
      controller = new AbortController()
      blob = await ttsBlob(clean, lang, controller.signal)
      if (blobCache.size >= 30) blobCache.delete(blobCache.keys().next().value)
      blobCache.set(key, blob)
    }
    if (my !== seq) return // a newer request replaced this one while it was loading
    const url = URL.createObjectURL(blob)
    if (currentUrl) URL.revokeObjectURL?.(currentUrl)
    currentUrl = url
    const a = getAudio()
    clipActive = true
    a.onended = a.onerror = () => { if (my === seq) clipActive = false }
    a.src = url
    await a.play()
  } catch (e) {
    if (my !== seq || e?.name === 'AbortError') return
    clipActive = false
    browserSpeak(clean, lang)
  }
}

// the very first tap anywhere also unlocks audio (covers buttons that do not call unlockAudio() themselves)
if (typeof window !== 'undefined') {
  ;['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, unlockAudio, { capture: true, passive: true }))
}

export function useVoice(lang) {
  const rec = useRef(null)
  const speak = useCallback((text) => speakText(text, lang), [lang])
  const listen = useCallback((onText, onEnd) => { // speech-to-text (microphone)
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
  return { speak, listen, stop, stopSpeak: stopSpeaking }
}
