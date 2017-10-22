import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {EventEmitter} from './shim-events.mjs'


// Routes messages from EventSource as events into EventEmitter and vice versa.
// EE mimics simplicity of Node style Emitters and uses underlying WebWorker API
// of posting messages. Events are carried in custom object {event, args} with name and args.


// Browser's Worker style alias for ChildProccess.on('message', ...)
function addEventListener(name, listener) {
	// Only allow routing 'message' event since that's what Node process' uses for passing IPC messages
	// as well as browser's Worker/self. All other fachman's APIs are built on top of this elsewhere.
	if (name !== 'message' && name !== 'error') return
	// EventSource.addEventListener() provides an event object with 'data' property as an argument to the listener,
	// whereas EventEmitter.emit() provides the data itself as the argument.
	// To shim addEventListener without breaking the 'e.data', we need to intercept and wrap each emitted data.
	var wrappedListener = data => listener({data})
	// Listen on messages EventEmitter emits, and route them to the EventSource (calling them into user's listener)
	this.on('message', wrappedListener)
	// Since we're not using user's listener, but a wrapped version of it, we need to store both of them
	// for when/if removeEventListener is called to stop listening.
	if (!this._listeners)
		this._listeners = new Map
	this._listeners.set(listener, wrappedListener)
}

// Browser's Worker style alias for ChildProccess.removeListener('message', ...)
function removeEventListener(name, listener) {
	if (name !== 'message' && name !== 'error') return
	wrappedListener = this._listeners.get(listener)
	if (!wrappedListener) return
	this._listeners.delete(listener)
	this.removeListener('message', wrappedListener)
}

// Create shim of browser's EventSource methods and add them to EventEmitter
export function routeToEventSource(eEmitter, eSource) {
	if (eSource) {
		eEmitter.addEventListener = addEventListener.bind(eSource)
		eEmitter.removeEventListener = removeEventListener.bind(eSource)
	} else {
		eEmitter.addEventListener = addEventListener
		eEmitter.removeEventListener = removeEventListener
	}
}

export function routeToEventEmitter(eEmitter, eSource) {
	// TODO
	var unwrapper = e => eEmitter._emitLocally('message', e.data)
	eSource.addEventListener('message', unwrapper)
	if (!eEmitter._killbacks)
		eEmitter._killbacks = []
	eEmitter._killbacks.push(() => eEmitter.removeEventListener('message', unwrapper))
}




// Browser's Worker style alias for ChildProccess.send()
function postMessage(message) {
	this.send(message)
}

// Node's ChildProcess style alias for ChildProccess.send()
function send(message) {
	this.postMessage(message)
}

export function shimBrowserIpc(eEmitter, eSource) {
	if (eSource) {
		eEmitter.postMessage = postMessage.bind(eSource)
	} else {
		eEmitter.postMessage = postMessage
	}
}

export function shimNodeIpc(eEmitter, eSource) {
	if (eSource) {
		eEmitter.send = send.bind(eSource)
	} else {
		eEmitter.send = send
	}
}




//var _emitLocally = EventEmitter.prototype.emit

// Only hands the event over to EventSource as 'message' event
// NOTE: Node does not support transferables
var _emitCrossThread
if (isBrowser) {
	_emitCrossThread = function _emitCrossThread(name, ...args) {
		var transferables = undefined
		if (this.autoTransferArgs)
			transferables = getTransferablesDeepTraversal(args)
		this.postMessage({event: name, args}, transferables)
	}
}
if (isNode) {
	_emitCrossThread = function _emitCrossThread(name, ...args) {
		this.send({event: name, args})
	}
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
]

// Circulates the event within EventEmitter as usual and also routes it into EventSource.
function emit(name, ...args) {
	this._emitLocally(name, ...args)
	// Ignore Node process builtin events.
	if (internalProcessEvents.includes(name)) return
	// Prevent emiting to the thread that's been closed and we have no access to anymore.
	if (this.connected === false) return
	this._emitCrossThread(name, ...args)
}

export function routeToThread(eeProto, eeInstance) {
	// Vanilla EE.emit() is replaced by IPC so we need to keep the original emit()
	// for when we're emiting messages locally and not the the other thread.
	var _emitLocally = eeProto._emitLocally || EventEmitter.prototype.emit
	eeProto._emitLocally = _emitLocally
	eeProto._emitCrossThread = _emitCrossThread
	eeProto.emit = emit

	// Received 'message' from other thread and if it's custom evet, emits it as such.
	var onMessage = data => {
		if (data.event)
			eeInstance._emitLocally(data.event, ...data.args)
		//else
		//	eeInstance._emitLocally('message', data)
	}
	//eeInstance.addEventListener('message', e => onMessage(e.data))
	eeInstance.on('message', onMessage)
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
		var array = arg.map(getTransferablesDeepTraversal).filter(a => a)
		var flattened = flatten(array)
		if (flattened.length)
			return flattened
	} else if (typeof arg === 'object' && arg !== null) {
		return getTransferablesDeepTraversal(Object.keys(arg).map(key => arg[key]))
	}
}

function flatten(array) {
	let item
	for (var i = 0; i < array.length; i++) {
		item = array[i]
		if (!Array.isArray(item)) continue
		array.splice(i, 1, ...item)
		i += item.length - 1
	}
	return array
}

function isPrimitiveArray(array) {
	return typeof isPrimitive(array[0]) && isPrimitive([array.length -1])
}

function isPrimitive(arg) {
	if (!arg)
		return true
	var ctor = arg.constructor
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