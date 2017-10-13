import events from 'events'
import cp from 'child_process'
import net from 'net'
import {isMaster, isWorker, isNode, isBrowser, childDetectArg} from './platform.mjs'
import {removeFromArray} from './util.mjs'
import {routeMessageEvents} from './messaging.mjs'


// polyfill 'global'
if (isBrowser && typeof global === 'undefined')
	self.global = self


export var EventEmitter

if (events) {

	// Hooray. we have either native or 3rd party EventEmitter at our disposal.
	EventEmitter = events.EventEmitter

} else {

	// Custom tiny EventEmitter sim so that we don't have to rely on 3rd party package if its not present.
	// Mainly in browser.
	// Note: using unshift() (and looping backwards) instead of push() to prevent
	//       issues with self-removing once() listeners
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
			var callbacks = this._getEventCallbacks(name)
			var i = callbacks.length
			while (i--) {
				callbacks[i](...args)
			}
		}

		on(name, cb) {
			this._getEventCallbacks(name).unshift(cb)
		}

		once(name, cb) {
			var oneTimeCb = (...args) => {
				this.removeListener(name, oneTimeCb)
				cb(...args)
			}
			this.on(name, oneTimeCb)
		}

		removeListener(name, cb) {
			removeFromArray(this._getEventCallbacks(name), cb)
		}

	}

}


// WebWorker native class or shim for node's spawn
export var Worker

if (isBrowser && !isWorker) {
	// Export native browser's Worker class
	Worker = self.Worker
}

if (isNode && !isWorker) {

	// Quick & dirty shim for browser's Worker API.
	// Note: the 'var' has to be there for it to become global var in this module's scope.
	Worker = function Worker(workerPath, options = {}) {
		options.args = options.args || []
		var args = [workerPath, ...options.args, childDetectArg]
		// Reroute stdin, stdout and stderr (0,1,2) to display logs in main process.
		// Then create IPC channel for meesage exchange and any ammount of separate streams for piping.
		var stdio = [0, 1, 2, 'ipc']
		var channelCount = options.streams || 0
		while (channelCount)
			stdio.push('pipe')

		var child = cp.spawn(process.execPath, args, {stdio})

		/*
		child.once('SIGINT', function (code) {
			console.log('SIGINT received...')
			server.close()
		})

		child.once('SIGTERM', function (code) {
			console.log('SIGTERM received...')
			server.close()
		})
		*/

		child.postMessage = function(message) {
			this.send(message)
		}

		child.terminate = function() {
			this.kill('SIGINT')
			this.kill('SIGTERM')
		}

		child.on('error', err => {
			if (child.onerror) child.onerror(err)
		})

		child.on('message', data => {
			if (child.onmessage) child.onmessage({data})
		})

		return child
	}

}


if (isBrowser && isWorker) {
	// Get or shim 'process' object used for ipc in child
	if (self.process === undefined)
		global.process = new EventEmitter

	// Hook into onmessage/postMessage() Worker messaging API and start serving messages through
	// shim of Node's 'process' and its .on()/.send()
	// TODO: Make autoTransferArgs configurable from within worker as well.
	//       For now it's hardcoded true (thus all worker data are transfered back to master)
	routeMessageEvents(process, self, true)
	// process.send is Node's IPC equivalent of Browser's postMesage()
	process.send = message => self.postMessage(message)

	// TODO: test if this is necessary (node's cluster worker fires this automatically)
	process.emit('online')

	// TODO: test if node can see termination of its child and only use this is browser.
	let originalClose = self.close.bind(self)
	// Create process.kill() and ovewrite close() in worker to notify parent about closing.
	process.kill = self.close = () => {
		// Notify master about impending end of the thread
		process.emit('exit', 0)
		// Kill the thread
		setTimeout(originalClose)
	}
}

// Quick & dirty shim for messaging API used within Worker.
if (isNode && isWorker) {
	// polyfill 'self'
	if (isNode && typeof self === 'undefined')
		global.self = global
	// Polyfill *EventListener and postMessage methods on 'self', for IPC as available in native WebWorkers
	self.addEventListener = process.on.bind(process)
	self.removeEventListener = process.removeListener.bind(process)
	self.postMessage = message => process.send(message)
	// Close method to kill Worker thread
	self.close = () => {
		process.exit(0)
	}
	// 
	self.importScripts = (...args) => {
		args.forEach(require)
	}
}


