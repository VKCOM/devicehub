export const asciiparser = function(key) {
    switch (key) {
    case 'enter':
        return '\r'
    case 'del':
        return '\x08'
    default:
        return key
    }
}
