if (typeof require === 'function')
	require('../index.js')
else
	importScripts('../index.js')


process.on('kys', code => {
	if (fachman.isNode)
		process.exit(code)
	else
		close(code)
})

process.on('kys-close', code => {
	close(code)
})

process.on('kys-process-exit', code => {
	process.exit(code)
})

process.on('kys-process-kill', signal => {
	process.kill(process.pid, signal)
})
