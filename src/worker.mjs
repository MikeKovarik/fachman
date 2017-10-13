import {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import {EventEmitter} from './shims.mjs'


if (isWorker) {
	// Start listening from communication from master and handle tasks
	process.on('task-start', executeTask)
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
	process.emit('task-end', {id, status, payload})
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