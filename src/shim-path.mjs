import native from 'path'


// WARNING: do not rename to just plain 'path' because rollup can't handle it
var _path = native || {}

if (Object.keys(_path).length === 0) {

	function sanitize(str) {
		return str.replace(/\\/g, '/')
	}

	function splitSections(str) {
		str = sanitize(str)
		if (str.includes('://'))
			str = str.slice(str.indexOf('://') + 3)
		return str.split('/')
	}

	/*_path.relative = function(from, to) {
		from = splitSections(from)
		to = splitSections(to)
		var length = Math.min(from.length, to.length)
		var sameParts = length
		for (var i = 0; i < length; i++) {
			if (from[i] !== to[i]) {
				sameParts = i
				break
			}
		}
		return Array(from.length - 1 - sameParts)
			.fill('..')
			.concat(to.slice(sameParts))
			.join('/')
	}*/

	_path.join = function(...args) {
		return _path.normalize(args.join('/'))
	}

	_path.normalize = function(str) {
		var protocol = ''
		if (str.includes('://')) {
			var index = str.indexOf('://')
			protocol = str.slice(0, index + 3)
			str = str.slice(index + 3)
		}
		return protocol + normalizeArray(str.split('/')).join('/')
	}

	_path.dirname = function(str) {
		return str.substr(0, str.lastIndexOf('/'))
	}

	function normalizeArray(parts, allowAboveRoot) {
		var res = []
		for (var i = 0; i < parts.length; i++) {
			var p = parts[i]
			if (!p || p === '.')
				continue
			if (p === '..') {
				if (res.length && res[res.length - 1] !== '..')
					res.pop()
				else if (allowAboveRoot)
					res.push('..')
			} else {
				res.push(p)
			}
		}
		return res
	}

}

export default _path

export function getCwd() {
	if (typeof process === 'object' && process.cwd)
		return process.cwd()
	else
		return _path.dirname(location.href)
}