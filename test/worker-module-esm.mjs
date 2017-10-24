// Utility wrapper for promisified setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis))

export function echo(arg) {
	return arg
}
export async function asyncEcho(arg, millis = 100) {
	return new Promise(resolve => {
		setTimeout(() => resolve(arg), millis)
	})
}
export var deeply = {
	nested: {
		echo: arg => arg
	}
}

export function syncHello(who = 'world') {
	return `hello ${who}`
}
export async function asyncHello(who = 'world') {
	await timeout(100)
	return `hello ${who}`
}

export function add(a, b) {
	return a + b
}
export async function compute(a, b) {
	return add(a, b) * add(a, b)
}


process.on('typeof', path => {
	var found = fachman.resolvePath(path)
	process.emit('typeis', typeof found)
})