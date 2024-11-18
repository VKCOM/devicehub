const _ = require('lodash') // TODO: import debounce only
const rotator = require('./rotator')
const ImagePool = require('./imagepool')
const Promise = require('bluebird')

module.exports = function DeviceScreenDirective(
    $document,
    $rootScope,
    $route,
    $timeout,
    $window,
    $uibModalStack,
    GroupService,
    PageVisibilityService,
    ScalingService,
    ScreenLoaderService,
    TemporarilyUnavailableService,
    VendorUtil,
) {
    return {
        restrict: 'E'
        , template: require('./screen.pug')
        , scope: {
            control: '<'
            , device: '=',
        }
        , link: function($scope, $element) {
            let attempts = parseInt(localStorage.getItem(`attempts-${$scope.device.serial}`)) || 0

            if ($scope.device.ios && $scope.device.present && (!$scope.device.display.width || !$scope.device.display.height) && attempts < 3) {
                attempts++
                localStorage.setItem(`attempts-${$scope.device.serial}`, attempts)
                return Promise.delay(1000).then(() => $route.reload())
            }

            localStorage.removeItem(`attempts-${$scope.device.serial}`)

            const element = $element[0]
            const URL = window.URL || window.webkitURL
            const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
            const cssTransform = VendorUtil.style(['transform', 'webkitTransform'])
            const input = element.querySelector('.screen__input')
            const screen = {
                rotation: 0
                , bounds: {
                    x: 0
                    , y: 0
                    , w: 0
                    , h: 0,
                },
            }
            const cachedScreen = {
                rotation: 0
                , bounds: {
                    x: 0
                    , y: 0
                    , w: 0
                    , h: 0,
                },
            }
            const scaler = ScalingService.coordinator(
                $scope.device.display.width,
                $scope.device.display.height
            )
            let cachedImageWidth = 0
            let cachedImageHeight = 0
            let cssRotation = 0
            let alwaysUpright = false
            const imagePool = new ImagePool(10)
            let canvasAspect = 1
            let parentAspect = 1
            const wsReconnectionInterval = 5000 // 5s
            const wsReconnectionMaxAttempts = 3 // 5s * 3 -> 15s total delay
            let wsReconnectionAttempt = 0
            let wsReconnectionTimeoutID = null
            let wsReconnecting = false
            let tempUnavailableModalInstance = null

            $scope.screen = screen
            ScreenLoaderService.show()
            handleScreen()
            handleKeyboard()
            handleTouch()

            function closeTempUnavailableModal() {
                if (tempUnavailableModalInstance) {
                    tempUnavailableModalInstance.dismiss(true)
                    tempUnavailableModalInstance = null
                }
                else {
                    const modalInstance = $uibModalStack.getTop()

                    if (modalInstance && modalInstance.value.openedClass === '_temporarily-unavailable-modal') {
                        modalInstance.key.dismiss(true)
                    }
                }
            }

            /**
       * SCREEN HANDLING
       *
       * This section should deal with updating the screen ONLY.
       */
            function handleScreen() {
                let ws, adjustedBoundSize
                const canvas = element.querySelector('.screen__canvas')
                const g = canvas.getContext('2d')
                // const positioner = element.querySelector('div.positioner')
                const devicePixelRatio = window.devicePixelRatio || 1
                const backingStoreRatio = vendorBackingStorePixelRatio(g)
                const frontBackRatio = devicePixelRatio / backingStoreRatio
                const options = {
                    autoScaleForRetina: true
                    , density: Math.max(1, Math.min(1.5, devicePixelRatio || 1))
                    , minscale: 0.36,
                }
                let cachedEnabled = false

                connectWS()
                addListeners()
                resizeListener()

                $scope.retryLoadingScreen = function() {
                    if ($scope.displayError === 'secure') {
                        $scope.control.home()
                    }
                }

                function addListeners() {
                    const deviceUsingUnwatch = $scope.$watch('device.using', checkEnabled)
                    // TODO: for now control-panes controller will reload the state to handle this case
                    // const deviceStateUnwatch = $scope.$watch('device.state', (newValue, oldValue) => {
                    //   // Try to reconnect after status changed
                    //   if (newValue !== oldValue && newValue === 'available') {
                    //     reconnectWS()
                    //   }
                    // })
                    const showScreenUnwatch = $scope.$watch('$parent.showScreen', checkEnabled)
                    const visibilitychangeUnwatch = $scope.$on('visibilitychange', checkEnabled)
                    const debouncedPaneResizeUnwatch = $scope.$on('fa-pane-resize', _.debounce(updateBounds, 1000))
                    const paneResizeUnwatch = $scope.$on('fa-pane-resize', resizeListener)
                    const guestPortraitUnwatch = $scope.$on('guest-portrait', () => $scope.control.rotate(0))
                    const guestLandscapeUnwatch = $scope.$on('guest-landscape', () => $scope.control.rotate(90))

                    $window.addEventListener('resize', resizeListener, false)
                    // remove all listeners
                    $scope.$on('$destroy', () => {
                        if (wsReconnectionTimeoutID) {
                            $timeout.cancel(wsReconnectionTimeoutID)
                        }
                        deviceUsingUnwatch()
                        // deviceStateUnwatch()
                        showScreenUnwatch()
                        visibilitychangeUnwatch()
                        debouncedPaneResizeUnwatch()
                        paneResizeUnwatch()
                        guestPortraitUnwatch()
                        guestLandscapeUnwatch()
                        stop()
                        $window.removeEventListener('resize', resizeListener, false)
                    })
                }

                function connectWS() {
                    ws = new WebSocket($scope.device.display.url)

                    ws.binaryType = 'blob'
                    ws.onerror = errorListener
                    ws.onclose = closeListener
                    ws.onopen = openListener
                    ws.onmessage = messageListener
                }

                function reconnectWS() {
                    // no need reconnect by WS status (OPEN - no need, CONNECTING - "onclose" will fire reconnection)
                    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
                        return
                    }
                    // no need reconnect if it is already in progress
                    if (wsReconnecting || wsReconnectionTimeoutID) {
                        return
                    }

                    wsReconnecting = true
                    wsReconnectionAttempt += 1
                    stop()
                    connectWS()
                }

                function errorListener() {
                    // handle if need
                    // console.log('DeviceScreen::WS connection error')
                }

                function closeListener() {
                    wsReconnecting = false
                    ScreenLoaderService.show()

                    if (wsReconnectionAttempt < wsReconnectionMaxAttempts) {
                        wsReconnectionTimeoutID = $timeout(() => {
                            wsReconnectionTimeoutID = null
                            reconnectWS()
                        }, wsReconnectionInterval)
                    }
                    else if (!tempUnavailableModalInstance) {
                        tempUnavailableModalInstance = TemporarilyUnavailableService
                            .open('Service is currently unavailable! Try your attempt later.')
                    }
                }

                function openListener() {
                    closeTempUnavailableModal()
                    checkEnabled()

                    if (wsReconnecting) {
                        wsReconnecting = false
                        wsReconnectionAttempt = 0
                    }
                }

                function messageListener(message) {
                    screen.rotation = $scope.device.display.rotation

                    if (message.data instanceof Blob) {
                        if (shouldUpdateScreen()) {
                            if ($scope.displayError) {
                                $scope.$apply(() => {
                                    $scope.displayError = false
                                })
                            }
                            if (ScreenLoaderService.isVisible) {
                                ScreenLoaderService.hide()
                            }

                            let blob = new Blob([message.data], {type: 'image/jpeg'})
                            let img = imagePool.next()
                            let url = URL.createObjectURL(blob)
                            const cleanData = () => {
                                img.onload = img.onerror = null
                                img.src = BLANK_IMG
                                img = null
                                blob = null
                                URL.revokeObjectURL(url)
                                url = null
                            }

                            img.onload = function() {
                                updateImageArea(this)
                                g.drawImage(img, 0, 0, img.width, img.height)

                                // Try to forcefully clean everything to get rid of memory
                                // leaks. Note that despite this effort, Chrome will still
                                // leak huge amounts of memory when the developer tools are
                                // open, probably to save the resources for inspection. When
                                // the developer tools are closed no memory is leaked.
                                cleanData()
                            }

                            img.onerror = function() {
                                // Happily ignore. I suppose this shouldn't happen, but
                                // sometimes it does, presumably when we're loading images
                                // too quickly.

                                // Do the same cleanup here as in onload.
                                cleanData()
                            }

                            img.src = url
                        }
                    }
                    else if (/^start /.test(message.data)) {
                        applyQuirks(JSON.parse(message.data.substr('start '.length)))
                    }
                    else if (message.data === 'secure_on') {
                        $scope.$apply(() => {
                            $scope.displayError = 'secure'
                        })
                    }
                }

                function stop() {
                    try {
                        ws.onerror = ws.onclose = ws.onmessage = ws.onopen = null
                        ws.close()
                        ws = null
                    }
                    catch (err) { /* noop */ }
                }

                function vendorBackingStorePixelRatio(g) {
                    return g.webkitBackingStorePixelRatio ||
            g.mozBackingStorePixelRatio ||
            g.msBackingStorePixelRatio ||
            g.oBackingStorePixelRatio ||
            g.backingStorePixelRatio ||
            1
                }

                function updateBounds() {
                    // Developer error, let's try to reduce debug time
                    if (!element.offsetWidth || !element.offsetHeight) {
                        throw new Error('Unable to read bounds; container must have dimensions')
                    }

                    const w = element.offsetWidth
                    const h = element.offsetHeight
                    let newAdjustedBoundSize

                    screen.bounds.w = w
                    screen.bounds.h = h
                    newAdjustedBoundSize = getNewAdjustedBoundSize(w, h)

                    if (!adjustedBoundSize ||
            newAdjustedBoundSize.w !== adjustedBoundSize.w ||
            newAdjustedBoundSize.h !== adjustedBoundSize.h) {
                        adjustedBoundSize = newAdjustedBoundSize
                        onScreenInterestAreaChanged()
                    }
                }

                function getNewAdjustedBoundSize(w, h) {
                    switch (screen.rotation) {
                    case 90:
                    case 270:
                        return adjustBoundedSize(h, w)
                    case 0:
                    case 180:

                        /* falls through */
                    default:
                        return adjustBoundedSize(w, h)
                    }
                }

                function adjustBoundedSize(w, h) {
                    let sw = w * options.density
                    let sh = h * options.density
                    const scaledW = $scope.device.display.width * options.minscale
                    const scaledH = $scope.device.display.height * options.minscale

                    if (sw < scaledW) {
                        sw *= scaledW / sw
                        sh *= scaledW / sh
                    }

                    if (sh < scaledH) {
                        sw *= scaledH / sw
                        sh *= scaledH / sh
                    }

                    return {
                        w: Math.ceil(sw)
                        , h: Math.ceil(sh),
                    }
                }

                function shouldUpdateScreen() {
                    return (
                    // NO if the user has disabled the screen.
                        $scope.$parent.showScreen &&
            // NO if we're not even using the device anymore.
            // $scope.device.using &&
            // NO if the page is not visible (e.g. background tab).
            !PageVisibilityService.hidden &&
            // NO if we don't have a connection yet.
            (ws && ws.readyState === WebSocket.OPEN)
            // YES otherwise
                    )
                }

                function checkEnabled(isReconnected) {
                    const newEnabled = shouldUpdateScreen()

                    if (newEnabled === cachedEnabled) {
                        updateBounds()
                        onScreenInterestGained()
                        // if (isReconnected) {
                        //   onScreenInterestGained()
                        // }
                    }
                    else if (newEnabled) {
                        updateBounds()
                        onScreenInterestGained()
                    }
                    else {
                        g.clearRect(0, 0, canvas.width, canvas.height)
                        onScreenInterestLost()
                    }

                    cachedEnabled = newEnabled
                }

                function onScreenInterestGained() {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send('size ' + adjustedBoundSize.w + 'x' + adjustedBoundSize.h)
                        ws.send('on')
                    }
                }

                function onScreenInterestAreaChanged() {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send('size ' + adjustedBoundSize.w + 'x' + adjustedBoundSize.h)
                    }
                }

                function onScreenInterestLost() {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send('off')
                    }
                }

                function applyQuirks(banner) {
                    alwaysUpright = banner.quirks.alwaysUpright
                    element.classList.toggle('quirk-always-upright', alwaysUpright)
                }

                function hasImageAreaChanged(img) {
                    return cachedScreen.bounds.w !== screen.bounds.w ||
            cachedScreen.bounds.h !== screen.bounds.h ||
            cachedImageWidth !== img.width ||
            cachedImageHeight !== img.height ||
            cachedScreen.rotation !== screen.rotation
                }

                function isRotated() {
                    return screen.rotation === 90 || screen.rotation === 270
                }

                function updateImageArea(img) {
                    if (!hasImageAreaChanged(img)) {
                        return
                    }

                    cachedImageWidth = img.width
                    cachedImageHeight = img.height

                    if (options.autoScaleForRetina) {
                        canvas.width = cachedImageWidth * frontBackRatio
                        canvas.height = cachedImageHeight * frontBackRatio
                        g.scale(frontBackRatio, frontBackRatio)
                    }
                    else {
                        canvas.width = cachedImageWidth
                        canvas.height = cachedImageHeight
                    }

                    cssRotation += rotator(cachedScreen.rotation, screen.rotation)
                    // canvas.style[cssTransform] = 'rotate(' + cssRotation + 'deg)'

                    cachedScreen.bounds.h = screen.bounds.h
                    cachedScreen.bounds.w = screen.bounds.w
                    cachedScreen.rotation = screen.rotation

                    canvasAspect = canvas.width / canvas.height
                    if (isRotated() && !alwaysUpright) {
                        canvasAspect = img.height / img.width
                        element.classList.add('rotated')
                    }
                    else {
                        canvasAspect = img.width / img.height
                        element.classList.remove('rotated')
                    }

                    // if (alwaysUpright) {
                    // If the screen image is always in upright position (but we
                    // still want the rotation animation), we need to cancel out
                    // the rotation by using another rotation.
                    // positioner.style[cssTransform] = 'rotate(' + -cssRotation + 'deg)'
                    // }

                    maybeFlipLetterbox()
                }

                function resizeListener() {
                    parentAspect = element.offsetWidth / element.offsetHeight
                    maybeFlipLetterbox()
                }

                function maybeFlipLetterbox() {
                    element.classList.toggle('letterboxed', parentAspect < canvasAspect)
                }
            }

            /**
       * KEYBOARD HANDLING
       *
       * This should be moved elsewhere, but due to shared dependencies and
       * elements it's currently here. So basically due to laziness.
       *
       * For now, try to keep the whole section as a separate unit as much
       * as possible.
       */
            function handleKeyboard() {
                const $input = angular.element(input)

                function isChangeCharsetKey(e) {
                    // Add any special key here for changing charset
                    // console.log('e', e)

                    // Chrome/Safari/Opera
                    if (
                    // Mac | Kinesis keyboard | Karabiner | Latin key, Kana key
                        e.keyCode === 0 && e.keyIdentifier === 'U+0010' ||

                        // Mac | MacBook Pro keyboard | Latin key, Kana key
          e.keyCode === 0 && e.keyIdentifier === 'U+0020' ||

                        // Win | Lenovo X230 keyboard | Alt+Latin key
          e.keyCode === 246 && e.keyIdentifier === 'U+00F6' ||

                        // Win | Lenovo X230 keyboard | Convert key
          e.keyCode === 28 && e.keyIdentifier === 'U+001C'
                    ) {
                        return true
                    }

                    // Firefox
                    switch (e.key) {
                    case 'Convert': // Windows | Convert key
                    case 'Alphanumeric': // Mac | Latin key
                    case 'RomanCharacters': // Windows/Mac | Latin key
                    case 'KanjiMode': // Windows/Mac | Kana key
                        return true
                    }

                    return false
                }

                function handleSpecialKeys(e) {
                    if (isChangeCharsetKey(e)) {
                        e.preventDefault()
                        $scope.control.keyPress('switch_charset')
                        return true
                    }

                    return false
                }

                function keydownListener(e) {
                    // Prevent tab from switching focus to the next element, we only want
                    // that to happen on the device side.
                    if (e.keyCode === 9) {
                        e.preventDefault()
                    }
                    $scope.control.keyDown(e.keyCode)
                }

                function keyupListener(e) {
                    if (!handleSpecialKeys(e)) {
                        $scope.control.keyUp(e.keyCode)
                    }
                }

                function pasteListener(e) {
                    // Prevent value change or the input event sees it. This way we get
                    // the real value instead of any "\n" -> " " conversions we might see
                    // in the input value.
                    e.preventDefault()
                    $scope.control.paste(e.clipboardData.getData('text/plain'))
                }

                function copyListener(e) {
                    e.preventDefault()
                    // This is asynchronous and by the time it returns we will no longer
                    // have access to setData(). In other words it doesn't work. Currently
                    // what happens is that on the first copy, it will attempt to fetch
                    // the clipboard contents. Only on the second copy will it actually
                    // copy that to the clipboard.
                    $scope.control.getClipboardContent()
                    if ($scope.control.clipboardContent) {
                        e.clipboardData.setData('text/plain', $scope.control.clipboardContent)
                    }
                }

                function inputListener() {
                    // Why use the input event if we don't let it handle pasting? The
                    // reason is that on latest Safari (Version 8.0 (10600.1.25)), if
                    // you use the "Romaji" Kotoeri input method, we'll never get any
                    // keypress events. It also causes us to lose the very first keypress
                    // on the page. Currently I'm not sure if we can fix that one.
                    $scope.control.type(this.value)
                    this.value = ''
                }

                $input.bind('keydown', keydownListener)
                $input.bind('keyup', keyupListener)
                $input.bind('input', inputListener)
                $input.bind('paste', pasteListener)
                $input.bind('copy', copyListener)
            }

            /**
       * TOUCH HANDLING
       *
       * This should be moved elsewhere, but due to shared dependencies and
       * elements it's currently here. So basically due to laziness.
       *
       * For now, try to keep the whole section as a separate unit as much
       * as possible.
       */
            function handleTouch() {
                let prevCoords = {}
                const slots = []
                const slotted = Object.create(null)
                const fingers = []
                let seq = -1
                const cycle = 100
                let fakePinch = false
                let lastPossiblyBuggyMouseUpEvent = 0

                function nextSeq() {
                    return ++seq >= cycle ? (seq = 0) : seq
                }

                function createSlots() {
                    // The reverse order is important because slots and fingers are in
                    // opposite sort order. Anyway don't change anything here unless
                    // you understand what it does and why.
                    for (let i = 9; i >= 0; --i) {
                        const finger = createFinger(i)

                        element.append(finger)
                        slots.push(i)
                        fingers.unshift(finger)
                    }
                }

                function activateFinger(index, x, y, pressure) {
                    const scale = 0.5 + pressure
                    const cssTranslate = `translate3d(${x}px,${y}px,0)`
                    const cssScale = `scale(${scale},${scale})`

                    fingers[index].classList.add('active')
                    fingers[index].style[cssTransform] = `${cssTranslate} ${cssScale})`
                }

                function deactivateFinger(index) {
                    fingers[index].classList.remove('active')
                }

                function deactivateFingers() {
                    for (let i = 0, l = fingers.length; i < l; ++i) {
                        fingers[i].classList.remove('active')
                    }
                }

                function createFinger(index) {
                    const el = document.createElement('span')

                    el.className = `finger finger-${index}`

                    return el
                }

                function calculateBounds() {
                    let el = element

                    screen.bounds.w = el.offsetWidth
                    screen.bounds.h = el.offsetHeight
                    screen.bounds.x = 0
                    screen.bounds.y = 0

                    while (el.offsetParent) {
                        screen.bounds.x += el.offsetLeft
                        screen.bounds.y += el.offsetTop
                        el = el.offsetParent
                    }
                }

                function mouseDownListener(event) {
                    let e = event

                    if (e.originalEvent) {
                        e = e.originalEvent
                    }
                    // Skip secondary click
                    if (e.which === 3) {
                        return
                    }
                    e.preventDefault()

                    fakePinch = e.altKey

                    calculateBounds()
                    startMousing()

                    const x = e.pageX - screen.bounds.x
                    const y = e.pageY - screen.bounds.y
                    const pressure = 0.5
                    const scaled = scaler.coords(
                        screen.bounds.w,
                        screen.bounds.h,
                        x,
                        y,
                        screen.rotation,
                        $scope.device.ios,
                    )

                    prevCoords = {
                        x: scaled.xP
                        , y: scaled.yP,
                    }

                    $scope.control.touchDown(nextSeq(), 0, scaled.xP, scaled.yP, pressure)
                    if (fakePinch) {
                        $scope.control.touchDown(nextSeq(), 1, 1 - scaled.xP, 1 - scaled.yP, pressure)
                    }

                    $scope.control.touchCommit(nextSeq())
                    activateFinger(0, x, y, pressure)

                    if (fakePinch) {
                        activateFinger(
                            1,
                            -e.pageX + screen.bounds.x + screen.bounds.w,
                            -e.pageY + screen.bounds.y + screen.bounds.h,
                            pressure
                        )
                    }

                    $element.bind('mousemove', mouseMoveListener)
                    $document.bind('mouseup', mouseUpListener)
                    $document.bind('mouseleave', mouseUpListener)

                    if (lastPossiblyBuggyMouseUpEvent &&
            lastPossiblyBuggyMouseUpEvent.timeStamp > e.timeStamp) {
                        // We got mouseup before mousedown. See mouseUpBugWorkaroundListener
                        // for details.
                        mouseUpListener(lastPossiblyBuggyMouseUpEvent)
                    }
                    else {
                        lastPossiblyBuggyMouseUpEvent = null
                    }
                }

                function mouseMoveListener(event) {
                    let e = event

                    if (e.originalEvent) {
                        e = e.originalEvent
                    }

                    // Skip secondary click
                    if (e.which === 3) {
                        return
                    }
                    e.preventDefault()

                    const addGhostFinger = !fakePinch && e.altKey
                    const deleteGhostFinger = fakePinch && !e.altKey

                    fakePinch = e.altKey

                    const x = e.pageX - screen.bounds.x
                    const y = e.pageY - screen.bounds.y
                    const pressure = 0.5
                    const scaled = scaler.coords(
                        screen.bounds.w,
                        screen.bounds.h,
                        x,
                        y,
                        screen.rotation,
                        $scope.device.ios,
                    )

                    $scope.control.touchMove(nextSeq(), 0, scaled.xP, scaled.yP, pressure)
                    // $scope.control.touchMoveIos(nextSeq(), 0, scaled.xP, scaled.yP, pressure)

                    if (addGhostFinger) {
                        // TODO: can be non boolean?
                        if ($scope.device.ios && $scope.device.ios === true) {
                            $scope.control.touchDownIos(nextSeq(), 1, 1 - scaled.xP, 1 - scaled.yP, pressure)
                        }
                        else {
                            $scope.control.touchDown(nextSeq(), 1, 1 - scaled.xP, 1 - scaled.yP, pressure)
                        }
                    }
                    else if (deleteGhostFinger) {
                        $scope.control.touchUp(nextSeq(), 1)
                    }
                    else if (fakePinch) {
                        $scope.control.touchMove(nextSeq(), 1, 1 - scaled.xP, 1 - scaled.yP, pressure)
                        // $scope.control.touchMoveIos(nextSeq(), 1, 1 - scaled.xP, 1 - scaled.yP, pressure)
                    }

                    $scope.control.touchCommit(nextSeq())
                    activateFinger(0, x, y, pressure)

                    if (deleteGhostFinger) {
                        deactivateFinger(1)
                    }
                    else if (fakePinch) {
                        activateFinger(
                            1,
                            -e.pageX + screen.bounds.x + screen.bounds.w,
                            -e.pageY + screen.bounds.y + screen.bounds.h,
                            pressure
                        )
                    }
                }

                function mouseUpListener(event) {
                    let e = event

                    if (e.originalEvent) {
                        e = e.originalEvent
                    }

                    // Skip secondary click
                    if (e.which === 3) {
                        return
                    }
                    e.preventDefault()

                    const x = e.pageX - screen.bounds.x
                    const y = e.pageY - screen.bounds.y
                    const pressure = 0.5
                    const scaled = scaler.coords(
                        screen.bounds.w,
                        screen.bounds.h,
                        x,
                        y,
                        screen.rotation,
                        $scope.device.ios,
                    )

                    if ((Math.abs(prevCoords.x - scaled.xP) >= 0.1 ||
            Math.abs(prevCoords.y - scaled.yP) >= 0.1) &&
            $scope.device.ios && $scope.device.ios === true) { // TODO: can be non boolean?
                        $scope.control.touchMoveIos(
                            scaled.xP,
                            scaled.yP,
                            prevCoords.x,
                            prevCoords.y,
                            pressure,
                            nextSeq(),
                            0
                        )
                    }

                    $scope.control.touchUp(nextSeq(), 0)

                    if (fakePinch) {
                        $scope.control.touchUp(nextSeq(), 1)
                    }

                    $scope.control.touchCommit(nextSeq())
                    deactivateFinger(0)

                    if (fakePinch) {
                        deactivateFinger(1)
                    }

                    stopMousing()
                }

                /**
         * Do NOT remove under any circumstances. Currently, in the latest
         * Safari (Version 8.0 (10600.1.25)), if an input field is focused
         * while we do a tap click on an MBP trackpad ("Tap to click" in
         * Settings), it sometimes causes the mouseup event to trigger before
         * the mousedown event (but event.timeStamp will be correct). It
         * doesn't happen in any other browser. The following minimal test
         * case triggers the same behavior (although less frequently). Keep
         * tapping and you'll eventually see see two mouseups in a row with
         * the same counter value followed by a mousedown with a new counter
         * value. Also, when the bug happens, the cursor in the input field
         * stops blinking. It may take up to 300 attempts to spot the bug on
         * a MacBook Pro (Retina, 15-inch, Mid 2014).
         *
         *     <!doctype html>
         *
         *     <div id="touchable"
         *       style="width: 100px; height: 100px; background: green"></div>
         *     <input id="focusable" type="text" />
         *
         *     <script>
         *     var touchable = document.getElementById('touchable')
         *       , focusable = document.getElementById('focusable')
         *       , counter = 0
         *
         *     function mousedownListener(e) {
         *       counter += 1
         *       console.log('mousedown', counter, e, e.timeStamp)
         *       e.preventDefault()
         *     }
         *
         *     function mouseupListener(e) {
         *       e.preventDefault()
         *       console.log('mouseup', counter, e, e.timeStamp)
         *       focusable.focus()
         *     }
         *
         *     touchable.addEventListener('mousedown', mousedownListener, false)
         *     touchable.addEventListener('mouseup', mouseupListener, false)
         *     </script>
         *
         * I believe that the bug is caused by some kind of a race condition
         * in Safari. Using a textarea or a focused contenteditable does not
         * get rid of the bug. The bug also happens if the text field is
         * focused manually by the user (not with .focus()).
         *
         * It also doesn't help if you .blur() before .focus().
         *
         * So basically we'll just have to store the event on mouseup and check
         * if we should do the browser's job in the mousedown handler.
         */
                function mouseUpBugWorkaroundListener(e) {
                    lastPossiblyBuggyMouseUpEvent = e
                }

                function startMousing() {
                    $scope.control.gestureStart(nextSeq())
                    input.focus()
                }

                function stopMousing() {
                    $element.unbind('mousemove', mouseMoveListener)
                    $document.unbind('mouseup', mouseUpListener)
                    $document.unbind('mouseleave', mouseUpListener)
                    deactivateFingers()
                    $scope.control.gestureStop(nextSeq())
                }

                function touchStartListener(event) {
                    let e = event
                    e.preventDefault()

                    // Make it jQuery compatible also
                    if (e.originalEvent) {
                        e = e.originalEvent
                    }

                    calculateBounds()

                    if (e.touches.length === e.changedTouches.length) {
                        startTouching()
                    }

                    const currentTouches = Object.create(null)

                    for (let i = 0, l = e.touches.length; i < l; ++i) {
                        currentTouches[e.touches[i].identifier] = 1
                    }

                    function maybeLostTouchEnd(id) {
                        return !(id in currentTouches)
                    }

                    // We might have lost a touchend event due to various edge cases
                    // (literally) such as dragging from the bottom of the screen so that
                    // the control center appears. If so, let's ask for a reset.
                    if (Object.keys(slotted).some(maybeLostTouchEnd)) {
                        Object.keys(slotted)
                            .forEach((id) => {
                                slots.push(slotted[id])
                                delete slotted[id]
                            })
                        slots.sort().reverse()
                        $scope.control.touchReset(nextSeq())
                        deactivateFingers()
                    }

                    if (!slots.length) {
                        // This should never happen but who knows...
                        throw new Error('Ran out of multitouch slots')
                    }

                    for (let i = 0, l = e.changedTouches.length; i < l; ++i) {
                        const touch = e.changedTouches[i]
                        const slot = slots.pop()
                        const x = touch.pageX - screen.bounds.x
                        const y = touch.pageY - screen.bounds.y
                        const pressure = touch.force || 0.5
                        const scaled = scaler.coords(
                            screen.bounds.w,
                            screen.bounds.h,
                            x,
                            y,
                            screen.rotation,
                            $scope.device.ios,
                        )

                        slotted[touch.identifier] = slot
                        if ($scope.device.ios && $scope.device.ios === true) { // TODO: can be non boolean?
                            $scope.control.touchDownIos(nextSeq(), slot, scaled.xP, scaled.yP, pressure)
                        }
                        else {
                            $scope.control.touchDown(nextSeq(), slot, scaled.xP, scaled.yP, pressure)
                        }
                        activateFinger(slot, x, y, pressure)
                    }

                    $element.bind('touchmove', touchMoveListener)
                    $document.bind('touchend', touchEndListener)
                    $document.bind('touchleave', touchEndListener)

                    $scope.control.touchCommit(nextSeq())
                }

                function touchMoveListener(event) {
                    let e = event
                    e.preventDefault()

                    if (e.originalEvent) {
                        e = e.originalEvent
                    }

                    for (let i = 0, l = e.changedTouches.length; i < l; ++i) {
                        const touch = e.changedTouches[i]
                        const slot = slotted[touch.identifier]
                        const x = touch.pageX - screen.bounds.x
                        const y = touch.pageY - screen.bounds.y
                        const pressure = touch.force || 0.5
                        const scaled = scaler.coords(
                            screen.bounds.w,
                            screen.bounds.h,
                            x,
                            y,
                            screen.rotation,
                            $scope.device.ios
                        )

                        $scope.control.touchMove(nextSeq(), slot, scaled.xP, scaled.yP, pressure)
                        // $scope.control.touchMoveIos(nextSeq(), slot, scaled.xP, scaled.yP, pressure)
                        activateFinger(slot, x, y, pressure)
                    }

                    $scope.control.touchCommit(nextSeq())
                }

                function touchEndListener(event) {
                    let e = event

                    if (e.originalEvent) {
                        e = e.originalEvent
                    }

                    let foundAny = false

                    for (let i = 0, l = e.changedTouches.length; i < l; ++i) {
                        const touch = e.changedTouches[i]
                        const slot = slotted[touch.identifier]

                        if (typeof slot === 'undefined') {
                            // We've already disposed of the contact. We may have gotten a
                            // touchend event for the same contact twice.
                            continue
                        }
                        delete slotted[touch.identifier]
                        slots.push(slot)
                        $scope.control.touchUp(nextSeq(), slot)
                        deactivateFinger(slot)
                        foundAny = true
                    }

                    if (foundAny) {
                        $scope.control.touchCommit(nextSeq())
                        if (!e.touches.length) {
                            stopTouching()
                        }
                    }
                }

                function startTouching() {
                    $scope.control.gestureStart(nextSeq())
                }

                function stopTouching() {
                    $element.unbind('touchmove', touchMoveListener)
                    $document.unbind('touchend', touchEndListener)
                    $document.unbind('touchleave', touchEndListener)
                    deactivateFingers()
                    $scope.control.gestureStop(nextSeq())
                }

                $element.on('touchstart', touchStartListener)
                $element.on('mousedown', mouseDownListener)
                $element.on('mouseup', mouseUpBugWorkaroundListener)

                createSlots()
            }
        }
    }
}
