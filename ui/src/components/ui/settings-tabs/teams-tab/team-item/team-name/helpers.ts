export const validateString = (input: string): boolean => {
  const regex = /^[0-9a-zA-Z-_./: ]{1,50}$/

  return regex.test(input)
}
