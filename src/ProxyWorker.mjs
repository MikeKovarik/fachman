import {MultiPlatformWorker} from './MultiPlatformWorker.mjs'
import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {createNestedProxy} from './nestedProxy.mjs'


// Default setting is optimized for high intensity tasks and load ballancing
export var defaultOptions = {
	// By default each worker is executing only one task at a time. If more tasks are invoked
	// than there are available worker threads, the new tasks will be queued and waiting for
	// some preceeding task to finish, resulting in maximum utilization (load ballancing), because
	// the task will be executed on the next free worker. It's ideal for cpu intensive tasks,
	// but won't work well with not so intensive tasks that maybe incorporate timers, or wait
	// for something. In such cache the worker is waiting for task that isn't doing much, while blocking
	// queued tasks which could be running in parallel.
	canEnqueueTasks: false,
	// Workers are being loaded synchronously with the UI thread. This leads to noticeable
	// slowdown if large ammount of workers are started immediately alongside the main UI thread.
	// Test: 4 core i7 with hyperthreding, resulting in 8 workers, causes about 2 second slowdown.
	startupDelay: 100,
	// Spacing between creation of each worker.
	workerStartupDelay: 0,
	// TODO
	autoTransferArgs: true,
	// TODO
	autoWrapWorker: true,
	// TODO
}

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
		// We will open user worker script which will load this library.
		if (options.type === undefined) {
			// Only works in browser for now
			if (workerPath.endsWith('.mjs'))
				options.type = 'module'
			else
				(options.args = options.args || []).push('--experimental-modules')
		}
		super(workerPath, options)
		//this.worker = new MultiPlatformWorker(this.workerPath, isNode ? options : undefined, {type: 'module'})
		// Apply options to this instance
		Object.assign(this, defaultOptions)
		// TODO: Apply user's options
		this._setupLifecycle()
		this._setupTasks()
		// Creation of the proxy itself, intercepting calls to the proxy object
		// and passing them into the worker.
		this.invokeTask = this.invokeTask.bind(this)
		this.proxy = createNestedProxy({}, this.invokeTask)
	}

	_setupLifecycle() {
		// The worker starts off as offline
		this.online = false
		// Creating ready promise which resolves after first 'online' event, when worker is ready
		this.ready = new Promise(resolve => {
			// Warning: Don't try to wrap this into chaining promise. Worker loads synchronously
			//          and synchronous EventEmitter callbacks would race each other over async Promise.
			this.once('online', () => {
				this.online = true
				resolve()
			})
		})
		// Handle closing of the thread and 
		this._onExit = this._onExit.bind(this)
		this.on('exit', this._onExit)
	}

	_onExit(code) {
		if (code === 0) {
			// Task was closed gracefuly by either #terminate() or self.close() from within worker.
			this._taskResolvers.forEach(({reject}) => reject())
		} else {
			// Thread was abruptly killed. We might want to restart it and/or restart unfinished tasks.
			// Note: This should not be happening to browser Workers, but only to node child processes.
		}
		this.online = false
	}

	_setupTasks() {
		// List of resolvers and rejectors of unfinished promises (ongoing requests)
		this._taskResolvers = new Map
		this._onTaskEnd = this._onTaskEnd.bind(this)
		this.on('task-end', this._onTaskEnd)
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
