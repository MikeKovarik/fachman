import {BrowserWorker} from './MultiPlatformWorker-browser.mjs'
import {NodeWorker} from './MultiPlatformWorker-node.mjs'
import {isBrowser, isNode, isMaster} from './platform.mjs'
import {EventEmitter} from './EventEmitter.mjs'
import {routeToThread} from './messaging.mjs'



export var MultiPlatformWorker

if (isMaster) {

	var Parent = BrowserWorker || NodeWorker

	// Subclassing native Worker or ChildProcess extension
	MultiPlatformWorker = class MultiPlatformWorker extends Parent {

		constructor(workerPath, options) {
			super(workerPath, options)
			// Node does not support transferables
			if (isNode)
				this.autoTransferArgs = false
			routeToThread(this, this)
		}

		terminate() {
			// Execute platform's standard closing procedure
			super.terminate()
			// Remove all active EE listeners to prevent memory leaks.
			this.removeAllListeners()
			// Remove listeners to prevent memory leaks
			this._killbacks.forEach(callback => callback())
		}

/*
		// Circulates the event within EventEmitter as usual and also routes it into EventSource.
		emit(event, ...args) {
			this._emitLocally(event, ...args)
			this._emitCrossThread(event, ...args)
		}

		// Only hands the event over to EventSource as 'message' event
		// NOTE: Node does not support transferables
		_emitCrossThread(event, ...args) {
			var transferables = undefined
			if (this.autoTransferArgs)
				transferables = getTransferablesDeepTraversal(args)
			this.postMessage({event, args}, transferables)
		}
*/
	}

/*
	// Only circulates the event inside EventEmitter and does not passes it to EventSource
	MultiPlatformWorker.prototype._emitLocally = EventEmitter.prototype.emit


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
*/

} else {

	// Export noop to prevent breakage in worker environment, from where creating another worker doesn't make sense
	MultiPlatformWorker = class {}

}

