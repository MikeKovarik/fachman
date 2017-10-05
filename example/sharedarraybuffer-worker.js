importScripts('../index.js')


var maxWidth
var maxHeight

var sab
var view

var xIncrement = true
var yIncrement = true

function loadSharedArrayBuffer(_sab) {
	sab = _sab
	// Using 2 bytes (16 bits) per value so we can use values between 0-‭65535‬
	// instead of just 0-255 with 1byte (8bits).
	view = new Uint16Array(sab)
}

var interval

function startUpdatingValues(millis = 10) {
	// update values (every 10 millis by default)
	interval = setInterval(updateValues, millis)
}

function stopUpdatingValues() {
	clearInterval(interval)
}

function updateValues() {
	var x = view[0]
	var y = view[1]
	x = xIncrement ? ++x : --x
	y = yIncrement ? ++y : --y
	if (x > maxWidth) {
		xIncrement = false
		x = maxWidth
	} else if (x < 0) {
		xIncrement = true
		x = 0
	}
	if (y > maxHeight) {
		yIncrement = false
		y = maxHeight
	} else if (y < 0) {
		yIncrement = true
		y = 0
	}
	view[0] = x
	view[1] = y
}

function onResize(width, height) {
	console.log('WORKER RESIZE')
	maxWidth = width
	maxHeight = height
}

self.on('resize', onResize)