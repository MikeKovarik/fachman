importScripts('../index.js')


// Utility wrapper for promisified setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve), millis)

self.addEventListener('message', e => {
	if (e.data === 'echo')
		self.postMessage('hello from worker')
})

self.on('custom-event', array => {
	array.pop()
	array.push('master')
	self.emit('custom-reply', array.join(' '))
})

self.on('kys', async () => {
	await timeout(300)
	self.close()
})

function echo(arg) {
	return arg
}

function modifyView(original) {
	var view = original
	if (view instanceof ArrayBuffer || view instanceof SharedArrayBuffer)
		view = new Uint8Array(original)
	view[9] = 107 // k
	view[10] = 33  // !
	return original
}

function modifyArray(array) {
	console.log('modifyArray', array)
	return array
}

function modifyString(string) {
	console.log('modifyAtring', string)
	return string
}

function syncHello(who = 'world') {
	return `hello ${who}`
}
async function asyncHello(who = 'world') {
	await timeout(200)
	return `hello ${who}`
}

var deeply = {
	nested: {
		syncHello: syncHello,
		asyncHello: asyncHello
	}
}

function add(a, b) {
	return a + b
}
async function compute(a, b) {
	await timeout(200)
	return add(a, b) * add(a, b)
}