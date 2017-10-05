import events from 'events'
import child_process from 'child_process'
import net from 'net'
import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'


// polyfill 'self'
if (isNode && typeof self === 'undefined')
	global.self = global


// Custom tiny EventEmitter sim so that we don't have to rely on 3rd party package if its not present.
// Mainly in browser.
export var EventEmitter

if (events) {

	// Hooray. we have either native or 3rd party EventEmitter at our disposal.
	EventEmitter = events.EventEmitter

} else {

	// Resorting to our custom shim.
	EventEmitter = class EventEmitter {

		constructor() {
			this._map = new Map
		}

		_getEventCallbacks(name) {
			if (!this._map.has(name))
				this._map.set(name, [])
			return this._map.get(name)
		}

		emit(name, ...args) {
			this._getEventCallbacks(name).forEach(cb => cb(...args))
		}

		on(name, cb) {
			this._getEventCallbacks(name).push(cb)
		}

	}

}


// WebWorker native class or shim for node's spawn
export var Worker

if (isBrowser) {

	Worker = self.Worker

} else if (isNode) {

	class BufferBasedMessenger extends EventEmitter {

		constructor(pipe) {
			super()
			if (pipe) {
				this.thePipe = pipe
				// if we have the pipe, we can start setting the pipe right away
				this._create()
			}
		}

		_create() {
			this.addEventListener = this.on.bind(this)
			this.removeEventListener = this.removeListener.bind(this)
			// listen on data from master pipe, convert and expose them as 'message' event
			this.thePipe.on('data', data => this._onBuffer(data))
			// todo. handle errors
			// todo. handle close event
		}

		_onBuffer(buffer) {
			var data = JSON.parse(buffer.toString())
			var message = {data}
			// Note: the data in Workers API (and all browser events using addEventListener)
			// are stored in 'data' property of the event
			this.emit('message', message)
			if (this.onmessage)
				this.onmessage(message)
		}

		// this will always only receive 'message' events
		postMessage(message) {
			var json = JSON.stringify(message)
			this.thePipe.write(json)
		}

	}

	// Quick & dirty shim for browser's Worker API.
	// Note: the 'var' has to be there for it to become global var in this module's scope.
	Worker = class Worker extends BufferBasedMessenger {

		constructor(workerPath) {
			super()
			var args = [workerPath, childIdentifyArg]
			// Reoute stdin, stdout and stderr to master and create separate fourth
			// pipe for master-worker data exchange
			var options = {
				stdio: [0, 1, 2, 'pipe']
			}
			this.proc = child_process.spawn(process.execPath, args, options)
			// The data pipe is fourth stream (id 3)
			this.thePipe = this.proc.stdio[3]
			// Manually starting the setup of pipe communication (handler by parent class)
			this._create()
			/*
			process.once('SIGINT', function (code) {
				console.log('SIGINT received...')
				server.close()
			})

			process.once('SIGTERM', function (code) {
				console.log('SIGTERM received...')
				server.close()
			})
			*/
		}

		terminate() {
			this.proc.kill('SIGINT')
			this.proc.kill('SIGTERM')
		}

	}

	// Quick & dirty shim for messaging API used within Worker.
	if (isWorker) {
		// Connect to the master data pipe (id 3)
		var masterPipe = new net.Socket({fd: 3})
		var messenger = new BufferBasedMessenger(masterPipe)
		self.addEventListener = messenger.addEventListener
		self.removeEventListener = messenger.removeEventListener
		self.postMessage = messenger.postMessage.bind(messenger)
		self.close = () => {
			console.log('TODO: not implemented. close worker')
			process.exit(0)
		}
	}

}


