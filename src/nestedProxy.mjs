var pathSymbol = Symbol('Proxy path')
var onCallSymbol = Symbol('Proxy onCall')

var proxyProto = {
	get(target, name) {
		var onCall = target[onCallSymbol]
		var path = target[pathSymbol]
		function proxyFunctionInvoker(path, ...args) {
			return onCall({
				path: path.join('.'),
				args
			})
		}
		return createNestedProxy(proxyFunctionInvoker, onCall, [...path, name])
	},
	apply(target, thisArg, args) {
		var path = target[pathSymbol]
		return target(path, ...args)
	}
}

export function createNestedProxy(target, onCall, path = []) {
	target[pathSymbol] = path
	target[onCallSymbol] = onCall
	return new Proxy(target, proxyProto)
}