import {MultiPlatformWorker} from './MultiPlatformWorker.mjs'
import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {createNestedProxy} from './nestedProxy.mjs'
import {defaultOptions} from './defaultOptions.mjs'



// Single worker class that uses ES Proxy to pass all requests (get accesses on the proxy)
// to the actual worker code, executes it there and waits for the woker to respond with result.
export class ProxyWorker extends MultiPlatformWorker {

	get runningTasks() {
		return this._runningTasks || 0
	}
	set runningTasks(newValue) {
		this._runningTasks = newValue
		// Emit current status locally to the EE and not to the thread.
		if (newValue === 0)
			this._emitLocally('idle')
		else
			this._emitLocally('running')
	}

	get running() {
		return this.runningTasks > 0
	}
	get idle() {
		return this.runningTasks === 0
	}

	constructor(workerPath, options = {}) {
		// Inline worker creation. NOTE: disabled for now 'cause it only works in browser and not in node
		//if (typeof workerPath === 'function')
		//	workerPath = stringifyFunction(workerPath)
		//else if (options.codeBlock === true || options.codeBlock === undefined && workerPath.length > 20)
		//	workerPath = createBlobUrl(workerPath)
		options = Object.assign({}, defaultOptions, options)
		if (options.type === undefined) {
			// Only works in browser for now
			if (workerPath.endsWith('.mjs'))
				options.type = 'module'
			else
				(options.args = options.args || []).push('--experimental-modules')
		}
		// We will open user worker script which will load this library.
		super(workerPath, options)
		// Apply options to this instance
		Object.assign(this, options)
		// Setup events and structures needed for creating tasks.
		// List of resolvers and rejectors of unfinished promises (ongoing requests)
		this._taskResolvers = new Map
		this.on('task-end', this._onTaskEnd.bind(this))
		this.once('exit', this._onExit.bind(this))
		// Creation of the proxy itself, intercepting calls to the proxy object
		// and passing them into the worker.
		this.invokeTask = this.invokeTask.bind(this)
		this.proxy = createNestedProxy({}, this.invokeTask)
	}

	_onExit(code) {
		if (code === 0) {
			// Task was closed gracefuly by either #terminate() or self.close() from within worker.
			this._taskResolvers.forEach(({reject}) => reject())
		} else {
			// Thread was abruptly killed. We might want to restart it and/or restart unfinished tasks.
			// Note: This should not be happening to browser Workers, but only to node child processes.
			// Note: Closed worker can't be restarted. Most online/exit/close handler use .once instead of .on,
			//       and the class inherits from MultiPlatformWorker and that inhreits from broswer Worker which
			//       can't be restarted (although ChildProcess might just need to call .spawn again).
		}
	}

	// Proxy get() handler.
	// Each called method and its arguments are turned into object describing the request
	// and is sent over to the worker where appropriate handler tries to find and call (invoke) the method
	// (by the name given by the proxy getter) with given arguments that the emulated method is called with.
	// Returns function (emulated method) which can be called with arguments as if the real mehod was called.
	// Promise is then returned and is resolved once given method in worker is found and finished
	invokeTask(task) {
		this.runningTasks++
		task = createTask(task)
		var {id, path, args, promise, resolvers} = task
		// Emit info about the task, most importantly, into the thread.
		this.emit('task-start', {id, path, args})
		this._taskResolvers.set(id, resolvers)
		return promise
	}

	// Handler of messages from inside of the worker.
	// We are only handling responses to called (invoked) method from within.
	// Resolver (or rejector) for given request ID is found and called with returned data (or error).
	_onTaskEnd({id, status, payload}) {
		if (!this._taskResolvers.has(id)) return
		var {resolve, reject} = this._taskResolvers.get(id)
		this._taskResolvers.delete(id)
		this.runningTasks--
		if (status === true) {
			// Execution ran ok and we a have a result.
			resolve(payload)
		} else if (status === false) {
			// Error occured but it had to be sent deconstructed.
			// Create empty Error shell and copy the actual error info into it.
			var err = new Error()
			err.name = payload.name
			err.message = payload.message
			err.stack = payload.stack
			reject(err)
		}
	}

}


// Accepts either empty object or preexisting task descruptor (object with 'name' and 'args')
// and enhances it with id, promise and resolvers for the promise.
export function createTask(task = {}) {
	if (task.promise) return task
	task.promise = new Promise((resolve, reject) => {
		task.resolvers = {resolve, reject}
	})
	task.id = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
	return task
}
