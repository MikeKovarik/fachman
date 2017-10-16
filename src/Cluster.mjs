import {timeout, MAX_THREADS, removeFromArray} from './util.mjs'
import {EventEmitter} from './EventEmitter.mjs'
import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {createNestedProxy} from './nestedProxy.mjs'
import {defaultOptions, createTask} from './ProxyWorker.mjs'


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
			this.threads = MAX_THREADS
		// binding methods to this instance
		this.invokeTask = this.invokeTask.bind(this)
		this._emitLocally = this.emit.bind(this) // TODO
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
		this._emitLocally('online', wp)
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
				this._emitLocally('idle')
		}
	}

	_onWorkerRunning(wp) {
		// Emit 'running' if we're started doing first task
		// (no workers were previously running)
		if (this.runningWorkers.size === 0)
			this._emitLocally('running')
		this.idleWorkers.delete(wp)
		this.runningWorkers.add(wp)
	}

	_onWorkerExit(wp) {
		// Worker died or was closed
		this.idleWorkers.delete(wp)
		this.runningWorkers.delete(wp)
		removeFromArray(this.workers, wp)
		// Similarly to Node cluster, each closed worker event is exposed to the whole cluster
		this._emitLocally('exit', wp)
	}

}