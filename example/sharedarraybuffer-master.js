var {ProxyWorker} = fachman


var pw = new ProxyWorker('./sharedarraybuffer-worker.js', 1)

var circleSize = 20

function throttledResize() {
	pw.emit('resize', innerWidth - circleSize, innerHeight - circleSize)
}

// Get current window size and keep updating it (inside the worker) on change
var resizeTimeout
window.addEventListener('resize', e => {
	clearTimeout(resizeTimeout)
	resizeTimeout = setTimeout(throttledResize, 250)
})
throttledResize()

// Create share buffer we'll be using for rendering circle.
// 4 bytes = 32 bits = 2x 16bit value in Uint16Array view.
var sab = new SharedArrayBuffer(4)
// The Buffer holds data that are inaccessible directly from the buffer.
// For that we need to create view over the data hosted in buffer.
// And since the buffer is shared with worker, we can keep accessing it.
var view = new Uint16Array(sab)
// Send the buffer to worker by executing function within worker that accepts it.
pw.proxy.loadSharedArrayBuffer(sab)
// Start updating the values on buffer inside worker every 10 millis.
pw.proxy.startUpdatingValues(20)

var circle = document.querySelector('#circle')

// Kick off 60fps rendering independent from the worker thread updating vales.
requestAnimationFrame(onFrame)

function onFrame() {
	render(view[0], view[1])
	requestAnimationFrame(onFrame)
}

function render(x, y) {
	circle.style.transform = `translate3d(${x}px, ${y}px, 0)`
}