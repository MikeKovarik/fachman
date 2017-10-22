if (typeof require === 'function')
	require('../index.js')
else
	importScripts('../index.js')


// helper variables
var isBrowser = typeof navigator === 'object'
var isNode = typeof process === 'object' && process.versions && process.versions.node
/*
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
*/

// WebWorker way of passing raw messages
self.addEventListener('message', ({data}) => {
	if (data === 'hello-self')
		self.postMessage('hello from self')
})
// Node IPC way of passing raw messages
process.on('message', data => {
	if (data === 'hello-process')
		process.send('hello from process')
})
// Node like 

process.on('custom-event', array => {
	array.pop()
	array.push('master')
	process.emit('custom-reply', array.join(' '))
})