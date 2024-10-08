import express from 'express'
import {Server} from 'http'
import * as socket from 'socket.io'
var app = express()
// eslint-disable-next-line new-cap
var http = {Server}.Server(app)
var io = socket(http)
var port = 6666
http.listen(port, function() {
    console.log('listening on *:' + port)
})
export default io
