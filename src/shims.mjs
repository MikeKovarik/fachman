import net from 'net'
import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {removeFromArray} from './util.mjs'
import {shimBrowserIpc, routeToEventSource} from './messaging.mjs'
import {shimNodeIpc, routeToEventEmitter} from './messaging.mjs'
import {routeToThread} from './messaging.mjs'
import {EventEmitter} from './EventEmitter.mjs'


// polyfill 'global'
if (isBrowser && typeof global === 'undefined')
	self.global = self


if (isBrowser && isWorker) {
	// Get or shim 'process' object used for ipc in child
	if (self.process === undefined)
		self.process = global.process = new EventEmitter
		//global.process = new EventEmitter

	process.send = self.postMessage.bind(self)
	process.postMessage = self.postMessage.bind(self)
	// process.send is Node's IPC equivalent of Browser's postMessage()
	shimNodeIpc(process, self)
	// Route self.addEventListener('message') messages into EventEmitter.on('message')
	routeToEventEmitter(process, self)

	//process.send = message => self.postMessage(message)
	//process.emit = ...
	//process.on = ...
	//process.removeListener = ...

	// TODO: test if node can see termination of its child and only use this is browser.
	let originalClose = self.close.bind(self)
	// Create process.kill() and ovewrite worker's close() to notify parent thread about closing.
	process.kill = self.close = () => {
		// Notify master about impending end of the thread
		process.emit('exit', 0)
		// Kill the thread
		setTimeout(originalClose)
	}
	// Shim Node's require() with importScript()
	//global.require = arg => importScripts(arg)

	// TODO: test if this is necessary (node's cluster worker fires this automatically)
	process.emit('online')
}


// Quick & dirty shim for messaging API used within Worker.
if (isNode && isWorker) {
	// polyfill 'self'
	if (global.self === undefined)
		global.self = global

	self.postMessage = process.send.bind(process)
	// Shim browser's IPC self.postMessage
	shimBrowserIpc(self, process)
	// Route EventEmitter.on('message') events into self.addEventListener('message')
	routeToEventSource(self, process)

	//self.postMessage = message => process.send(message)
	//self.addEventListener = addEventListener.bind(process)
	//self.removeEventListener = removeEventListener.bind(process)

	// Shim browser's close method to kill Worker thread
	self.close = () => process.exit(0)
	// Shim browser's importScript() with require()
	self.importScripts = (...args) => args.forEach(require)
}

if (isWorker) {
	routeToThread(process, process)
}
