import native from 'path'


var path = native || {}

if (!path.relative) {

	function splitSections(path) {
		path = path.replace(/\\/g, '/')
		if (path.includes('://'))
			return path.slice(path.indexOf('://') + 3).split('/')
		else
			return path.split('/')
	}

	path.relative = function(from, to) {
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
	}

}

export default path