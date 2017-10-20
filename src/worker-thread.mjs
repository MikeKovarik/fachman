import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'


if (isWorker) {
	if (isBrowser) {
		if (global.exports === undefined)
			global.exports = {}
		if (global.module === undefined)
			global.module = {
				exports: global.exports
			}
		var defaultContext = global.exports
	} else {
		var defaultContext = {}
	}
	//process.setContext = setContext
	//process.register = register
}

// Worker's is by default not wrapped (unless user bundles his code) and context points to 'self' global object.
// All defined functions and variables (that are not inside another block scope) are therefore also globals
// that we can acces in 'self'
if (isBrowser)
	var fallbackContext = self

// Node module code is wrapped and has custom inaccessible context. Scope 'this' points to an useless empty object.
// By an off chance that user puts their methods in global we start with that and offer to use setScope(exports).
if (isNode)
	var fallbackContext = global

var contexts = [fallbackContext, defaultContext]

export function setContext(customContext) {
	contexts.push(customContext)
}

export function register(value, name = value.name) {
	defaultContext[name] = value
}

export function resolvePath(path) {
	var result
	var context
	var ci = contexts.length
	if (path.includes('.')) {
		var sections = path.split('.').reverse()
		var section
		while (!result && --ci) {
			context = contexts[ci]
			let si = sections.length
			while (section = sections[--si])
				context = context[section]
			result = context
		}
		return result
	} else {
		while (!result && --ci) {
			result = contexts[ci][path]
		}
		return result
	}
}

if (isWorker) {

	// Start listening from communication from master and handle tasks
	process.on('task-start', executeTask)

	async function executeTask(task) {
		var {id, path, args} = task
		var theMethod = resolvePath(path)
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
		process.emit('task-end', {id, status, payload})
	}

	// Now that we've established inter-process EventEmitter...
	// Emit 'online' event to the parent, similar to what Node cluster module does.
	// Note: Only 'cluster' module does it, so 'child_process' and its ChildProcess we're using here
	//       still needs us to manually fire the 'online' event
	// Note: In some cases it is critical to not emit (and subsequently using postMessage) immediately during
	//       setup phase. It will silently throw in wrapped worker. We need to postpone 'online' event until end of event loop.
	setTimeout(() => process.emit('online'))

}