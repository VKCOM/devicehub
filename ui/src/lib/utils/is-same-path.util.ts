const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// Segments are decoded separately, so an encoded slash never acts as a separator
const pathSegments = (path: string): string[] => path.split('/').map(decodeSegment)

/** Compares route paths regardless of how their segments are percent-encoded, e.g. `a:b` and `a%3Ab` */
export const isSamePath = (a: string, b: string): boolean => {
  if (a === b) return true

  const segmentsA = pathSegments(a)
  const segmentsB = pathSegments(b)

  return segmentsA.length === segmentsB.length && segmentsA.every((segment, index) => segment === segmentsB[index])
}
