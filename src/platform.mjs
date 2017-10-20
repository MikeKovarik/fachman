import path, {getCwd} from './shim-path.mjs'


// is true if it's the main UI thread in browser, or main thread in Node
export var isMaster = false

// is true it it's a WebWorker or a child spawned by Node master process.
export var isWorker = false

// is true when native Node apis are available.
export var isNode = false

// is true when browser renderer with native Worker api is available.
export var isBrowser = false

if (typeof process === 'object' && process.versions.node && process.argv.length) {
	isNode = true
	// master/worker detection relies on IPC connection between processes.
	isMaster = process.send === undefined && process.connected === undefined
	isWorker = !isMaster
}


if (typeof navigator === 'object') {
	isBrowser = true
	if (typeof importScripts === 'function') {
		isWorker = true
	}
	else if (typeof document === 'object') {
		isMaster = true
	}
}


// Only available in node (browser's alternative is constructing blob url wrapper)
export var launchedAsWrapper = false
if (isNode) {
	// This very script 'fachman' has been spawned as a child process (second argument equals __filename).
	// That means this is a worker thread and wrapping user scripts for easier context accessing is enabled.
	// Now we need to execute (by requiring) user's script he initially wanted to launch in the worker.
	var scriptPath = process.argv[1]
	if (scriptPath === __filename) {
		process.argv.splice(1,1)
		launchedAsWrapper = true
	}
}

export var fachmanPath


function sanitizePath(path) {
	return path.replace(/\\/g, '/')
}

function getModuleIndexPath() {
	if (typeof __filename === 'undefined')
		return document.currentScript.src
	// TODO: handle unbundled ESM version where __filename === 'src/platform.mjs' instead of 'index.mjs/js'
	//else if ()
	//	return __filename
	else
		return __filename
}

if (isMaster) {
	// Absolute path to the fachman script file. Sanitize the path.
	fachmanPath = sanitizePath(getModuleIndexPath())
	// Get current location of the app that imports fachman
	var cwd = sanitizePath(getCwd() + '/')
}

// https://github.com/nodejs/node-eps/blob/master/002-es-modules.md#451-environment-variables
export var supportsNativeModules = typeof module === 'undefined'
								&& typeof exports === 'undefined'
								&& typeof require === 'undefined'
								//&& typeof __filename === 'undefined'

// Modules support in workers is a ways off for now.
export var supportsWorkerModules = false
/*
if (isBrowser) {
	var detectionPromise = new Promise((resolve, reject) => {
		var code = `self.postMessage(typeof importScripts)`
		code = createBlobUrl(code)
		var dummy = new Worker(code, {type: 'module'})
		dummy.onmessage = function({data}) {
			supportsWorkerModules = data === 'undefined'
			dummy.terminate()
		}
		dummy.onerror = err => {
			reject(err)
			dummy.terminate()
		}
	})
}
*/