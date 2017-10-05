(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('events'), require('os'), require('child_process'), require('net')) :
	typeof define === 'function' && define.amd ? define(['exports', 'events', 'os', 'child_process', 'net'], factory) :
	(factory((global.fachman = {}),global.events$1,global.os,global.child_process,global.net));
}(this, (function (exports,events$1,os,child_process,net) { 'use strict';

events$1 = events$1 && events$1.hasOwnProperty('default') ? events$1['default'] : events$1;
os = os && os.hasOwnProperty('default') ? os['default'] : os;
child_process = child_process && child_process.hasOwnProperty('default') ? child_process['default'] : child_process;
net = net && net.hasOwnProperty('default') ? net['default'] : net;

var childIdentifArg = 'is-child-worker';

// Tiny promisified version of setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis));

function getCpuCores() {
	if (exports.isNode)
		return os.cpus().length || 1
	else
		return navigator.hardwareConcurrency || 1
}

const PRIVATE_EVENT_ONLINE = '__thread_online__';
const PRIVATE_EVENT_EXIT   = '__thread_exit__';

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
	if (process.argv.includes(childIdentifArg))
		exports.isWorker = true;
	else
		exports.isMaster = true;
}

if (typeof navigator === 'object') {
	exports.isBrowser = true;
	if (typeof importScripts === 'function')
		exports.isWorker = true;
	else if (typeof document === 'object')
		exports.isMaster = true;
}

// polyfill 'self'
if (exports.isNode && typeof self === 'undefined')
	global.self = global;


// Custom tiny EventEmitter sim so that we don't have to rely on 3rd party package if its not present.
// Mainly in browser.


if (events$1) {

	// Hooray. we have either native or 3rd party EventEmitter at our disposal.
	exports.EventEmitter = events$1.EventEmitter;

} else {

	// Resorting to our custom shim.
	exports.EventEmitter = class EventEmitter {

		constructor() {
			this._map = new Map;
		}

		_getEventCallbacks(name) {
			if (!this._map.has(name))
				this._map.set(name, []);
			return this._map.get(name)
		}

		emit(name, ...args) {
			this._getEventCallbacks(name).forEach(cb => cb(...args));
		}

		on(name, cb) {
			this._getEventCallbacks(name).push(cb);
		}

	};

}


// WebWorker native class or shim for node's spawn


if (exports.isBrowser) {

	exports.Worker = self.Worker;

} else if (exports.isNode) {

	class BufferBasedMessenger extends exports.EventEmitter {

		constructor(pipe) {
			super();
			if (pipe) {
				this.thePipe = pipe;
				// if we have the pipe, we can start setting the pipe right away
				this._create();
			}
		}

		_create() {
			this.addEventListener = this.on.bind(this);
			this.removeEventListener = this.removeListener.bind(this);
			// listen on data from master pipe, convert and expose them as 'message' event
			this.thePipe.on('data', data => this._onBuffer(data));
			// todo. handle errors
			// todo. handle close event
		}

		_onBuffer(buffer) {
			var data = JSON.parse(buffer.toString());
			var message = {data};
			// Note: the data in Workers API (and all browser events using addEventListener)
			// are stored in 'data' property of the event
			this.emit('message', message);
			if (this.onmessage)
				this.onmessage(message);
		}

		// this will always only receive 'message' events
		postMessage(message) {
			var json = JSON.stringify(message);
			this.thePipe.write(json);
		}

	}

	// Quick & dirty shim for browser's Worker API.
	// Note: the 'var' has to be there for it to become global var in this module's scope.
	exports.Worker = class Worker extends BufferBasedMessenger {

		constructor(workerPath) {
			super();
			var args = [workerPath, childIdentifyArg];
			// Reoute stdin, stdout and stderr to master and create separate fourth
			// pipe for master-worker data exchange
			var options = {
				stdio: [0, 1, 2, 'pipe']
			};
			this.proc = child_process.spawn(process.execPath, args, options);
			// The data pipe is fourth stream (id 3)
			this.thePipe = this.proc.stdio[3];
			// Manually starting the setup of pipe communication (handler by parent class)
			this._create();
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
			this.proc.kill('SIGINT');
			this.proc.kill('SIGTERM');
		}

	};

	// Quick & dirty shim for messaging API used within Worker.
	if (exports.isWorker) {
		// Connect to the master data pipe (id 3)
		var masterPipe = new net.Socket({fd: 3});
		var messenger = new BufferBasedMessenger(masterPipe);
		self.addEventListener = messenger.addEventListener;
		self.removeEventListener = messenger.removeEventListener;
		self.postMessage = messenger.postMessage.bind(messenger);
		self.close = () => {
			console.log('TODO: not implemented. close worker');
			process.exit(0);
		};
	}

}

// Routes messages from EventSource as events into EventEmitter and vice versa.
// EE mimics simplicity of Node style Emitters and uses underlying WebWorker API
// of posting messages. Events are carried in custom object {event, args} with name
// and arguments. This shields events from EventSource implementation. Mainly allows
// safe usage any event name, including 'message' in emitter.emit('message', data).
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

if (exports.isWorker) {
	// Create EventEmitter for serving events from onmessage/postMessage Worker messaging API
	let emitter = new exports.EventEmitter;
	// Hook EventEmitter into self.onmessage and start handling messages.
	// TODO: Make autoTransferArgs configurable from within worker as well.
	//       For now it's hardcoded true (thus all worker data are transfered back to master)
	routeMessageEvents(emitter, self, true);
	// Extend worker 'self' scope with EventEmitter methods.
	let descriptors = Object.getOwnPropertyDescriptors(exports.EventEmitter.prototype);
	Object.keys(descriptors)
		.filter(name => name !== 'constructor' && !name.startsWith('_'))
		.forEach(key => self[key] = emitter[key].bind(emitter));
	// Start listening from communication from master and handle tasks
	self.on('task-start', executeTask);

	// TODO: test if this is necessary (node's cluster worker fires this automatically)
	self.postMessage(PRIVATE_EVENT_ONLINE);

	// TODO: test if node can see termination of its child and only use this is browser.
	let originalClose = self.close.bind(self);
	self.close = () => {
		// Notify master about impending close
		self.postMessage(PRIVATE_EVENT_EXIT);
		// Kill the thread
		setTimeout(originalClose);
	};
}

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
	self.emit('task-end', {id, status, payload});
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
			this.threads = getCpuCores();
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

	async _createWorkers() {
		// List of ongoing tasks
		this.taskQueue = [];
		// Pool of ProxyWorker instances
		this.workers = [];
		this.idleWorkers = new Set;
		this.runningWorkers = new Set;
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
		this.runningWorkers.add(wp);
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

	constructor(workerPath, options) {
		super();
		// Apply options to this instance
		Object.assign(this, defaultOptions);
		if (workerPath)
			this.workerPath = workerPath;
		// TODO: Apply user's options
		// Bind methods to each instance
		this.invokeTask = this.invokeTask.bind(this);
		this._onTaskEnd = this._onTaskEnd.bind(this);
		// List of resolvers and rejectors of unfinished promises (ongoing requests)
		this.taskResolvers = new Map;
		// we will open user worker script which will load this library
		this.worker = new exports.Worker(this.workerPath);
		// Start handling messages comming from worker
		this.worker.onerror = e => {
			// todo: handle errors
			console.error('worker onerror', e);
			console.error(e);
		};
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
		if (!this.taskResolvers.has(id)) return
		var {resolve, reject} = this.taskResolvers.get(id);
		this.taskResolvers.delete(id);
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
		this.taskResolvers.set(id, resolvers);
		return promise
	}

	terminate() {
		this.worker.terminate();
		// Emitting event 'exit' to make it similar to Node's childproc & cluster
		this.emitLocally('exit', 0);
	}

	// Alias for terminate()
	close() {
		this.terminate();
	}

	_onExit(code) {
		if (code === 0) {
			// Task was closed gracefuly by either #terminate() or self.close() from within worker.
			this.taskResolvers.forEach(({reject}) => reject());
		} else {
			// Thread was abruptly killed. We might want to restart it and/or restart unfinished tasks.
			// Note: This should not be happening to browser Workers, but only to node child processes.
		}

	}

	// Cleanup after
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

Object.defineProperty(exports, '__esModule', { value: true });

})));
