var customImport = typeof self === 'object' ? importScripts : require
customImport('../index.js')



// helper variables
var isBrowser = typeof navigator === 'object'
var isNode = typeof process === 'object' && process.versions && process.versions.node

// Testing basic messaging/ipc and using it to test existence of available/defined properties and methods
;(() => {
	if (isBrowser) {
		self.addEventListener('message', e => onBasicTestingMessage(e.data))
		var reply = self.postMessage.bind(self)
	}
	if (isNode) {
		process.on('message', onBasicTestingMessage)
		var reply = process.send.bind(process)
	}
	function onBasicTestingMessage(data) {
		var {id} = data
		if (data.typeof) {
			reply({id, result: typeof walkPath(data.typeof)})
		}
	}
})()


// Utility wrapper for promisified setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis))

// WebWorker way of passing raw messages
self.addEventListener('message', ({data}) => {
	console.log('worker - ael ', data, data === 'hello-self')
	if (data === 'hello-self')
		self.postMessage('hello from self')
})
// Node IPC way of passing raw messages
process.on('message', data => {
	console.log('worker - proc', data, data === 'hello-process')
	if (data === 'hello-process')
		process.send('hello from process')
})
// Node like 

process.on('custom-event', array => {
	console.log('# custom-event', array)
	array.pop()
	array.push('master')
	process.emit('custom-reply', array.join(' '))
})

process.on('kys-close', async () => {
	await timeout(100)
	close()
})

process.on('kys-process-kill', async () => {
	await timeout(100)
	process.kill()
})

function walkPath(path, scope = self) {
	if (path.includes('.')) {
		var sections = path.split('.')
		var section
		while (section = sections.shift())
			scope = scope[section]
		return scope
	} else {
		return scope[path]
	}
}
function getTypeOf(path) {
	console.log('getTypeOf', path)
	return typeof walkPath(path)
}

function echo(arg) {
	return arg
}

async function asyncEcho(arg, millis = 100) {
	var now = Date.now()
	await timeout(millis)
	return arg
}

function syncHello(who = 'world') {
	return `hello ${who}`
}
async function asyncHello(who = 'world') {
	await timeout(100)
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
	await timeout(100)
	return add(a, b) * add(a, b)
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