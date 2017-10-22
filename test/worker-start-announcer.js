if (typeof process === 'object' && process.versions && process.versions.node) {
	process.send('experience tranquility')
} else {
	self.postMessage('experience tranquility')
}