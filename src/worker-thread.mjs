import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'


// Create 
var defaultContext = {}

// Shim module.exports and expots and point it to defaultContext.
// TODO: Hide module + exports in master behind option (true by default)
if (isBrowser && isWorker) {
	if (global.exports === undefined)
		global.exports = {}
	if (global.module === undefined)
		global.module = {exports: global.exports}
	defaultContext = global.exports
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

// List of contexts where we'll be location methods to execute
export var contexts = [fallbackContext, defaultContext]

// Adds user-selected/created context to the list of searchable contexts
export function setContext(customContext = {}) {
	contexts.push(customContext)
	return customContext
}

// User can register selected methods instead of setting whole context
export function register(value, name = value.name) {
	defaultContext[name] = value
}

export function resolvePath(path) {
	var result
	var ci = contexts.length
	if (path.includes('.')) {
		var pathSections = path.split('.').reverse()
		var section
		while (result === undefined && ci--) {
			let context = contexts[ci]
			let si = pathSections.length
			while (si--) {
				section = pathSections[si]
				context = context[section]
				if (context === undefined) break
			}
			result = context
		}
	} else {
		while (result === undefined && ci--)
			result = contexts[ci][path]
	}
	return result
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
			console.error(err)
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