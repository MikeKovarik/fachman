import events from 'events'


export var EventEmitter = events && events.EventEmitter

if (!EventEmitter) {

	// Custom tiny EventEmitter sim so that we don't have to rely on 3rd party package if its not present.
	// Mainly in browser.
	// Note: using unshift() (and looping backwards) instead of push() to prevent
	//       issues with self-removing once() listeners
	EventEmitter = function EventEmitter() {
		this._map = new Map
	}

	EventEmitter.prototype._getEventCallbacks = function(name) {
		if (!this._map.has(name))
			this._map.set(name, [])
		return this._map.get(name)
	}

	EventEmitter.prototype.emit = function(name, ...args) {
		var callbacks = this._getEventCallbacks(name)
		var i = callbacks.length
		while (i--) {
			callbacks[i](...args)
		}
	}

	EventEmitter.prototype.on = function(name, cb) {
		this._getEventCallbacks(name).unshift(cb)
	}

	EventEmitter.prototype.once = function(name, cb) {
		var oneTimeCb = (...args) => {
			this.removeListener(name, oneTimeCb)
			cb(...args)
		}
		this.on(name, oneTimeCb)
	}

	EventEmitter.prototype.removeListener = function(name, cb) {
		removeFromArray(this._getEventCallbacks(name), cb)
	}

	EventEmitter.prototype.removeAllListeners = function(name) {
		if (name)
			this._map.delete(name)
		else
			this._map.clear()
	}

}