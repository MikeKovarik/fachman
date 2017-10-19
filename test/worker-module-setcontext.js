if (typeof require === 'function')
	var fachman = require('../index.js')
else
	importScripts('../index.js')


var customContext = {}
fachman.setContext(customContext)

customContext.echo = function(arg) {
	return arg
}
customContext.asyncEcho = async function(arg, millis = 100) {
	return new Promise(resolve => {
		setTimeout(() => resolve(arg), millis)
	})
}
customContext.deeply = {
	nested: {
		echo: arg => args
	}
}

customContext.syncHello = function(who = 'world') {
	return `hello ${who}`
}
customContext.asyncHello = async function(who = 'world') {
	await timeout(100)
	return `hello ${who}`
}

function add(a, b) {
	return a + b
}
customContext.compute = async function(a, b) {
	return add(a, b) * add(a, b)
}


process.on('typeof', path => {
	var found = fachman.walkPath(path)
	process.emit('typeis', typeof found)
})