import { checkAnswer } from './api'

export const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').split(/[,;]/).filter(Boolean).sort().join(',')

// quick local match first, then the AI decides equivalence (1/2 = 0.5, etc.)
export async function grade({ q, answer, user, lang }) {
  if (norm(user) === norm(answer)) return { correct: true, feedback: '' }
  try { return await checkAnswer({ question: q, expected: answer, user_answer: user, lang }) } catch { return { correct: false, feedback: '' } }
}
