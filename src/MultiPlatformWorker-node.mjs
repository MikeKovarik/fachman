import {isMaster, isWorker, isNode, isBrowser, childDetectArg} from './platform.mjs'
import {EventEmitter} from './shims.mjs'
import {ChildProcess} from 'child_process'


var expo

if (isNode && !isWorker) {

	// Class that in its constructor does the same as child_process.spawn().
	// It's made to be inherited from.
	class SpawnedChildProcess extends ChildProcess {

		// constructor takes exactly the same arguments as child_process.spawn() but some of the type checks
		// were removed to keep it simple.
		// Example:
		// new SpawnedChildProcess(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		// is same as:
		// child_process.spawn(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		constructor(file, args = [], options = {}) {
			super()
			var envPairs = []
			var env = options.env || process.env
			for (var key in env)
				envPairs.push(key + '=' + env[key])
			args = [file, ...args]
			var params = Object.assign({file, args, envPairs}, options)
			params.windowsVerbatimArguments = !!params.windowsVerbatimArguments
			params.detached = !!params.detached
			this.spawn(params)
		}

	}


	// This class extends from ChildProcess instead of creating it using child_process.spawn
	// and monkey patching some methods afterwards.
	// Note: ChildProcess inherits from EventEmitter, so we've got .on() and .emit() covered
	class MultiPlatformWorker extends SpawnedChildProcess {

		constructor(workerPath, options = {}) {
			options.args = options.args || []
			// .spawn() arguments must include script file as a first item
			// and then we're adding custom argument to ask for in the worker to determine
			// if the process is master or worker.
			var args = [workerPath, ...options.args, childDetectArg]
			// Reroute stdin, stdout and stderr (0,1,2) to display logs in main process.
			// Then create IPC channel for meesage exchange and any ammount of separate streams for piping.
			var stdio = [0, 1, 2, 'ipc']
			var channelCount = options.streams || 0
			while (channelCount)
				stdio.push('pipe')
			// Spawn the process by extending parent class which does the same as cp.spawn()
			super(process.execPath, args, {stdio})
			//var child = cp.spawn(process.execPath, args, {stdio})

			/*
			this.once('SIGINT', function (code) {
				console.log('SIGINT received...')
				server.close()
			})

			this.once('SIGTERM', function (code) {
				console.log('SIGTERM received...')
				server.close()
			})
			*/

			this.on('error', err => {
				if (this.onerror) this.onerror(err)
			})

			this.on('message', data => {
				if (this.onmessage) this.onmessage({data})
			})

			this._listeners = new Map
		}
/*
		// Browser's Worker style alias for ChildProccess.kill()
		terminate() {
			// TODO: investigate if this implementation is enough
			this.kill('SIGINT')
			this.kill('SIGTERM')
			// Remove all active EE listeners to prevent memory leaks.
			this.removeAllListeners()
		}
*/
		// Browser's Worker style alias for ChildProccess.on('message', ...)
		addEventListener(name, listener) {
			if (name !== 'message') return
			var callback = data => listener({data})
			this.on('message', callback)
			this._listeners.set(listener, callback)
		}

		// Browser's Worker style alias for ChildProccess.removeListener('message', ...)
		removeEventListener(name, listener) {
			if (name !== 'message') return
			callback = this._listeners.get(listener)
			if (!callback) return
			this._listeners.delete(listener)
			this.removeListener('message', callback)
		}

	}

	let workerProto = MultiPlatformWorker.prototype

	// Browser's Worker style alias for ChildProccess.send()
	workerProto.postMessage = workerProto.send
	// Browser's Worker style alias for ChildProccess.kill()
	workerProto.terminate = workerProto.kill

	expo = MultiPlatformWorker
}

export default expo