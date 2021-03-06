import {isMaster, isBrowser, supportsWorkerModules} from './platform.mjs'
import {EventEmitter} from './shim-events.mjs'
import {shimNodeIpc, routeToEventEmitter} from './messaging.mjs'
import {fachmanPath} from './platform.mjs'
import path from './shim-path.mjs'
import {getBlobUrl} from './construct-wrapper.mjs'



export var BrowserWorker

if (isMaster && isBrowser) {

	// Extension of native webworker's Worker class and EventEmitter class
	// and few methods to loosely mimic Node's ChildProcess.
	BrowserWorker = class BrowserWorker extends self.Worker {

		constructor(workerPath, options = {}) {
			if (options.autoWrapWorker !== false) {
				// Get or create standard custom wrapper for given worker.
				// The code will import fachman and then the desired worker. 
				var blobUrl = getBlobUrl(options.type === 'module')
				super(blobUrl, options)
				// Convert worker path into absolute path
				if (!workerPath.includes('://'))
					workerPath = path.join(process.cwd(), workerPath)
				// Relative URLs can't be used in blob workers because those have 'blob:' prefix.
				// The blob wrapper we made earlier listens for message with fachman and actual worker path.
				// Once that's received, the worker imports scripts and self-destructs the message and listener.
				this.postMessage({fachmanPath, workerPath})
			} else {
				// Call constructor of Worker class to extends with its behavior
				super(workerPath, options)
			}
			//this.addEventListener('error', err => console.error(err))
			// Call constructor of EventEmitter class to extends with its behavior
			EventEmitter.call(this)
			// Following properties are here to mimic Node's ChildProcess.
			// Thread starts off without exit codes that will be assigned once it exits.
			this.signalCode = null
			this.exitCode = null
			this.killed = false
			// Listening to 'exit' event rather than assigning it in terminate() because the thread could end on its own with custom code.
			this.on('exit', (code, signal) => {
				this.exitCode = code
				this.signalCode = signal
			})
			// Worker is launched synchronously (or the messages wait at least) so we can just assign it like this.
			this.connected = true
			// Path to the file
			this.spawnfile = workerPath


			// Array of callbacks to call, to remove listeners and prevent memory leaks, when the worker gets destroyed. 
			this._killbacks = []
			// Route self.addEventListener('message') messages into EventEmitter.on('message')
			routeToEventEmitter(this, this)
		}

		// Shim for Node's ChildProcess.kill()
		kill(signal) {
			this.terminate(signal)
		}

		// Kills worker thread and cancels all ongoing tasks
		// TODO: Investigatge sending 'imma kill you' message to worker and wait for its respomse
		//       to determine exit code
		terminate(signal = 'SIGTERM') {
			if (signal !== 'SIGTERM') {
				// TODO: postMessage the code to the process and give it some time to finish
				//       if that's what node does - INVESTIGATE
			}
			// Call native terminate() to kill the process
			super.terminate()
			// Browser mercilessly kills the worker thread on sight.
			this.killed = true
			// Set connected to false and emit 'disconnect' to stay in parity with Node's ChildProcess.
			this.disconnect()
			// Exit code is null instead of 0 because the process didn't end/exit itself but was closed externally.
			this._emitLocally('exit', null, signal)
			this._emitLocally('close', null, signal)
		}

		// Rough approximation of Node's ChildProcess.disconnect().
		// NOTE: it does not do fancy handling of pending messages like Node does.
		disconnect() {
			this.connected = false
			// Emitting event 'disconnect', 'exit' and finally 'close' to make it similar to Node's childproc & cluster
			this._emitLocally('disconnect')
		}

	}

	let WorkerProto = BrowserWorker.prototype
	let EeProto = EventEmitter.prototype

	// Shim for Node's ChildProcess.send(), an alias for Worker.postMessage()
	shimNodeIpc(WorkerProto)

	// Extends MultiPlatformWoker's proto with EventEmitter methods manualy since its already
	// inheriting from Worker class and classes can have only one direct parent.
	let descriptors = Object.getOwnPropertyDescriptors(EventEmitter.prototype)
	Object.keys(descriptors)
		.filter(name => name !== 'constructor')
		.forEach(key => WorkerProto[key] = EeProto[key])

}

/*
function stringifyFunction(fn) {
	var string = fn.toString()
	if (string.startsWith('[') && string.endsWith(']'))
		throw new Error('function or object given to ProxyWorker cannot be stringified')
	return createBlobUrl(string)
}
*/