import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'


var context

// Worker's is by default not wrapped (unless user bundles his code) and context points to 'self' global object.
// All defined functions and variables (that are not inside another block scope) are therefore also globals
// that we can acces in 'self'
if (isBrowser)
	context = self

// Node module code is wrapped and has custom inaccessible context. Scope 'this' points to an useless empty object.
// By an off chance that user puts their methods in global we start with that and offer to use setScope(exports).
if (isNode)
	context = global

export function setContext(newContext) {
	context = newContext
}

if (isWorker) {

	// Start listening from communication from master and handle tasks
	process.on('task-start', executeTask)

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
		process.emit('task-end', {id, status, payload})
	}

	function getMethod(path) {
		var scope = context
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

}