var fs = require('fs')
var {Cluster} = require('../index.js')


console.log('node-master')

var cluster = new Cluster('./node-worker.js', 1)

var worker = cluster.pool[0]

worker.postMessage({
	name: 'hello-world'
})

console.log('node-master end')
