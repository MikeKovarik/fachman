import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {EventEmitter} from './shims.mjs'
import {routeMessageEvents} from './messaging.mjs'


if (isWorker) {
	// Create EventEmitter for serving events from onmessage/postMessage Worker messaging API
	let emitter = new EventEmitter
	// Hook EventEmitter into self.onmessage and start handling messages.
	// TODO: Make autoTransferArgs configurable from within worker as well.
	//       For now it's hardcoded true (thus all worker data are transfered back to master)
	routeMessageEvents(emitter, self, true)
	// Extend worker 'self' scope with EventEmitter methods.
	let descriptors = Object.getOwnPropertyDescriptors(EventEmitter.prototype)
	Object.keys(descriptors)
		.filter(name => name !== 'constructor' && !name.startsWith('_'))
		.forEach(key => self[key] = emitter[key].bind(emitter))
	// Start listening from communication from master and handle tasks
	self.on('task-start', executeTask)

	// TODO: test if this is necessary (node's cluster worker fires this automatically)
	self.emit('online')

	// TODO: test if node can see termination of its child and only use this is browser.
	let originalClose = self.close.bind(self)
	self.close = () => {
		// Notify master about impending end of the thread
		self.emit('exit', 0)
		// Kill the thread
		setTimeout(originalClose)
	}
}

async function executeTask(task) {
	var {id, path, args} = task
	var theMethod = getMethod(path)
	var status = false
	var payload
	if (!theMethod) {
		let {name, message, stack} = new Error(`${path} is not a function (inside a worker)`)
		payload = {name, message, stack}
	} else try {
		status = true
		payload = await theMethod(...args)
	} catch(err) {
		let {name, message, stack} = err
		name = name.replace(/theMethod/g, path)
		message = message.replace(/theMethod/g, path)
		payload = {name, message, stack}
	}
	self.emit('task-end', {id, status, payload})
}

function getMethod(path, scope = self) {
	if (path.includes('.')) {
		var sections = path.split('.')
		var section
		while (section = sections.shift())
			scope = scope[section]
		return scope
	} else {
		return scope[path]
	}
}