import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {EventEmitter} from './shims.mjs'


var expo

if (isBrowser && !isWorker) {

	// Extension of native webworker's Worker class and EventEmitter class
	// and few methods to loosely mimic Node's ChildProcess.
	class MultiPlatformWorker extends self.Worker {

		constructor(workerPath) {
			// Call constructor of Worker class to extends with its behavior
			super(workerPath)
			// Call constructor of EventEmitter class to extends with its behavior
			EventEmitter.call(this)

			this._onMessage = e => this.emit('message', e.data)
			this.addEventListener('message', this._onMessage)
		}

		// Kills worker thread and cancels all ongoing tasks
		// TODO: Investigatge sending 'imma kill you' message to worker and wait for its respomse
		//       to determine exit code
		terminate() {
			// Call native terminate() to kill the process
			super.terminate()
			// Emitting event 'exit' to make it similar to Node's childproc & cluster
			this.emitLocally('exit', 0)
			// Remove listeners to prevent memory leaks
			this.removeEventListener('message', this._onMessage)
		}

	}

	let WorkerProto = MultiPlatformWorker.prototype
	let EeProto = EventEmitter.prototype

	// Node's ChildProcess style alias for Worker.postMessage()
	WorkerProto.send = WorkerProto.postMessage
	// Node's ChildProcess style alias for Worker.terminate()
	WorkerProto.kill = WorkerProto.terminate

	// Extends MultiPlatformWoker's proto with EventEmitter methods manualy since its already
	// inheriting from Worker class and classes can have only one direct parent.
	let descriptors = Object.getOwnPropertyDescriptors(EventEmitter.prototype) 
	Object.keys(descriptors) 
		.filter(name => name !== 'constructor') 
		.forEach(key => WorkerProto[key] = EeProto[key]) 

	expo = MultiPlatformWorker
}

export default expo