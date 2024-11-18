export function keyNameToX11KeyCode(keyName) {
    // Mapping stored in https://datatracker.ietf.org/doc/html/rfc6143#section-7.5.4
    const keyCodeMap = {
        backspace: 0xff08
        , tab: 0xff09
        , enter: 0xff0d
        , escape: 0xff1b
        , insert: 0xff63
        , delete: 0xffff
        , home: 0xff50
        , end: 0xff57
        , pageup: 0xff55
        , pagedown: 0xff56
        , dpad_left: 0xff51
        , dpad_up: 0xff52
        , dpad_right: 0xff53
        , dpad_down: 0xff54
        , f1: 0xffbe
        , f2: 0xffbf
        , f3: 0xffc0
        , f4: 0xffc1
        , f5: 0xffc2
        , f6: 0xffc3
        , f7: 0xffc4
        , f8: 0xffc5
        , f9: 0xffc6
        , f10: 0xffc7
        , f11: 0xffc8
        , f12: 0xffc9
        , shiftleft: 0xffe1
        , shiftright: 0xffe2
        , controlleft: 0xffe3
        , controlright: 0xffe4
        , metaleft: 0xffe7
        , metaright: 0xffe8
        , altleft: 0xffe9
        , altright: 0xffea
    }

    return keyCodeMap[keyName] || null
}
export default keyNameToX11KeyCode
