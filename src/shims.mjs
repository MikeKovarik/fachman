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

if (isWorker) {

	if (isBrowser) {
		// Get or shim 'process' object used for ipc in child
		if (self.process === undefined)
			self.process = global.process = new EventEmitter
			//global.process = new EventEmitter

		process.send = self.postMessage.bind(self)
		process.postMessage = self.postMessage.bind(self)
		// process.send is Node's IPC equivalent of Browser's postMessage()
		//shimNodeIpc(process, self)
		// Route self.addEventListener('message') messages into EventEmitter.on('message')
		routeToEventEmitter(process, self)

		//process.send = message => self.postMessage(message)
		//process.emit = ...
		//process.on = ...
		//process.removeListener = ...

		// TODO: test if node can see termination of its child and only use this is browser.
		let originalClose = self.close.bind(self)
		// Create process.kill() and ovewrite worker's close() to notify parent thread about closing.
		process.kill = (pid, signal) => {
			// TODO
		}
		process.exit = self.close = (code = 0) => {
			// Notify master about impending end of the thread
			// NOTE: using postMessage({...}) instead od process.emit('exit', code) because emit would get delayed
			//       inside EventEmitter with nextTick and wouldn't surface to parent in time. postMessage is sync.
			self.postMessage({event: 'exit', args: [code]})
			// Kill the thread
			setTimeout(originalClose)
		}
		// Shim Node's require() with importScript()
		//global.require = arg => importScripts(arg)
	}

	// Quick & dirty shim for messaging API used within Worker.
	if (isNode) {
		// polyfill 'self'
		if (global.self === undefined)
			global.self = global

		self.postMessage = process.send.bind(process)
		// Shim browser's IPC self.postMessage
		//shimBrowserIpc(self, process)
		// Route EventEmitter.on('message') events into self.addEventListener('message')
		routeToEventSource(self, process)

		//self.postMessage = message => process.send(message)
		//self.addEventListener = addEventListener.bind(process)
		//self.removeEventListener = removeEventListener.bind(process)

		// Shim browser's close method to kill Worker thread
		self.close = (code = 0) => process.exit(code)
		// Shim browser's importScript() with require()
		self.importScripts = (...args) => args.forEach(require)
	}

	// Establish inter-process EventEmitter so we can easily just .emit('name', arg) without
	// additional bootstrapping and messing with postMessage/send on one side, and addEventListener/on
	// on the other. Events in the parent will be emitted in the MultiPlatformWorker instance of this worker.
	// Just like emitting event into that instance will make it appear here in the worker as well.
	routeToThread(process, process)

	// Now that we've established inter-process EventEmitter...
	// Emit 'online' event to the parent, similar to what Node cluster module does.
	// Note: Only 'cluster' module does it, so 'child_process' and its ChildProcess we're using here
	//       still needs us to manually fire the 'online' event
	process.emit('online')

}
