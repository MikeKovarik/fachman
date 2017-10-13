import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'


// Routes messages from EventSource as events into EventEmitter and vice versa.
// EE mimics simplicity of Node style Emitters and uses underlying WebWorker API
// of posting messages. Events are carried in custom object {event, args} with name
// and arguments. This shields events from EventSource implementation. Mainly allows
// safe usage any event name, including 'message' in emitter.emit('message', data).
export function routeMessageEvents(eEmitter, eSource, transferArgs = true) {

	if (isNode)
		transferArgs = false

	// Only circulates the event inside EventEmitter and does not passes it to EventSource
	eEmitter.emitLocally = eEmitter.emit.bind(eEmitter)
	// TODO: use addEventListener instead and carefuly handle memory leaks (remove listeners)
	//       (mainly in master, when the worker closes)

	// Only hands the event over to EventSource as 'message' event
	eEmitter.emitToThread = (event, ...args) => {
		var transferables = undefined
		if (transferArgs)
			transferables = getTransferablesDeepTraversal(args)
		eSource.postMessage({event, args}, transferables)
	}

	// Circulates the event within EventEmitter as usual and also routes it into EventSource.
	eEmitter.emit = (event, ...args) => {
		eEmitter.emitLocally(event, ...args)
		eEmitter.emitToThread(event, ...args)
	}

	// Handles receiving 'message' events from EventSource and routes them into EventEmitter
	//eSource.addEventListener('message', onCrossThreadMessage)
	eSource.onmessage = ({data}) => {
		// Although we're only sending object with data property, we have to handle (and ignore) everything
		// that potentially gets sent from outside of this module.
		if (data.event)
			eEmitter.emitLocally(data.event, ...data.args)
		else
			eEmitter.emitLocally('message', data)
		// Hand the raw message over to onmessage property to align with Worker API
		if (eEmitter.onmessage)
			eEmitter.onmessage({data})
	}

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