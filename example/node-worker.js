
require('../index.js')

var _log = console.log.bind(console)
console.log = (...args) => _log('#', ...args)


console.log('node-worker')


self.addEventListener('message', e => {
	var {data} = e
	console.log('received data from master', data)
	self.postMessage({
		name: 'response'
	})
})