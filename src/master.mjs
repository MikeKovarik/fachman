import {timeout, getCpuCores} from './util.mjs'
import {Worker, EventEmitter} from './shims.mjs'
import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {createNestedProxy} from './nestedProxy.mjs'
import {routeMessageEvents} from './messaging.mjs'
import {removeFromArray} from './util.mjs'


// Default setting is optimized for high intensity tasks and load ballancing
var defaultOptions = {
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
}

// The main hub controlling all the child workers
export class Cluster extends EventEmitter {

	get running() {
		return this.runningWorkers.size > 0
	}
	get idle() {
		return this.runningWorkers.size === 0
	}

	constructor(workerPath = 'worker.js', options) {
		super()
		// Apply default options.
		Object.assign(this, defaultOptions)
		// Process user's options and apply them too.
		if (typeof workerPath === 'object') {
			options = workerPath
		} else {
			options = typeof options === 'number' ? {threads: options} : options || {}
			options.workerPath = workerPath
		}
		Object.assign(this, options)
		// Get available core/thread count.
		if (!this.threads)
			this.threads = getCpuCores()
		// binding methods to this instance
		this.invokeTask = this.invokeTask.bind(this)
		this.emitLocally = this.emit.bind(this) // TODO
		// Create workers and supporting structures.
		this._createWorkers()
		// Create proxy for easy manipulation with APIs within workers.
		this.proxy = createNestedProxy({}, this.invokeTask)
	}

	// Executes the task in idle worker.
	_executeTask(task) {
		var wp = this.idleWorkers.values().next().value
		return wp.invokeTask(task)
	}

	// Forcefuly executes the task. Preferably in idle workers, otherwise in those with least concurrent tasks.
	_forceExecuteTask(task) {
		if (this.idleWorkers.size > 0)
			var wp = this.idleWorkers.values().next().value
		else
			var wp = Array.from(this.runningWorkers)
				.sort((a, b) => a.runningTasks - b.runningTasks)[0]
		return wp.invokeTask(task)
	}

	// Enqueues task that can't be executed right away.
	_enqueueTask(task) {
		var task = createTask(task)
		// Adding task to waiting queue.
		this.taskQueue.push(task)
		// Return the promise which will be resolved once task is taken
		// off the queue and invoked.
		return task.promise
	}

	invokeTask(task) {
		if (this.idleWorkers.size > 0) {
			// We have an idle worker so we can execute the task immediately.
			return this._executeTask(task)
		} else if (!this.canEnqueueTasks && this.runningWorkers.size > 0) {
			// No worker is idle, but queueing is not desired so we're executing the task in random worker.
			return this._forceExecuteTask(task)
		} else {
			// All workers are currently occupied.
			return this._enqueueTask(task)
		}
	}

	_createWorkers() {
		// List of ongoing tasks
		this.taskQueue = []
		// Pool of ProxyWorker instances
		this.workers = []
		this.idleWorkers = new Set
		this.runningWorkers = new Set
		this.ready = (async () => {
			// Wait to prevent blocking UI
			if (this.startupDelay > 0)
				await timeout(this.startupDelay)
			// Start up the workers
			await this._instantiateWorkers()
			if (!this.canEnqueueTasks && this.runningWorkers.size > 0) {
				// Queuing is disabled but some task are still queued because they were invoked
				// before this worker was created (this is the first time it's idle).
				// Dump all the tasks into the worker
				var task
				while (task = this.taskQueue.shift())
					this.forceExecuteTask(task)
			}
			await Promise.all(this.workers.map(w => w.ready))
		})()
	}

	async _instantiateWorkers() {
		for (var i = 0; i < this.threads; i++) {
			if (i > 0 && this.workerStartupDelay !== 0)
				await timeout(this.workerStartupDelay)
			let wp = new ProxyWorker(this.workerPath)
			wp.on('idle', () => this._onWorkerIdle(wp))
			wp.on('running', () => this._onWorkerRunning(wp))
			// Exposing info about close 
			wp.on('online', () => this._onWorkerOnline(wp))
			wp.on('exit', code => this._onWorkerExit(wp, code))
			this._onWorkerOnline(wp)
		}
	}

	_onWorkerOnline(wp) {
		// Worker was launched
		// Add worker to pool and idlePool
		if (!this.workers.includes(wp))
			this.workers.push(wp)
		this.idleWorkers.add(wp)
		// Similarly to Node cluster, each online worker event is exposed to the whole cluster
		this.emitLocally('online', wp)
		// Announce the worker as idle and let it start taking tasks in queue
		this._onWorkerIdle(wp)
	}

	_onWorkerIdle(wp) {
		if (this.taskQueue.length) {
			// Start invoking preexisting task from queue.
			var task = this.taskQueue.shift()
			// Invoke the task on worker that just freed up.
			wp.invokeTask(task)
		} else {
			var wasIdle = this.idle
			this.runningWorkers.delete(wp)
			this.idleWorkers.add(wp)
			// Emit 'idle' if we're done with all tasks (no workers are running)
			//if (this.runningWorkers.size === 0)
			if (!wasIdle && this.idle)
				this.emitLocally('idle')
		}
	}

	_onWorkerRunning(wp) {
		// Emit 'running' if we're started doing first task
		// (no workers were previously running)
		if (this.runningWorkers.size === 0)
			this.emitLocally('running')
		this.idleWorkers.delete(wp)
		this.runningWorkers.add(wp)
	}

	_onWorkerExit(wp) {
		// Worker died or was closed
		this.idleWorkers.delete(wp)
		this.runningWorkers.delete(wp)
		removeFromArray(this.workers, wp)
		// Similarly to Node cluster, each closed worker event is exposed to the whole cluster
		this.emitLocally('exit', wp)
	}

}



// Single worker class that uses ES Proxy to pass all requests (get accesses on the proxy)
// to the actual worker code, executes it there and waits for the woker to respond with result.
export class ProxyWorker extends EventEmitter {

	get runningTasks() {
		return this._runningTasks || 0
	}
	set runningTasks(newValue) {
		this._runningTasks = newValue
		// Emit current status locally to the EE and not to the thread.
		if (newValue === 0)
			this.emitLocally('idle')
		else
			this.emitLocally('running')
	}

	get running() {
		return this.runningTasks > 0
	}
	get idle() {
		return this.runningTasks === 0
	}

	constructor(workerPath, options) {
		super()
		// Apply options to this instance
		Object.assign(this, defaultOptions)
		if (workerPath)
			this.workerPath = workerPath
		// TODO: Apply user's options
		// Bind methods to each instance
		this.invokeTask = this.invokeTask.bind(this)
		this._onTaskEnd = this._onTaskEnd.bind(this)
		this._onExit = this._onExit.bind(this)
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
		// List of resolvers and rejectors of unfinished promises (ongoing requests)
		this._taskResolvers = new Map
		// we will open user worker script which will load this library
		this.worker = new Worker(this.workerPath)
		// Start handling messages comming from worker
		this.worker.onerror = e => {
			// todo: handle errors
			console.error('worker onerror', e)
			console.error(e)
		}
		// Process (resolve and/or expose) the the data
		routeMessageEvents(this, this.worker, this.autoTransferArgs)
		this.on('task-end', this._onTaskEnd)
		// Handle closing of the thread and 
		this.on('exit', this._onExit)
		// Creation of the proxy itself, intercepting calls to the proxy object
		// and passing them into the worker.
		this.proxy = createNestedProxy({}, this.invokeTask)
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

	// Kills worker thread and cancels all ongoing tasks
	terminate() {
		this.worker.terminate()
		// Emitting event 'exit' to make it similar to Node's childproc & cluster
		this.emitLocally('exit', 0)
	}

	// Alias for terminate(), mimicking Node ChildProccess API
	kill() {
		this.terminate()
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

	// Cleanup after terminate()
	destroy() {
		// TODO: remove all event listeners on both EventSource (Worker) and EventEmitter (this)
		// TODO: hook this on 'exit' event. Note: be careful with exit codes and autorestart
		// TODO: make this call terminate() if this method is called directly
		this.removeAllListeners()
	}

}


// Accepts either empty object or preexisting task descruptor (object with 'name' and 'args')
// and enhances it with id, promise and resolvers for the promise.
function createTask(task = {}) {
	if (task.promise) return task
	task.promise = new Promise((resolve, reject) => {
		task.resolvers = {resolve, reject}
	})
	task.id = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
	return task
}
