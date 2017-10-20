import {isWorker, isNode, isBrowser, launchedAsWrapper} from './platform.mjs'
import {fachmanRelPath} from './platform.mjs'
import {setContext} from './worker-thread.mjs'


if (isNode && isWorker && launchedAsWrapper) {
	// This very script 'fachman' has been spawned as a child process (second argument equals __filename).
	// That means this is a worker thread and wrapping user scripts for easier context accessing is enabled.
	// Now we need to execute (by requiring) user's script he initially wanted to launch in the worker.
	var userScriptRelPath = process.argv[1]
	//userScriptRelPath = './test/' + userScriptRelPath
	//userScriptRelPath = './' + userScriptRelPath
	userScriptRelPath = sanitizePath(userScriptRelPath)
	try {
		// Try to load the path as is (it could be a whole module)
		var ctx = require(userScriptRelPath)
	} catch (e) {
		// If the loading fails, add ./ and try again
		userScriptRelPath = relativizie(userScriptRelPath)
		var ctx = require(userScriptRelPath)
	}
	// Handle transpiler/bundle ES module format using 'default' key.
	if (ctx.hasOwnProperty('default'))
		ctx = ctx['default']
	// And finally set the export context of the module as fachmans lookup input.
	setContext(ctx)

	function sanitizePath(string) {
		return string.replace(/\\/g, '/')
	}

	function relativizie(string) {
		if (!string.startsWith('./') && !string.startsWith('../'))
			return './' + string
	}
}


// Browser is capable of creating worker code dynamically in browser by turnin the code into blob and then to url.

export function createBlobUrlWrapper(workerPath, options) {
	if (options.type === 'module' && supportsWorkerModules) {
		var code = `
			import fachman from '${fachmanRelPath}'
			import * as scope from '${workerPath}'
			fachman.setScope(scope)`
	} else {
		var code = `
			importScripts('${fachmanRelPath}', '${workerPath}')
			self.fachman.setScope(scope)`
	}
	return createBlobUrl(code)
}

function createBlobUrl(string) {
	var blob = new Blob([string], {type: 'application/javascript'})
	return URL.createObjectURL(blob)
}