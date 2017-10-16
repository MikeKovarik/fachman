import {isMaster, isBrowser} from './platform.mjs'
import {EventEmitter} from './EventEmitter.mjs'
import {shimNodeIpc, routeToEventEmitter} from './messaging.mjs'


export var BrowserWorker

if (isMaster && isBrowser) {

	// Extension of native webworker's Worker class and EventEmitter class
	// and few methods to loosely mimic Node's ChildProcess.
	BrowserWorker = class BrowserWorker extends self.Worker {

		constructor(workerPath, options = {}) {
			// Call constructor of Worker class to extends with its behavior
			super(workerPath, options)
			// Call constructor of EventEmitter class to extends with its behavior
			EventEmitter.call(this)

			// Array of callbacks to call, to remove listeners and prevent memory leaks, when the worker gets destroyed. 
			this._killbacks = []
			// Route self.addEventListener('message') messages into EventEmitter.on('message')
			routeToEventEmitter(this, this)
		}

		// Shim for Node's ChildProcess.kill()
		kill() {
			this.terminate()
		}

		// Kills worker thread and cancels all ongoing tasks
		// TODO: Investigatge sending 'imma kill you' message to worker and wait for its respomse
		//       to determine exit code
		terminate() {
			// Call native terminate() to kill the process
			super.terminate()
			// Emitting event 'exit' to make it similar to Node's childproc & cluster
			this._emitLocally('exit', 0)
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
