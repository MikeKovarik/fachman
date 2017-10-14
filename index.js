(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('events'), require('net'), require('os'), require('child_process')) :
	typeof define === 'function' && define.amd ? define(['exports', 'events', 'net', 'os', 'child_process'], factory) :
	(factory((global.fachman = {}),global.events,global.net,global.os,global.child_process));
}(this, (function (exports,events,net,os,child_process) { 'use strict';

events = events && events.hasOwnProperty('default') ? events['default'] : events;
net = net && net.hasOwnProperty('default') ? net['default'] : net;
os = os && os.hasOwnProperty('default') ? os['default'] : os;

var childDetectArg = 'is-child-worker';


// is true if it's the main UI thread in browser, or main thread in Node
exports.isMaster = false;

// is true it it's a WebWorker or a child spawned by Node master process.
exports.isWorker = false;

// is true when native Node apis are available.
exports.isNode = false;

// is true when browser renderer with native Worker api is available.
exports.isBrowser = false;

if (typeof process === 'object' && process.versions.node) {
	exports.isNode = true;
	if (process.argv.includes(childDetectArg)) {
		process.argv = process.argv.slice(0, -1);
		exports.isWorker = true;
	} else {
		exports.isMaster = true;
	}
}

if (typeof navigator === 'object') {
	exports.isBrowser = true;
	if (typeof importScripts === 'function')
		exports.isWorker = true;
	else if (typeof document === 'object')
		exports.isMaster = true;
}

var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis));

exports.MAX_THREADS = 0;
if (exports.isNode)
	exports.MAX_THREADS = os.cpus().length || 1;
else
	exports.MAX_THREADS = navigator.hardwareConcurrency || 1;

function removeFromArray(array, item) {
	var index = array.indexOf(item);
	if (index !== -1)
		array.splice(index, 1);
}

function routeMessageEvents(eEmitter, eSource, transferArgs = true) {

	if (exports.isNode)
		transferArgs = false;

	// Only circulates the event inside EventEmitter and does not passes it to EventSource
	eEmitter.emitLocally = eEmitter.emit.bind(eEmitter);
	// TODO: use addEventListener instead and carefuly handle memory leaks (remove listeners)
	//       (mainly in master, when the worker closes)

	// Only hands the event over to EventSource as 'message' event
	eEmitter.emitToThread = (event, ...args) => {
		var transferables = undefined;
		if (transferArgs)
			transferables = getTransferablesDeepTraversal(args);
		eSource.postMessage({event, args}, transferables);
	};

	// Circulates the event within EventEmitter as usual and also routes it into EventSource.
	eEmitter.emit = (event, ...args) => {
		eEmitter.emitLocally(event, ...args);
		eEmitter.emitToThread(event, ...args);
	};

	// Handles receiving 'message' events from EventSource and routes them into EventEmitter
	//eSource.addEventListener('message', onCrossThreadMessage)
	eSource.onmessage = ({data}) => {
		// Although we're only sending object with data property, we have to handle (and ignore) everything
		// that potentially gets sent from outside of this module.
		if (data.event)
			eEmitter.emitLocally(data.event, ...data.args);
		else
			eEmitter.emitLocally('message', data);
		// Hand the raw message over to onmessage property to align with Worker API
		if (eEmitter.onmessage)
			eEmitter.onmessage({data});
	};

}

// Only ArrayBuffer, MessagePort and ImageBitmap types are transferable.
// Very naive and probably even expensive way of finding all transferables.
// TODO: Better heuristic of determining what's transferable
// TODO: More efficient traversal
// TODO: wrap or convert arguments into arraybuffer so that they can be transfered
// TODO: figure out a way to unwrap and revive converted data into their original structure
// TODO: Keep current structure behind option (something like autoTransferTraverse) and let the default be
//       - args of emitted events => message.args
//       - args of invoked functions => message.args.args
//       - payload of resolved functions => message.args.payload

// Expects any type of input argument. Traverses deeper if it's array of object.
// Returns undefined, transferable or an array of transferables
function getTransferablesDeepTraversal(arg) {
	if (isTransferable(arg)) {
		return arg
	} else if (isModifiableForTransfer(arg)) {
		return arg.buffer
	} if (Array.isArray(arg)) {
		if (arg.length === 0 || isPrimitiveArray(arg))
			return
		var array = arg.map(getTransferablesDeepTraversal).filter(a => a);
		var flattened = flatten(array);
		if (flattened.length)
			return flattened
	} else if (typeof arg === 'object' && arg !== null) {
		return getTransferablesDeepTraversal(Object.keys(arg).map(key => arg[key]))
	}
}

function flatten(array) {
	let item;
	for (var i = 0; i < array.length; i++) {
		item = array[i];
		if (!Array.isArray(item)) continue
		array.splice(i, 1, ...item);
		i += item.length - 1;
	}
	return array
}

function isPrimitiveArray(array) {
	return typeof isPrimitive(array[0]) && isPrimitive([array.length -1])
}

function isPrimitive(arg) {
	if (!arg)
		return true
	var ctor = arg.constructor;
	if (ctor === Boolean || ctor === Number || ctor === String)
		return true
	return false
}

function isTransferable(arg) {
	return arg instanceof ArrayBuffer
}

function isModifiableForTransfer(arg) {
	return arg instanceof Uint8Array
		|| arg instanceof Uint16Array
}

function ensureTransferability(arg) {
	if (arg instanceof Uint8Array)
		return arg.buffer
	if (arg instanceof ArrayBuffer)
		return arg
}

if (exports.isBrowser && typeof global === 'undefined')
	self.global = self;


;

if (events) {

	// Hooray. we have either native or 3rd party EventEmitter at our disposal.
	exports.EventEmitter = events.EventEmitter;

} else {

	// Custom tiny EventEmitter sim so that we don't have to rely on 3rd party package if its not present.
	// Mainly in browser.
	// Note: using unshift() (and looping backwards) instead of push() to prevent
	//       issues with self-removing once() listeners
	exports.EventEmitter = function EventEmitter() {
		this._map = new Map;
	};

	exports.EventEmitter.prototype._getEventCallbacks = function(name) {
		if (!this._map.has(name))
			this._map.set(name, []);
		return this._map.get(name)
	};

	exports.EventEmitter.prototype.emit = function(name, ...args) {
		var callbacks = this._getEventCallbacks(name);
		var i = callbacks.length;
		while (i--) {
			callbacks[i](...args);
		}
	};

	exports.EventEmitter.prototype.on = function(name, cb) {
		this._getEventCallbacks(name).unshift(cb);
	};

	exports.EventEmitter.prototype.once = function(name, cb) {
		var oneTimeCb = (...args) => {
			this.removeListener(name, oneTimeCb);
			cb(...args);
		};
		this.on(name, oneTimeCb);
	};

	exports.EventEmitter.prototype.removeListener = function(name, cb) {
		removeFromArray(this._getEventCallbacks(name), cb);
	};

}


if (exports.isBrowser && exports.isWorker) {
	// Get or shim 'process' object used for ipc in child
	if (self.process === undefined)
		global.process = new exports.EventEmitter;

	// Hook into onmessage/postMessage() Worker messaging API and start serving messages through
	// shim of Node's 'process' and its .on()/.send()
	// TODO: Make autoTransferArgs configurable from within worker as well.
	//       For now it's hardcoded true (thus all worker data are transfered back to master)
	routeMessageEvents(process, self, true);
	// process.send is Node's IPC equivalent of Browser's postMessage()
	process.send = message => self.postMessage(message);

	// TODO: test if this is necessary (node's cluster worker fires this automatically)
	process.emit('online');

	// TODO: test if node can see termination of its child and only use this is browser.
	let originalClose = self.close.bind(self);
	// Create process.kill() and ovewrite close() in worker to notify parent about closing.
	process.kill = self.close = () => {
		// Notify master about impending end of the thread
		process.emit('exit', 0);
		// Kill the thread
		setTimeout(originalClose);
	};
}

// Quick & dirty shim for messaging API used within Worker.
if (exports.isNode && exports.isWorker) {
	// polyfill 'self'
	if (exports.isNode && typeof self === 'undefined')
		global.self = global;
	// Polyfill *EventListener and postMessage methods on 'self', for IPC as available in native WebWorkers
	self.addEventListener = process.on.bind(process);
	self.removeEventListener = process.removeListener.bind(process);
	self.postMessage = message => process.send(message);
	// Close method to kill Worker thread
	self.close = () => {
		process.exit(0);
	};
	// 
	self.importScripts = (...args) => {
		args.forEach(require);
	};
}

if (exports.isWorker) {

	// Start listening from communication from master and handle tasks
	process.on('task-start', executeTask);

	async function executeTask(task) {
		var {id, path, args} = task;
		var theMethod = getMethod(path);
		var status = false;
		var payload;
		if (!theMethod) {
			let {name, message, stack} = new Error(`${path} is not a function (inside a worker)`);
			payload = {name, message, stack};
		} else try {
			status = true;
			payload = await theMethod(...args);
		} catch(err) {
			let {name, message, stack} = err;
			name = name.replace(/theMethod/g, path);
			message = message.replace(/theMethod/g, path);
			payload = {name, message, stack};
		}
		process.emit('task-end', {id, status, payload});
	}

	function getMethod(path, scope = self) {
		if (path.includes('.')) {
			var sections = path.split('.');
			var section;
			while (section = sections.shift())
				scope = scope[section];
			return scope
		} else {
			return scope[path]
		}
	}

}

var expo;

if (exports.isBrowser && !exports.isWorker) {

	// Extension of native webworker's Worker class and EventEmitter class
	// and few methods to loosely mimic Node's ChildProcess.
	class MultiPlatformWorker extends self.Worker {

		constructor(workerPath) {
			// Call constructor of Worker class to extends with its behavior
			super(workerPath);
			// Call constructor of EventEmitter class to extends with its behavior
			exports.EventEmitter.call(this);

			this._onMessage = e => this.emit('message', e.data);
			this.addEventListener('message', this._onMessage);
		}

		// Kills worker thread and cancels all ongoing tasks
		// TODO: Investigatge sending 'imma kill you' message to worker and wait for its respomse
		//       to determine exit code
		terminate() {
			// Call native terminate() to kill the process
			super.terminate();
			// Emitting event 'exit' to make it similar to Node's childproc & cluster
			this.emitLocally('exit', 0);
			// Remove listeners to prevent memory leaks
			this.removeEventListener('message', this._onMessage);
		}

	}

	let WorkerProto = MultiPlatformWorker.prototype;
	let EeProto = exports.EventEmitter.prototype;

	// Node's ChildProcess style alias for Worker.postMessage()
	WorkerProto.send = WorkerProto.postMessage;
	// Node's ChildProcess style alias for Worker.terminate()
	WorkerProto.kill = WorkerProto.terminate;

	// Extends MultiPlatformWoker's proto with EventEmitter methods manualy since its already
	// inheriting from Worker class and classes can have only one direct parent.
	let descriptors = Object.getOwnPropertyDescriptors(exports.EventEmitter.prototype); 
	Object.keys(descriptors) 
		.filter(name => name !== 'constructor') 
		.forEach(key => WorkerProto[key] = EeProto[key]); 

	expo = MultiPlatformWorker;
}

var BrowserWorker = expo;

var expo$1;

if (exports.isNode && !exports.isWorker) {

	// Class that in its constructor does the same as child_process.spawn().
	// It's made to be inherited from.
	class SpawnedChildProcess extends child_process.ChildProcess {

		// constructor takes exactly the same arguments as child_process.spawn() but some of the type checks
		// were removed to keep it simple.
		// Example:
		// new SpawnedChildProcess(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		// is same as:
		// child_process.spawn(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		constructor(file, args = [], options = {}) {
			super();
			var envPairs = [];
			var env = options.env || process.env;
			for (var key in env)
				envPairs.push(key + '=' + env[key]);
			args = [file, ...args];
			var params = Object.assign({file, args, envPairs}, options);
			params.windowsVerbatimArguments = !!params.windowsVerbatimArguments;
			params.detached = !!params.detached;
			this.spawn(params);
		}

	}


	// This class extends from ChildProcess instead of creating it using child_process.spawn
	// and monkey patching some methods afterwards.
	// Note: ChildProcess inherits from EventEmitter, so we've got .on() and .emit() covered
	class MultiPlatformWorker extends SpawnedChildProcess {

		constructor(workerPath, options = {}) {
			options.args = options.args || [];
			// .spawn() arguments must include script file as a first item
			// and then we're adding custom argument to ask for in the worker to determine
			// if the process is master or worker.
			var args = [workerPath, ...options.args, childDetectArg];
			// Reroute stdin, stdout and stderr (0,1,2) to display logs in main process.
			// Then create IPC channel for meesage exchange and any ammount of separate streams for piping.
			var stdio = [0, 1, 2, 'ipc'];
			var channelCount = options.streams || 0;
			while (channelCount)
				stdio.push('pipe');
			// Spawn the process by extending parent class which does the same as cp.spawn()
			super(process.execPath, args, {stdio});
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
				if (this.onerror) this.onerror(err);
			});

			this.on('message', data => {
				if (this.onmessage) this.onmessage({data});
			});

			this._listeners = new Map;
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
			var callback = data => listener({data});
			this.on('message', callback);
			this._listeners.set(listener, callback);
		}

		// Browser's Worker style alias for ChildProccess.removeListener('message', ...)
		removeEventListener(name, listener) {
			if (name !== 'message') return
			callback = this._listeners.get(listener);
			if (!callback) return
			this._listeners.delete(listener);
			this.removeListener('message', callback);
		}

	}

	let workerProto = MultiPlatformWorker.prototype;

	// Browser's Worker style alias for ChildProccess.send()
	workerProto.postMessage = workerProto.send;
	// Browser's Worker style alias for ChildProccess.kill()
	workerProto.terminate = workerProto.kill;

	expo$1 = MultiPlatformWorker;
}

var NodeWorker = expo$1

var MultiPlatformWorker = exports.isBrowser ? BrowserWorker : NodeWorker;

var pathSymbol = Symbol('Proxy path');
var onCallSymbol = Symbol('Proxy onCall');

var proxyProto = {
	get(target, name) {
		var onCall = target[onCallSymbol];
		var path = target[pathSymbol];
		function proxyFunctionInvoker(path, ...args) {
			return onCall({
				path: path.join('.'),
				args
			})
		}
		return createNestedProxy(proxyFunctionInvoker, onCall, [...path, name])
	},
	apply(target, thisArg, args) {
		var path = target[pathSymbol];
		return target(path, ...args)
	}
};

function createNestedProxy(target, onCall, path = []) {
	target[pathSymbol] = path;
	target[onCallSymbol] = onCall;
	return new Proxy(target, proxyProto)
}

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
};

// The main hub controlling all the child workers
class Cluster extends exports.EventEmitter {

	get running() {
		return this.runningWorkers.size > 0
	}
	get idle() {
		return this.runningWorkers.size === 0
	}

	constructor(workerPath = 'worker.js', options) {
		super();
		// Apply default options.
		Object.assign(this, defaultOptions);
		// Process user's options and apply them too.
		if (typeof workerPath === 'object') {
			options = workerPath;
		} else {
			options = typeof options === 'number' ? {threads: options} : options || {};
			options.workerPath = workerPath;
		}
		Object.assign(this, options);
		// Get available core/thread count.
		if (!this.threads)
			this.threads = exports.MAX_THREADS;
		// binding methods to this instance
		this.invokeTask = this.invokeTask.bind(this);
		this.emitLocally = this.emit.bind(this); // TODO
		// Create workers and supporting structures.
		this._createWorkers();
		// Create proxy for easy manipulation with APIs within workers.
		this.proxy = createNestedProxy({}, this.invokeTask);
	}

	// Executes the task in idle worker.
	_executeTask(task) {
		var wp = this.idleWorkers.values().next().value;
		return wp.invokeTask(task)
	}

	// Forcefuly executes the task. Preferably in idle workers, otherwise in those with least concurrent tasks.
	_forceExecuteTask(task) {
		if (this.idleWorkers.size > 0)
			var wp = this.idleWorkers.values().next().value;
		else
			var wp = Array.from(this.runningWorkers)
				.sort((a, b) => a.runningTasks - b.runningTasks)[0];
		return wp.invokeTask(task)
	}

	// Enqueues task that can't be executed right away.
	_enqueueTask(task) {
		var task = createTask(task);
		// Adding task to waiting queue.
		this.taskQueue.push(task);
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
		this.taskQueue = [];
		// Pool of ProxyWorker instances
		this.workers = [];
		this.idleWorkers = new Set;
		this.runningWorkers = new Set;
		this.ready = (async () => {
			// Wait to prevent blocking UI
			if (this.startupDelay > 0)
				await timeout(this.startupDelay);
			// Start up the workers
			await this._instantiateWorkers();
			if (!this.canEnqueueTasks && this.runningWorkers.size > 0) {
				// Queuing is disabled but some task are still queued because they were invoked
				// before this worker was created (this is the first time it's idle).
				// Dump all the tasks into the worker
				var task;
				while (task = this.taskQueue.shift())
					this.forceExecuteTask(task);
			}
			await Promise.all(this.workers.map(w => w.ready));
		})();
	}

	async _instantiateWorkers() {
		for (var i = 0; i < this.threads; i++) {
			if (i > 0 && this.workerStartupDelay !== 0)
				await timeout(this.workerStartupDelay);
			let wp = new ProxyWorker(this.workerPath);
			wp.on('idle', () => this._onWorkerIdle(wp));
			wp.on('running', () => this._onWorkerRunning(wp));
			// Exposing info about close 
			wp.on('online', () => this._onWorkerOnline(wp));
			wp.on('exit', code => this._onWorkerExit(wp, code));
			this._onWorkerOnline(wp);
		}
	}

	_onWorkerOnline(wp) {
		// Worker was launched
		// Add worker to pool and idlePool
		if (!this.workers.includes(wp))
			this.workers.push(wp);
		this.idleWorkers.add(wp);
		// Similarly to Node cluster, each online worker event is exposed to the whole cluster
		this.emitLocally('online', wp);
		// Announce the worker as idle and let it start taking tasks in queue
		this._onWorkerIdle(wp);
	}

	_onWorkerIdle(wp) {
		if (this.taskQueue.length) {
			// Start invoking preexisting task from queue.
			var task = this.taskQueue.shift();
			// Invoke the task on worker that just freed up.
			wp.invokeTask(task);
		} else {
			var wasIdle = this.idle;
			this.runningWorkers.delete(wp);
			this.idleWorkers.add(wp);
			// Emit 'idle' if we're done with all tasks (no workers are running)
			//if (this.runningWorkers.size === 0)
			if (!wasIdle && this.idle)
				this.emitLocally('idle');
		}
	}

	_onWorkerRunning(wp) {
		// Emit 'running' if we're started doing first task
		// (no workers were previously running)
		if (this.runningWorkers.size === 0)
			this.emitLocally('running');
		this.idleWorkers.delete(wp);
		this.runningWorkers.add(wp);
	}

	_onWorkerExit(wp) {
		// Worker died or was closed
		this.idleWorkers.delete(wp);
		this.runningWorkers.delete(wp);
		removeFromArray(this.workers, wp);
		// Similarly to Node cluster, each closed worker event is exposed to the whole cluster
		this.emitLocally('exit', wp);
	}

}



// Single worker class that uses ES Proxy to pass all requests (get accesses on the proxy)
// to the actual worker code, executes it there and waits for the woker to respond with result.
class ProxyWorker extends exports.EventEmitter {

	get runningTasks() {
		return this._runningTasks || 0
	}
	set runningTasks(newValue) {
		this._runningTasks = newValue;
		// Emit current status locally to the EE and not to the thread.
		if (newValue === 0)
			this.emitLocally('idle');
		else
			this.emitLocally('running');
	}

	get running() {
		return this.runningTasks > 0
	}
	get idle() {
		return this.runningTasks === 0
	}

	constructor(workerPath, options = {}) {
		super();
		// Apply options to this instance
		Object.assign(this, defaultOptions);
		if (workerPath)
			this.workerPath = workerPath;
		// TODO: Apply user's options
		// Bind methods to each instance
		this.invokeTask = this.invokeTask.bind(this);
		this._onTaskEnd = this._onTaskEnd.bind(this);
		this._onExit = this._onExit.bind(this);
		// The worker starts off as offline
		this.online = false;
		// Creating ready promise which resolves after first 'online' event, when worker is ready
		this.ready = new Promise(resolve => {
			// Warning: Don't try to wrap this into chaining promise. Worker loads synchronously
			//          and synchronous EventEmitter callbacks would race each other over async Promise.
			this.once('online', () => {
				this.online = true;
				resolve();
			});
		});
		// List of resolvers and rejectors of unfinished promises (ongoing requests)
		this._taskResolvers = new Map;
		// we will open user worker script which will load this library
		this.worker = new MultiPlatformWorker(this.workerPath, exports.isNode ? options : undefined);
		//this.worker = new MultiPlatformWorker(this.workerPath, isNode ? options : undefined, {type: 'module'})
		// Show errors from worker. Disabled by default because browser does it and noe processes share std.
		if (options.routeErrors) {
			// TODO: handle errors
			// Start handling messages comming from worker
			this.worker.onerror = e => console.error('WORKER:', e);
		}
		// Process (resolve and/or expose) the the data
		routeMessageEvents(this, this.worker, this.autoTransferArgs);
		this.on('task-end', this._onTaskEnd);
		// Handle closing of the thread and 
		this.on('exit', this._onExit);
		// Creation of the proxy itself, intercepting calls to the proxy object
		// and passing them into the worker.
		this.proxy = createNestedProxy({}, this.invokeTask);
	}

	// Handler of messages from inside of the worker.
	// We are only handling responses to called (invoked) method from within.
	// Resolver (or rejector) for given request ID is found and called with returned data (or error).
	_onTaskEnd({id, status, payload}) {
		if (!this._taskResolvers.has(id)) return
		var {resolve, reject} = this._taskResolvers.get(id);
		this._taskResolvers.delete(id);
		this.runningTasks--;
		if (status === true) {
			// Execution ran ok and we a have a result.
			resolve(payload);
		} else if (status === false) {
			// Error occured but it had to be sent deconstructed.
			// Create empty Error shell and copy the actual error info into it.
			var err = new Error();
			err.name = payload.name;
			err.message = payload.message;
			err.stack = payload.stack;
			reject(err);
		}
	}

	// Proxy get() handler.
	// Each called method and its arguments are turned into object describing the request
	// and is sent over to the worker where appropriate handler tries to find and call (invoke) the method
	// (by the name given by the proxy getter) with given arguments that the emulated method is called with.
	// Returns function (emulated method) which can be called with arguments as if the real mehod was called.
	// Promise is then returned and is resolved once given method in worker is found and finished
	invokeTask(task) {
		this.runningTasks++;
		task = createTask(task);
		var {id, path, args, promise, resolvers} = task;
		// Emit info about the task, most importantly, into the thread.
		this.emit('task-start', {id, path, args});
		this._taskResolvers.set(id, resolvers);
		return promise
	}
/*
	// Kills worker thread and cancels all ongoing tasks
	terminate() {
		this.worker.terminate()
		// Emitting event 'exit' to make it similar to Node's childproc & cluster
		this.emitLocally('exit', 0)
	}
*/
	_onExit(code) {
		if (code === 0) {
			// Task was closed gracefuly by either #terminate() or self.close() from within worker.
			this._taskResolvers.forEach(({reject}) => reject());
		} else {
			// Thread was abruptly killed. We might want to restart it and/or restart unfinished tasks.
			// Note: This should not be happening to browser Workers, but only to node child processes.
		}
		this.online = false;
	}

	// Cleanup after terminate()
	destroy() {
		// TODO: remove all event listeners on both EventSource (Worker) and EventEmitter (this)
		// TODO: hook this on 'exit' event. Note: be careful with exit codes and autorestart
		// TODO: make this call terminate() if this method is called directly
		this.removeAllListeners();
	}

}


// Accepts either empty object or preexisting task descruptor (object with 'name' and 'args')
// and enhances it with id, promise and resolvers for the promise.
function createTask(task = {}) {
	if (task.promise) return task
	task.promise = new Promise((resolve, reject) => {
		task.resolvers = {resolve, reject};
	});
	task.id = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
	return task
}

// TODO: handle SIGTERM and SIGINT in Node

exports.Cluster = Cluster;
exports.ProxyWorker = ProxyWorker;
exports.MultiPlatformWorker = MultiPlatformWorker;

Object.defineProperty(exports, '__esModule', { value: true });

})));
