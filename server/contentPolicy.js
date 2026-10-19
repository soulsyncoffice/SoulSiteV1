const digitWords = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
}

export function normalizeUserText(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/\[(?:dot|period)\]|\((?:dot|period)\)|\s+dot\s+/g, '.')
    .replace(/\[(?:at)\]|\((?:at)\)|\s+at\s+/g, '@')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (word) => digitWords[word])
}

export function hasContactInformation(value) {
  if (typeof value !== 'string' || !value.trim()) return false

  const normalized = normalizeUserText(value)
  if (/\b[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\.[a-z]{2,}\b/i.test(normalized)) return true
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(normalized)) return true
  if (/\b[a-z0-9-]+\.(?:com|net|org|io|co|me|app|dev|info|biz|xyz|online)\b/i.test(normalized)) return true
  if (/\b(?:instagram|facebook|snapchat|tiktok|telegram|whatsapp|signal|discord|wechat)\s*(?::|is|at)?\s*[@:]?[a-z0-9_.-]{2,}\b/i.test(normalized)) return true
  if (/(?:^|\s)@[a-z0-9_.-]{2,}/i.test(normalized)) return true

  const phoneCandidates = normalized.match(/(?:\+?\d[\d\s().-]{5,}\d)/g) || []
  return phoneCandidates.some((candidate) => {
    const digitCount = candidate.replace(/\D/g, '').length
    return digitCount >= 7 && digitCount <= 15
  })
}
