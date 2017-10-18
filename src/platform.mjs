// is true if it's the main UI thread in browser, or main thread in Node
export var isMaster = false

// is true it it's a WebWorker or a child spawned by Node master process.
export var isWorker = false

// is true when native Node apis are available.
export var isNode = false

// is true when browser renderer with native Worker api is available.
export var isBrowser = false

if (typeof process === 'object' && process.versions.node) {
	isNode = true
	isMaster = process.send === undefined
	isWorker = !isMaster
}

if (typeof navigator === 'object') {
	isBrowser = true
	if (typeof importScripts === 'function')
		isWorker = true
	else if (typeof document === 'object')
		isMaster = true
}
