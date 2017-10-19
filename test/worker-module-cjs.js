exports.echo = function(arg) {
	return arg
}
exports.asyncEcho = async function(arg, millis = 100) {
	return new Promise(resolve => {
		setTimeout(() => resolve(arg), millis)
	})
}
exports.deeply = {
	nested: {
		echo: arg => args
	}
}

exports.syncHello = function(who = 'world') {
	return `hello ${who}`
}
exports.asyncHello = async function(who = 'world') {
	await timeout(100)
	return `hello ${who}`
}

function add(a, b) {
	return a + b
}
exports.compute = async function(a, b) {
	return add(a, b) * add(a, b)
}


process.on('typeof', path => {
	var found = fachman.walkPath(path)
	process.emit('typeis', typeof found)
})