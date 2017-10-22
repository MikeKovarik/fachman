/*
if (typeof require === 'function')
	require('../index.js')
else
	importScripts('../index.js')
*/


// helper variables
var isBrowser = typeof navigator === 'object'
var isNode = typeof process === 'object' && process.versions && process.versions.node

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
	switch (data.typeof) {
		case 'self':
			reply({id, result: typeof self})
			break
		case 'process':
			reply({id, result: typeof process})
			break
		case 'global':
			reply({id, result: typeof global})
			break
		case 'module':
			reply({id, result: typeof module})
			break
		case 'exports':
			reply({id, result: typeof exports})
			break
		case 'require':
			reply({id, result: typeof require})
			break
		case 'importScripts':
			reply({id, result: typeof importScripts})
			break
		default:
			reply({id, result: typeof walkPath(data.typeof)})
	}
}

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