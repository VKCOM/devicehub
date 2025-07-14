var GRAVITY = {
    northwest: 'NorthWest',
    north: 'North',
    northeast: 'NorthEast',
    west: 'West',
    center: 'Center',
    east: 'East',
    southwest: 'SouthWest',
    south: 'South',
    southeast: 'SouthEast'
}
export default (function(raw) {
    var parsed
    if (raw && (parsed = GRAVITY[raw])) {
        return parsed
    }
    return null
})
