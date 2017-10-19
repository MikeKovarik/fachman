if (typeof require === 'function')
	var fachman = require('../index.js')
else
	importScripts('../index.js')


function echo(arg) {
	return arg
}
async function asyncEcho(arg, millis = 100) {
	return new Promise(resolve => {
		setTimeout(() => resolve(arg), millis)
	})
}
var deeply = {
	nested: {
		echo: arg => args
	}
}

function syncHello(who = 'world') {
	return `hello ${who}`
}
async function asyncHello(who = 'world') {
	await timeout(100)
	return `hello ${who}`
}

function add(a, b) {
	return a + b
}
async function compute(a, b) {
	return add(a, b) * add(a, b)
}


fachman.register(echo)
fachman.register(asyncHello)
fachman.register(deeply, 'deeply')
fachman.register(syncHello)
fachman.register(asyncHello)
fachman.register(compute)


process.on('typeof', path => {
	var found = fachman.walkPath(path)
	process.emit('typeis', typeof found)
})