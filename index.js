(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('path'), require('events'), require('os'), require('child_process')) :
	typeof define === 'function' && define.amd ? define(['exports', 'path', 'events', 'os', 'child_process'], factory) :
	(factory((global.fachman = {}),global.path,global.events,global.os,global.child_process));
}(this, (function (exports,path,events,os,child_process) { 'use strict';

path = path && path.hasOwnProperty('default') ? path['default'] : path;
events = events && events.hasOwnProperty('default') ? events['default'] : events;
os = os && os.hasOwnProperty('default') ? os['default'] : os;

var _path = path || {};

if (Object.keys(_path).length === 0) {

	function splitSections(str) {
		str = sanitizePath(str);
		if (str.includes('://'))
			str = str.slice(str.indexOf('://') + 3);
		return str.split('/')
	}

	/*_path.relative = function(from, to) {
		from = splitSections(from)
		to = splitSections(to)
		var length = Math.min(from.length, to.length)
		var sameParts = length
		for (var i = 0; i < length; i++) {
			if (from[i] !== to[i]) {
				sameParts = i
				break
			}
		}
		return Array(from.length - 1 - sameParts)
			.fill('..')
			.concat(to.slice(sameParts))
			.join('/')
	}*/

	_path.join = function(...args) {
		return _path.normalize(args.join('/'))
	};

	_path.normalize = function(str) {
		var protocol = '';
		if (str.includes('://')) {
			var index = str.indexOf('://');
			protocol = str.slice(0, index + 3);
			str = str.slice(index + 3);
		}
		return protocol + normalizeArray(str.split('/')).join('/')
	};

	_path.dirname = function(str) {
		return str.substr(0, str.lastIndexOf('/'))
	};

	function normalizeArray(parts, allowAboveRoot) {
		var res = [];
		for (var i = 0; i < parts.length; i++) {
			var p = parts[i];
			if (!p || p === '.')
				continue
			if (p === '..') {
				if (res.length && res[res.length - 1] !== '..')
					res.pop();
				else if (allowAboveRoot)
					res.push('..');
			} else {
				res.push(p);
			}
		}
		return res
	}

}

function sanitizePath(str) {
	return str.replace(/\\/g, '/')
}

exports.isMaster = false;

// is true it it's a WebWorker or a child spawned by Node master process.
exports.isWorker = false;

// is true when native Node apis are available.
exports.isNode = false;

// is true when browser renderer with native Worker api is available.
exports.isBrowser = false;

if (typeof process === 'object' && process.versions.node && process.argv.length) {
	exports.isNode = true;
	// master/worker detection relies on IPC connection between processes.
	exports.isMaster = process.send === undefined && process.connected === undefined;
	exports.isWorker = !exports.isMaster;
}


if (typeof navigator === 'object') {
	exports.isBrowser = true;
	if (typeof importScripts === 'function') {
		exports.isWorker = true;
	}
	else if (typeof document === 'object') {
		exports.isMaster = true;
	}
}

var fachmanPath;

if (exports.isMaster)
	// Absolute path to the fachman script file. Sanitize the path.
	fachmanPath = sanitizePath(getModuleIndexPath());

function getModuleIndexPath() {
	if (typeof __filename === 'undefined')
		return document.currentScript.src
	// TODO: handle unbundled ESM version where __filename === 'src/platform.mjs' instead of 'index.mjs/js'
	//else if ()
	//	return __filename
	else
		return __filename
}

// https://github.com/nodejs/node-eps/blob/master/002-es-modules.md#451-environment-variables
var supportsNativeModules = typeof module === 'undefined'
								&& typeof exports === 'undefined'
								&& typeof require === 'undefined';
								//&& typeof __filename === 'undefined'

// Modules support in workers is a ways off for now.
var supportsWorkerModules = false;
/*
if (isBrowser) {
	var detectionPromise = new Promise((resolve, reject) => {
		var code = `self.postMessage(typeof importScripts)`
		code = createBlobUrl(code)
		var dummy = new Worker(code, {type: 'module'})
		dummy.onmessage = function({data}) {
			supportsWorkerModules = data === 'undefined'
			dummy.terminate()
		}
		dummy.onerror = err => {
			reject(err)
			dummy.terminate()
		}
	})
}
*/

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

exports.EventEmitter = events && events.EventEmitter;

if (!exports.EventEmitter) {

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

	exports.EventEmitter.prototype.removeAllListeners = function(name) {
		if (name)
			this._map.delete(name);
		else
			this._map.clear();
	};

}

if (exports.isBrowser && typeof global === 'undefined')
	self.global = self;

// TODO: Hide polyfilling process in master behind option (true by default)
if (exports.isBrowser && self.process === undefined) {

	// Shim 'process' object used for ipc in child.
	// Note: shim for master does not neet to be EventEmitter, so it's not (performance reasons)
	if (exports.isWorker)
		self.process = new exports.EventEmitter;
	else
		self.process = {};

	process.cwd = function() {
		return location.href.substr(0, location.href.lastIndexOf('/'))
	};

}

function addEventListener(name, listener) {
	// Only allow routing 'message' event since that's what Node process' uses for passing IPC messages
	// as well as browser's Worker/self. All other fachman's APIs are built on top of this elsewhere.
	if (name !== 'message' && name !== 'error') return
	// EventSource.addEventListener() provides an event object with 'data' property as an argument to the listener,
	// whereas EventEmitter.emit() provides the data itself as the argument.
	// To shim addEventListener without breaking the 'e.data', we need to intercept and wrap each emitted data.
	var wrappedListener = data => listener({data});
	// Listen on messages EventEmitter emits, and route them to the EventSource (calling them into user's listener)
	this.on('message', wrappedListener);
	// Since we're not using user's listener, but a wrapped version of it, we need to store both of them
	// for when/if removeEventListener is called to stop listening.
	if (!this._listeners)
		this._listeners = new Map;
	this._listeners.set(listener, wrappedListener);
}

// Browser's Worker style alias for ChildProccess.removeListener('message', ...)
function removeEventListener(name, listener) {
	if (name !== 'message' && name !== 'error') return
	wrappedListener = this._listeners.get(listener);
	if (!wrappedListener) return
	this._listeners.delete(listener);
	this.removeListener('message', wrappedListener);
}

// Create shim of browser's EventSource methods and add them to EventEmitter
function routeToEventSource(eEmitter, eSource) {
	if (eSource) {
		eEmitter.addEventListener = addEventListener.bind(eSource);
		eEmitter.removeEventListener = removeEventListener.bind(eSource);
	} else {
		eEmitter.addEventListener = addEventListener;
		eEmitter.removeEventListener = removeEventListener;
	}
}

function routeToEventEmitter(eEmitter, eSource) {
	// TODO
	var unwrapper = e => eEmitter._emitLocally('message', e.data);
	eSource.addEventListener('message', unwrapper);
	if (!eEmitter._killbacks)
		eEmitter._killbacks = [];
	eEmitter._killbacks.push(() => eEmitter.removeEventListener('message', unwrapper));
}




// Browser's Worker style alias for ChildProccess.send()
function postMessage(message) {
	this.send(message);
}

// Node's ChildProcess style alias for ChildProccess.send()
function send(message) {
	this.postMessage(message);
}

function shimBrowserIpc(eEmitter, eSource) {
	if (eSource) {
		eEmitter.postMessage = postMessage.bind(eSource);
	} else {
		eEmitter.postMessage = postMessage;
	}
}

function shimNodeIpc(eEmitter, eSource) {
	if (eSource) {
		eEmitter.send = send.bind(eSource);
	} else {
		eEmitter.send = send;
	}
}




//var _emitLocally = EventEmitter.prototype.emit

// Only hands the event over to EventSource as 'message' event
// NOTE: Node does not support transferables
var _emitCrossThread;
if (exports.isBrowser) {
	_emitCrossThread = function _emitCrossThread(name, ...args) {
		var transferables = undefined;
		if (this.autoTransferArgs)
			transferables = getTransferablesDeepTraversal(args);
		this.postMessage({event: name, args}, transferables);
	};
}
if (exports.isNode) {
	_emitCrossThread = function _emitCrossThread(name, ...args) {
		this.send({event: name, args});
	};
}

// NOTE: These are events internally used and emitted by Node's ChildProcess that we're inheriting from.
//       The code calls .emit() which we are replacing and it will eventually trickle down to ._emitCrossThread()
//       where these events need to be stopped. Because of couple of reasons:
//       1) Prevent pollution of other thread (and its EventEmitter based 'process' object) with 'newListener' and other events.
//       2) When the process is killed and ChildProcess emits 'exit' event, 
var internalProcessEvents = [
	// ChildProcess API
	'error', 'exit', 'close', 'disconnect', 'unref',
	// EventEmitter internals
	'newListener', 'removeListener',
	// IPC
	'message', 'internalMessage',
	// Other events
	'uncaughtException',
];

// Circulates the event within EventEmitter as usual and also routes it into EventSource.
function emit(name, ...args) {
	this._emitLocally(name, ...args);
	// Ignore Node process builtin events.
	if (internalProcessEvents.includes(name)) return
	// Prevent emiting to the thread that's been closed and we have no access to anymore.
	if (this.connected === false) return
	this._emitCrossThread(name, ...args);
}

function routeToThread(eeProto, eeInstance) {
	// Vanilla EE.emit() is replaced by IPC so we need to keep the original emit()
	// for when we're emiting messages locally and not the the other thread.
	var _emitLocally = eeProto._emitLocally || exports.EventEmitter.prototype.emit;
	eeProto._emitLocally = _emitLocally;
	eeProto._emitCrossThread = _emitCrossThread;
	eeProto.emit = emit;

	// Received 'message' from other thread and if it's custom evet, emits it as such.
	var onMessage = data => {
		if (data.event)
			eeInstance._emitLocally(data.event, ...data.args);
		//else
		//	eeInstance._emitLocally('message', data)
	};
	//eeInstance.addEventListener('message', e => onMessage(e.data))
	eeInstance.on('message', onMessage);
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

if (exports.isWorker) {

	if (exports.isBrowser) {

		process.send = self.postMessage.bind(self);
		process.postMessage = self.postMessage.bind(self);
		// process.send is Node's IPC equivalent of Browser's postMessage()
		//shimNodeIpc(process, self)
		// Route self.addEventListener('message') messages into EventEmitter.on('message')
		routeToEventEmitter(process, self);

		//process.send = message => self.postMessage(message)
		//process.emit = ...
		//process.on = ...
		//process.removeListener = ...

		// TODO: test if node can see termination of its child and only use this is browser.
		let originalClose = self.close.bind(self);
		// Create process.kill() and ovewrite worker's close() to notify parent thread about closing.
		process.kill = (pid, signal) => {
			// TODO
		};
		process.exit = self.close = (code = 0) => {
			// Notify master about impending end of the thread. Arguments: exit code and signal (null if exited from inside the worker)
			// NOTE: using postMessage({...}) instead od process.emit('exit', code) because emit would get delayed
			//       inside EventEmitter with nextTick and wouldn't surface to parent in time. postMessage is sync.
			self.postMessage({event: 'exit', args: [code, null]});
			// Kill the thread
			setTimeout(originalClose);
		};
		// Shim Node's require() with importScript()
		//global.require = arg => importScripts(arg)
	}

	// Quick & dirty shim for messaging API used within Worker.
	if (exports.isNode) {
		// polyfill 'self'
		if (global.self === undefined)
			global.self = global;

		self.postMessage = process.send.bind(process);
		// Shim browser's IPC self.postMessage
		//shimBrowserIpc(self, process)
		// Route EventEmitter.on('message') events into self.addEventListener('message')
		routeToEventSource(self, process);

		//self.postMessage = message => process.send(message)
		//self.addEventListener = addEventListener.bind(process)
		//self.removeEventListener = removeEventListener.bind(process)

		// Shim browser's close method to kill Worker thread
		self.close = (code = 0) => process.exit(code);
		// Shim browser's importScript() with require()
		self.importScripts = (...args) => args.forEach(require);
	}

	// Establish inter-process EventEmitter so we can easily just .emit('name', arg) without
	// additional bootstrapping and messing with postMessage/send on one side, and addEventListener/on
	// on the other. Events in the parent will be emitted in the MultiPlatformWorker instance of this worker.
	// Just like emitting event into that instance will make it appear here in the worker as well.
	routeToThread(process, process);

}

// Create 
var defaultContext = {};

// Shim module.exports and expots and point it to defaultContext.
// TODO: Hide module + exports in master behind option (true by default)
if (exports.isBrowser && exports.isWorker) {
	if (global.exports === undefined)
		global.exports = {};
	if (global.module === undefined)
		global.module = {exports: global.exports};
	defaultContext = global.exports;
}

// Worker's is by default not wrapped (unless user bundles his code) and context points to 'self' global object.
// All defined functions and variables (that are not inside another block scope) are therefore also globals
// that we can acces in 'self'
if (exports.isBrowser)
	var fallbackContext = self;

// Node module code is wrapped and has custom inaccessible context. Scope 'this' points to an useless empty object.
// By an off chance that user puts their methods in global we start with that and offer to use setScope(exports).
if (exports.isNode)
	var fallbackContext = global;

// List of contexts where we'll be location methods to execute
var contexts = [fallbackContext, defaultContext];

// Adds user-selected/created context to the list of searchable contexts
function setContext(customContext = {}) {
	contexts.push(customContext);
	return customContext
}

// User can register selected methods instead of setting whole context
function register(value, name = value.name) {
	defaultContext[name] = value;
}

function resolvePath(path$$1) {
	var result;
	var ci = contexts.length;
	if (path$$1.includes('.')) {
		var pathSections = path$$1.split('.').reverse();
		var section;
		while (result === undefined && ci--) {
			let context = contexts[ci];
			let si = pathSections.length;
			while (si--) {
				section = pathSections[si];
				context = context[section];
				if (context === undefined) break
			}
			result = context;
		}
	} else {
		while (result === undefined && ci--)
			result = contexts[ci][path$$1];
	}
	return result
}

if (exports.isWorker) {

	// Start listening from communication from master and handle tasks
	process.on('task-start', executeTask);

	async function executeTask(task) {
		var {id, path: path$$1, args} = task;
		var theMethod = resolvePath(path$$1);
		var status = false;
		var payload;
		if (!theMethod) {
			let {name, message, stack} = new Error(`${path$$1} is not a function (inside a worker)`);
			payload = {name, message, stack};
		} else try {
			status = true;
			payload = await theMethod(...args);
		} catch(err) {
			let {name, message, stack} = err;
			name = name.replace(/theMethod/g, path$$1);
			message = message.replace(/theMethod/g, path$$1);
			payload = {name, message, stack};
			console.error(err);
		}
		process.emit('task-end', {id, status, payload});
	}

	// Now that we've established inter-process EventEmitter...
	// Emit 'online' event to the parent, similar to what Node cluster module does.
	// Note: Only 'cluster' module does it, so 'child_process' and its ChildProcess we're using here
	//       still needs us to manually fire the 'online' event
	// Note: In some cases it is critical to not emit (and subsequently using postMessage) immediately during
	//       setup phase. It will silently throw in wrapped worker. We need to postpone 'online' event until end of event loop.
	setTimeout(() => process.emit('online'));

}

if (exports.isNode && exports.isWorker && __filename === process.argv[1]) {
	// This very script 'fachman' has been spawned as a child process (second argument equals __filename).
	// That means this is a worker thread and wrapping user scripts for easier context accessing is enabled.
	// Now we need to execute (by requiring) user's script he initially wanted to launch in the worker.

	// Remove path to fachman from process arguments
	process.argv.splice(1,1);
	global.fachman = exports;

	// Delay loading user script until all of fachman is loaded and interpreted.
	// NOTE: This is necessary because rollup shoves all fachman souce files into one. This file will end up
	//       in the middle of it and would start requiring/loading user's worker script before fachman is fully ready.
	setTimeout(loadUserWorkerScript);

	// Import user worker script
	function loadUserWorkerScript() {
		// We've passed path of target worker script from master process to this worker proces in arguments.
		var userScriptRelPath = process.argv[1];
		userScriptRelPath = sanitizePath(userScriptRelPath);
		try {
			// Try to load the path as is (it could be a whole module)
			var ctx = require(userScriptRelPath);
		} catch (e) {
			// If the loading fails, add ./ and try again
			userScriptRelPath = relativizie(userScriptRelPath);
			var ctx = require(userScriptRelPath);
		}
		// Handle transpiler/bundle ES module format using 'default' key.
		if (ctx.hasOwnProperty('default'))
			ctx = ctx['default'];
		// And finally set the export context of the module as fachmans lookup input.
		setContext(ctx);
	}

	function relativizie(string) {
		if (!string.startsWith('./') && !string.startsWith('../'))
			return './' + string
	}

	process.on('unhandledRejection', reason => {
		console.error(reason);
	});

}


// Browser is capable of creating worker code dynamically in browser by turning the code into blob and then to url.

var universalBlobUrl;

function getBlobUrl(esm = false) {
	// TODO: ES Module support when it's available in browsers
	if (!universalBlobUrl) {
		// Note: Relative URLs can't be used in blob worker.
		//       Absolute paths of scripts to import has to be sent through message.
		var code = `
			self.onmessage = e => {
				var {fachmanPath, workerPath} = e.data
				self.onmessage = undefined
				importScripts(fachmanPath, workerPath)
			}
			`;
		universalBlobUrl = createBlobUrl(code);
	}
	return universalBlobUrl
}

function createBlobUrl(string) {
	var blob = new Blob([string], {type: 'application/javascript'});
	return URL.createObjectURL(blob)
}

var BrowserWorker;

if (exports.isMaster && exports.isBrowser) {

	// Extension of native webworker's Worker class and EventEmitter class
	// and few methods to loosely mimic Node's ChildProcess.
	BrowserWorker = class BrowserWorker extends self.Worker {

		constructor(workerPath, options = {}) {
			if (options.autoWrapWorker !== false) {
				// Get or create standard custom wrapper for given worker.
				// The code will import fachman and then the desired worker. 
				var blobUrl = getBlobUrl(options.type === 'module');
				super(blobUrl, options);
				// Convert worker path into absolute path
				if (!workerPath.includes('://'))
					workerPath = _path.join(process.cwd(), workerPath);
				// Relative URLs can't be used in blob workers because those have 'blob:' prefix.
				// The blob wrapper we made earlier listens for message with fachman and actual worker path.
				// Once that's received, the worker imports scripts and self-destructs the message and listener.
				this.postMessage({fachmanPath, workerPath});
			} else {
				// Call constructor of Worker class to extends with its behavior
				super(workerPath, options);
			}
			//this.addEventListener('error', err => console.error(err))
			// Call constructor of EventEmitter class to extends with its behavior
			exports.EventEmitter.call(this);
			// Following properties are here to mimic Node's ChildProcess.
			// Thread starts off without exit codes that will be assigned once it exits.
			this.signalCode = null;
			this.exitCode = null;
			this.killed = false;
			// Listening to 'exit' event rather than assigning it in terminate() because the thread could end on its own with custom code.
			this.on('exit', (code, signal) => {
				this.exitCode = code;
				this.signalCode = signal;
			});
			// Worker is launched synchronously (or the messages wait at least) so we can just assign it like this.
			this.connected = true;
			// Path to the file
			this.spawnfile = workerPath;


			// Array of callbacks to call, to remove listeners and prevent memory leaks, when the worker gets destroyed. 
			this._killbacks = [];
			// Route self.addEventListener('message') messages into EventEmitter.on('message')
			routeToEventEmitter(this, this);
		}

		// Shim for Node's ChildProcess.kill()
		kill(signal) {
			this.terminate(signal);
		}

		// Kills worker thread and cancels all ongoing tasks
		// TODO: Investigatge sending 'imma kill you' message to worker and wait for its respomse
		//       to determine exit code
		terminate(signal = 'SIGTERM') {
			if (signal !== 'SIGTERM') {
				// TODO: postMessage the code to the process and give it some time to finish
				//       if that's what node does - INVESTIGATE
			}
			// Call native terminate() to kill the process
			super.terminate();
			// Browser mercilessly kills the worker thread on sight.
			this.killed = true;
			// Set connected to false and emit 'disconnect' to stay in parity with Node's ChildProcess.
			this.disconnect();
			// Exit code is null instead of 0 because the process didn't end/exit itself but was closed externally.
			this._emitLocally('exit', null, signal);
			this._emitLocally('close', null, signal);
		}

		// Rough approximation of Node's ChildProcess.disconnect().
		// NOTE: it does not do fancy handling of pending messages like Node does.
		disconnect() {
			this.connected = false;
			// Emitting event 'disconnect', 'exit' and finally 'close' to make it similar to Node's childproc & cluster
			this._emitLocally('disconnect');
		}

	};

	let WorkerProto = BrowserWorker.prototype;
	let EeProto = exports.EventEmitter.prototype;

	// Shim for Node's ChildProcess.send(), an alias for Worker.postMessage()
	shimNodeIpc(WorkerProto);

	// Extends MultiPlatformWoker's proto with EventEmitter methods manualy since its already
	// inheriting from Worker class and classes can have only one direct parent.
	let descriptors = Object.getOwnPropertyDescriptors(exports.EventEmitter.prototype);
	Object.keys(descriptors)
		.filter(name => name !== 'constructor')
		.forEach(key => WorkerProto[key] = EeProto[key]);

}

/*
function stringifyFunction(fn) {
	var string = fn.toString()
	if (string.startsWith('[') && string.endsWith(']'))
		throw new Error('function or object given to ProxyWorker cannot be stringified')
	return createBlobUrl(string)
}
*/

var NodeWorker;

if (exports.isMaster && exports.isNode) {

	// Class that in its constructor does the same as child_process.spawn().
	// It's made to be inherited from.
	class SpawnedChildProcess extends child_process.ChildProcess {

		// constructor takes exactly the same arguments as child_process.spawn() but some of the type checks
		// were removed to keep it simple.
		// Example:
		// new SpawnedChildProcess(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		// is same as:
		// child_process.spawn(process.execPath, ['thefile.js', my', 'arg'], {stdio: [1,2,3,'ipc']})
		constructor(nodePath, args = [], options = {}) {
			// ChildProcess constructor doesn't take any arugments. But later on it's initialized with .spawn() method.
			super();
			if (options.autoWrapWorker !== false) {
				var fachmanDir = path.dirname(fachmanPath);
				// If the user script file has .mjs ending (singaling it's written as ES Module) and Node has native support
				// then import unbundled ES Module version of fachman.
				var wrapperExt = options.type === 'module' && supportsNativeModules ? 'mjs' : 'js';
				var wrapperName = `index.${wrapperExt}`;
				// Point to the wrapper file in the root of the fachman folder (next to index).
				// The path can be absolute because node would do that to relative paths as well.
				var wrapperPath = path.join(fachmanDir, wrapperName);
				// User's (NodeWorker in this case) defines his script to launch as a first argument.
				var userScriptRelPath = args.shift();
				userScriptRelPath = path.relative(fachmanDir, userScriptRelPath);
				// Prepend args with path to user script and our wrapper that will run fachman and the script.
				args = [wrapperPath, userScriptRelPath, ...args];
			}
			args = [nodePath, ...args];
			var file = nodePath;
			// Create the basics needed for creating a pocess. It basically does all that child_process.spawn() does internally.
			var envPairs = [];
			var env = options.env || process.env;
			for (var key in env)
				envPairs.push(key + '=' + env[key]);
			var params = Object.assign({file, args, envPairs}, options);
			params.windowsVerbatimArguments = !!params.windowsVerbatimArguments;
			params.detached = !!params.detached;
			this.spawn(params);
		}

	}


	// This class extends from ChildProcess instead of creating it using child_process.spawn
	// and monkey patching some methods afterwards.
	// Note: ChildProcess inherits from EventEmitter, so we've got .on() and .emit() covered
	NodeWorker = class NodeWorker extends SpawnedChildProcess {

		constructor(workerPath, options = {}) {
			options.args = options.args || [];
			// .spawn() arguments must include script file as a first item
			// and then we're adding custom argument to ask for in the worker to determine
			// if the process is master or worker.
			var args = [workerPath, ...options.args];
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
				// Tigger Browser's Worker style API
				if (this.onerror) this.onerror(err);
			});

			this.on('message', data => {
				// Tigger Browser's Worker style API
				if (this.onmessage) this.onmessage({data});
			});

			// Array of callbacks to call, to remove listeners and prevent memory leaks, when the worker gets destroyed. 
			this._killbacks = [];
		}

		// Browser's Worker style alias for ChildProccess.kill()
		terminate() {
			//this.kill(0)
			this.kill();
			// TODO: investigate if this implementation is enough
			//this.kill('SIGINT')
			//this.kill('SIGTERM')
		}

	};

	shimBrowserIpc(NodeWorker.prototype);
	// Create shim of browser's EventSource methods and add them to EventEmitter
	routeToEventSource(NodeWorker.prototype);
	//NodeWorker.prototype.addEventListener = addEventListener
	//NodeWorker.prototype.removeEventListener = removeEventListener
	//NodeWorker.prototype.postMessage = postMessage

}

;

if (exports.isMaster) {

	var Parent = BrowserWorker || NodeWorker;

	// Subclassing native Worker or ChildProcess extension
	exports.MultiPlatformWorker = class MultiPlatformWorker extends Parent {

		constructor(workerPath, options = {}) {
			super(workerPath, options);
			// Node does not support transferables
			if (exports.isNode)
				this.autoTransferArgs = false;
			// This class inherits from two interfaces, both of which receive 'message' event (either through Node's EventEmitter
			// or browser's EventSource interface) with custom event structure that needs to be unwrapped and exposed on this
			// instance's (it's also EventEmitter).
			routeToThread(this, this);
			// The worker starts off as offline
			this.online = false;
			// Creating ready promise which resolves after first 'online' event, when worker is ready
			// Warning: Don't try to wrap this into chaining promise. Worker loads synchronously
			//          and synchronous EventEmitter callbacks would race each other over async Promise.
			this.once('online', () => this.online = true);
			this.ready = new Promise(resolve => this.once('online', resolve));
			// Handle closing of the thread.
			this.once('exit', () => this.online = false);
			
			//this.on('error', err => console.error(err))
		}

		// Kill the worker process/thread and cleanup after that
		terminate() {
			try {
				super.terminate();
			} catch(e) {}
			var timeout = setTimeout(() => this._destroy(), 3000);
			this.once('close', () => {
				clearTimeout(timeout);
				this._destroy();
			});
		}

		// Destroy all listeners immediately
		destroy() {
			try {
				super.terminate();
			} catch(e) {}
			// Destroy all listeners immediately
			this._destroy();
		}

		// Remove all active EventEmitter listeners to prevent memory leaks.
		_destroy() {
			this.removeAllListeners();
			this._killbacks.forEach(callback => callback());
			// TODO: remove all event listeners on both EventSource
			// TODO: hook this on 'exit' event. Note: be careful with exit codes and autorestart
		}

	};

} else {

	// Export noop to prevent breakage in worker environment, from where creating another worker doesn't make sense
	exports.MultiPlatformWorker = class {};

}

var pathSymbol = Symbol('Proxy path');
var onCallSymbol = Symbol('Proxy onCall');

var proxyProto = {
	get(target, name) {
		var onCall = target[onCallSymbol];
		var path$$1 = target[pathSymbol];
		function proxyFunctionInvoker(path$$1, ...args) {
			return onCall({
				path: path$$1.join('.'),
				args
			})
		}
		return createNestedProxy(proxyFunctionInvoker, onCall, [...path$$1, name])
	},
	apply(target, thisArg, args) {
		var path$$1 = target[pathSymbol];
		return target(path$$1, ...args)
	}
};

function createNestedProxy(target, onCall, path$$1 = []) {
	target[pathSymbol] = path$$1;
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
	// Browser only
	// Each postMessage (both raw or through any other higher level API) data is crawled and searched for
	// arrays, buffers and arraybuffers that can be have their memory transfered from one thread to another.
	autoTransferArgs: true,
	// TODO - wrapping script in node by executing fachman and requiring it from there
	// TODO - constructing custom blobl url in browser (es modules only, not available yet)
	autoWrapWorker: true,
	// Can be one of:
	// - 'script' launches as bare script with 'importScripts' and 'require' functions.
	// - 'module' launches as ES Module with 'import' syntax enabled.
	// - undefined by default results in autodetection based on '.mjs' file extension.
	type: undefined
};

class ProxyWorker extends exports.MultiPlatformWorker {

	get runningTasks() {
		return this._runningTasks || 0
	}
	set runningTasks(newValue) {
		this._runningTasks = newValue;
		// Emit current status locally to the EE and not to the thread.
		if (newValue === 0)
			this._emitLocally('idle');
		else
			this._emitLocally('running');
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
		options = Object.assign({}, defaultOptions, options);
		if (options.type === undefined) {
			// Only works in browser for now
			if (workerPath.endsWith('.mjs'))
				options.type = 'module';
			else
				(options.args = options.args || []).push('--experimental-modules');
		}
		// We will open user worker script which will load this library.
		super(workerPath, options);
		// Apply options to this instance
		Object.assign(this, options);
		// Setup events and structures needed for creating tasks.
		// List of resolvers and rejectors of unfinished promises (ongoing requests)
		this._taskResolvers = new Map;
		this.on('task-end', this._onTaskEnd.bind(this));
		this.once('exit', this._onExit.bind(this));
		// Creation of the proxy itself, intercepting calls to the proxy object
		// and passing them into the worker.
		this.invokeTask = this.invokeTask.bind(this);
		this.proxy = createNestedProxy({}, this.invokeTask);
	}

	_onExit(code) {
		if (code === 0) {
			// Task was closed gracefuly by either #terminate() or self.close() from within worker.
			this._taskResolvers.forEach(({reject}) => reject());
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
		this.runningTasks++;
		task = createTask(task);
		var {id, path: path$$1, args, promise, resolvers} = task;
		// Emit info about the task, most importantly, into the thread.
		this.emit('task-start', {id, path: path$$1, args});
		this._taskResolvers.set(id, resolvers);
		return promise
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
		this._emitLocally = this.emit.bind(this); // TODO
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
		this._emitLocally('online', wp);
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
				this._emitLocally('idle');
		}
	}

	_onWorkerRunning(wp) {
		// Emit 'running' if we're started doing first task
		// (no workers were previously running)
		if (this.runningWorkers.size === 0)
			this._emitLocally('running');
		this.idleWorkers.delete(wp);
		this.runningWorkers.add(wp);
	}

	_onWorkerExit(wp) {
		// Worker died or was closed
		this.idleWorkers.delete(wp);
		this.runningWorkers.delete(wp);
		removeFromArray(this.workers, wp);
		// Similarly to Node cluster, each closed worker event is exposed to the whole cluster
		this._emitLocally('exit', wp);
	}

}

// TODO: handle SIGTERM and SIGINT in Node

exports.ProxyWorker = ProxyWorker;
exports.createTask = createTask;
exports.Cluster = Cluster;
exports.contexts = contexts;
exports.setContext = setContext;
exports.register = register;
exports.resolvePath = resolvePath;

Object.defineProperty(exports, '__esModule', { value: true });

})));
