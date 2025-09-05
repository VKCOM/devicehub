export const toSentenceCase = (str: string): string => {
  if (str.includes('@')) return str

  if (str.includes('.')) return str

  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
