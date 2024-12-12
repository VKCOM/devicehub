import ApkReader from '@devicefarmer/adbkit-apkreader'
export default (function(file) {
    return ApkReader.open(file.path).then(function(reader) {
        return reader.readManifest()
    })
})
