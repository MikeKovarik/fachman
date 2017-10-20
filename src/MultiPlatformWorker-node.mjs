import path from 'path'
import {isMaster, isNode, fachmanPath, supportsNativeModules} from './platform.mjs'
import {EventEmitter} from './EventEmitter.mjs'
import {ChildProcess} from 'child_process'
import {shimBrowserIpc, routeToEventSource} from './messaging.mjs'


export var NodeWorker

if (isMaster && isNode) {

	// Class that in its constructor does the same as child_process.spawn().
	// It's made to be inherited from.
	class SpawnedChildProcess extends ChildProcess {

		// constructor takes exactly the same arguments as child_process.spawn() but some of the type checks
		// were removed to keep it simple.
		// Example:
		// new SpawnedChildProcess(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		// is same as:
		// child_process.spawn(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		constructor(nodePath, args = [], options = {}) {
			// ChildProcess constructor doesn't take any arugments. But later on it's initialized with .spawn() method.
			super()
			if (options.autoWrapWorker !== false) {
				var fachmanDir = path.dirname(fachmanPath)
				// If the user script file has .mjs ending (singaling it's written as ES Module) and Node has native support
				// then import unbundled ES Module version of fachman.
				var wrapperExt = options.type === 'module' && supportsNativeModules ? 'mjs' : 'js'
				var wrapperName = `index.${wrapperExt}`
				// Point to the wrapper file in the root of the fachman folder (next to index).
				// The path can be absolute because node would do that to relative paths as well.
				var wrapperPath = path.join(fachmanDir, wrapperName)
				// User's (NodeWorker in this case) defines his script to launch as a first argument.
				var userScriptRelPath = args.shift()
				userScriptRelPath = path.relative(fachmanDir, userScriptRelPath)
				// Prepend args with path to user script and our wrapper that will run fachman and the script.
				args = [wrapperPath, userScriptRelPath, ...args]
			}
			args = [nodePath, ...args]
			var file = nodePath
			// Create the basics needed for creating a pocess. It basically does all that child_process.spawn() does internally.
			var envPairs = []
			var env = options.env || process.env
			for (var key in env)
				envPairs.push(key + '=' + env[key])
			var params = Object.assign({file, args, envPairs}, options)
			params.windowsVerbatimArguments = !!params.windowsVerbatimArguments
			params.detached = !!params.detached
			this.spawn(params)
		}

	}


	// This class extends from ChildProcess instead of creating it using child_process.spawn
	// and monkey patching some methods afterwards.
	// Note: ChildProcess inherits from EventEmitter, so we've got .on() and .emit() covered
	NodeWorker = class NodeWorker extends SpawnedChildProcess {

		constructor(workerPath, options = {}) {
			options.args = options.args || []
			// .spawn() arguments must include script file as a first item
			// and then we're adding custom argument to ask for in the worker to determine
			// if the process is master or worker.
			var args = [workerPath, ...options.args]
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
				// Tigger Browser's Worker style API
				if (this.onerror) this.onerror(err)
			})

			this.on('message', data => {
				// Tigger Browser's Worker style API
				if (this.onmessage) this.onmessage({data})
			})

			// Array of callbacks to call, to remove listeners and prevent memory leaks, when the worker gets destroyed. 
			this._killbacks = []
		}

		// Browser's Worker style alias for ChildProccess.kill()
		terminate() {
			//this.kill(0)
			this.kill()
			// TODO: investigate if this implementation is enough
			//this.kill('SIGINT')
			//this.kill('SIGTERM')
		}

	}

	shimBrowserIpc(NodeWorker.prototype)
	// Create shim of browser's EventSource methods and add them to EventEmitter
	routeToEventSource(NodeWorker.prototype)
	//NodeWorker.prototype.addEventListener = addEventListener
	//NodeWorker.prototype.removeEventListener = removeEventListener
	//NodeWorker.prototype.postMessage = postMessage

}
