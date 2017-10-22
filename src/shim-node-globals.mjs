import {isBrowser, isWorker} from './platform.mjs'
import {EventEmitter} from './shim-events.mjs'


// polyfill 'global'
if (isBrowser && typeof global === 'undefined')
	self.global = self

// TODO: Hide polyfilling process in master behind option (true by default)
if (isBrowser && self.process === undefined) {

	// Shim 'process' object used for ipc in child.
	// Note: shim for master does not neet to be EventEmitter, so it's not (performance reasons)
	if (isWorker)
		self.process = new EventEmitter
	else
		self.process = {}

	process.cwd = function() {
		return location.href.substr(0, location.href.lastIndexOf('/'))
	}

}