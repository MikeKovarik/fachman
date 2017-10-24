// Utility wrapper for promisified setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis))

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
		echo: arg => arg
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


process.on('typeof', path => {
	var found = fachman.resolvePath(path)
	process.emit('typeis', typeof found)
})