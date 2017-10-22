import {BrowserWorker} from './MultiPlatformWorker-browser.mjs'
import {NodeWorker} from './MultiPlatformWorker-node.mjs'
import {isBrowser, isNode, isMaster} from './platform.mjs'
import {EventEmitter} from './shim-events.mjs'
import {routeToThread} from './messaging.mjs'



export var MultiPlatformWorker

if (isMaster) {

	var Parent = BrowserWorker || NodeWorker

	// Subclassing native Worker or ChildProcess extension
	MultiPlatformWorker = class MultiPlatformWorker extends Parent {

		constructor(workerPath, options) {
			super(workerPath, options)
			// Node does not support transferables
			if (isNode)
				this.autoTransferArgs = false
			routeToThread(this, this)
		}

		// Kill the worker process/thread and cleanup after that
		terminate() {
			try {
				super.terminate()
			} catch(e) {}
			var timeout = setTimeout(() => this._destroy(), 3000)
			this.once('close', () => {
				clearTimeout(timeout)
				this._destroy()
			})
		}

		// Destroy all listeners immediately
		destroy() {
			try {
				super.terminate()
			} catch(e) {}
			// Destroy all listeners immediately
			this._destroy()
		}

		// Remove all active EventEmitter listeners to prevent memory leaks.
		_destroy() {
			this.removeAllListeners()
			this._killbacks.forEach(callback => callback())
			// TODO: remove all event listeners on both EventSource
			// TODO: hook this on 'exit' event. Note: be careful with exit codes and autorestart
		}

	}

} else {

	// Export noop to prevent breakage in worker environment, from where creating another worker doesn't make sense
	MultiPlatformWorker = class {}

}

