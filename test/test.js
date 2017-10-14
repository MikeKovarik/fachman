var isBrowser = typeof window === 'object'

if (isBrowser) {
	mocha.setup('bdd')
} else {
	var chai = require('chai')
	var fachman = require('../index.js')
}

var assert = chai.assert

var {Cluster, ProxyWorker, EventEmitter, Worker, isNode, isBrowser} = fachman

// Utility wrapper for promisified setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve), millis)



describe('library', () => {
	it('should export Cluster',           () => assert.exists(Cluster))
	it('should export ProxyWorker',       () => assert.exists(ProxyWorker))
	it('should export EventEmitter shim', () => assert.exists(EventEmitter))
	it('should export Worker shim',       () => assert.exists(Worker))
})

function isClosed(pw) {
	assert.isFalse(pw.running)
	//assert.isFalse(pw.idle)
	assert.isFalse(pw.online)
}

describe('ProxyWorker', () => {

	describe('lifecycle', () => {

		it('should create worker thread', () => {
			var pw = new ProxyWorker('test-worker.js')
			assert.exists(pw.worker)
			pw.terminate()
		})

		it('.terminate() should kill worker thread', async () => {
			var pw = new ProxyWorker('test-worker.js')
			await timeout(100)
			pw.terminate()
			await timeout(20)
			isClosed(pw)
			// TODO
		})

		it('.kill() should kill worker thread', async () => {
			var pw = new ProxyWorker('test-worker.js')
			await timeout(100)
			pw.kill()
			isClosed(pw)
			// TODO
		})

		it(`.online property starts as 'false', turns 'true' when worker is ready, and 'false' when it's terminated`, done => {
			var pw = new ProxyWorker('test-worker.js')
			assert.isFalse(pw.online, '.online should be false at the beggining')
			pw.once('online', () => {
				assert.isTrue(pw.online, `.online should be true before after 'online' event is fired from worker`)
				pw.kill()
			})
			pw.once('exit', () => {
				assert.isFalse(pw.online, '.online should be false after closing the thread')
				done()
			})
		})

		it(`created thread should fire 'online' event`, done => {
			var pw = new ProxyWorker('test-worker.js')
			pw.on('online', () => {
				pw.terminate()
				done()
			})
		})

		it(`closing thread should fire 'exit' event`, done => {
			var pw = new ProxyWorker('test-worker.js')
			pw.on('exit', done)
			setTimeout(() => pw.terminate(), 100)
		})

		it(`closing thread gracefuly should fire 'exit' event with code 0`, done => {
			var pw = new ProxyWorker('test-worker.js')
			pw.on('exit', code => {
				assert.equal(code, 0)
				done()
			})
			setTimeout(() => pw.terminate(), 100)
		})


		it(`.ready promise exists`, async () => {
			// TODO
			var pw = new ProxyWorker('test-worker.js')
			assert.exists(pw.ready)
			assert.equal(pw.ready.constructor, Promise)
		})

/*
		if (isNode) {
			// TODO: figure out a way to forcibly kill thread so that it returns 1
			it(`closing/killing thread should fire 'exit' event with code 1`, done => {
				var pw = new ProxyWorker('test-worker.js')
				await timeout(100)
				pw.on('exit', code => {
					assert.equal(code, 0)
					done()
				})
				pw.kill()
			})
		}
*/

		it('closing thread should clean up listeners and cancel tasks', done => {
			var pw = new ProxyWorker('test-worker.js')
			pw.on('exit', () => {
				assert.isEmpty(pw._taskResolvers)
				done()
			})
			setTimeout(() => pw.terminate(), 100)
		})

	})

	describe('master-worker communication', () => {

		// fixture worker
		var pw
		var worker
		before(async () => {
			pw = new ProxyWorker('test-worker.js')
			worker = pw.worker
		})
		after(async () => pw.terminate())

		it(`worker.postMessage(...) should be available native or polyfilled`, () => {
			assert.isFunction(worker.postMessage)
		})

		it(`worker.addEventListener('message', ...) should be available native or polyfilled`, () => {
			assert.isFunction(worker.addEventListener)
		})

		it(`worker.send(...) should be available native or polyfilled`, () => {
			assert.isFunction(worker.send)
		})

		it(`worker.on('message', ...) should be available native or polyfilled`, () => {
			assert.isFunction(worker.on)
		})

		it(`pw.emit(...) should be available native or polyfilled`, () => {
			assert.isFunction(pw.emit)
		})

		it(`pw.on(...) should be available native or polyfilled`, () => {
			assert.isFunction(pw.on)
		})

		it(`raw .postMessage() / .addEventListener('message')`, done => {
			worker.postMessage('hello-self')
			worker.addEventListener('message', ({data}) => {
				if (data === 'hello from self') done()
			})
		})

		it(`raw .send() / .on('message')`, done => {
			worker.send('hello-process')
			worker.on('message', data => {
				if (data === 'hello from process') done()
			})
		})

		it(`EventEmitter styled .emit() / .on() with custom events`, done => {
			pw.emit('custom-event', ['hello', 'worker'])
			pw.on('custom-reply', data => {
				console.log('pw on custom-reply')
				if (data === 'hello master') done()
			})
		})

	})


	describe('task invocation', () => {

		// fixture worker
		var pw, proxy
		before(async () => {
			pw = new ProxyWorker('test-worker.js')
			proxy = pw.proxy
		})
		after(async () => pw.terminate())

		it(`invokeTask()`, async () => {
			var startTime = Date.now()
			var input = 'this will get returned in 100ms'
			var output = await pw.invokeTask({
				path: 'asyncEcho',
				args: [input, 100]
			})
			assert.equal(input, output)
			// There's 100ms delay inside the function, the rest (messaging in and out)
			// should take another 100ms at most
			assert.isBelow(Date.now() - startTime, 200)
		})

		it('proxy should handle simple sync methods', async () => {
			var result = await proxy.syncHello()
			assert.equal(result, 'hello world')
		})

		it('proxy should handle simple async methods', async () => {
			var result = await proxy.asyncHello()
			assert.equal(result, 'hello world')
		})

		it('proxy should handle simple sync methods', async () => {
			var result = await proxy.deeply.nested.syncHello()
			assert.equal(result, 'hello world')
		})

		it('proxy should handle simple async methods', async () => {
			var result = await proxy.deeply.nested.asyncHello()
			assert.equal(result, 'hello world')
		})

		it('proxy should handle arguments and return result', async () => {
			// returns 2+3 * 2+3
			var result = await proxy.compute(2, 3)
			assert.equal(result, 25)
		})

		it(`tasks should be removed from _taskResolvers after finishing`, async () => {
			assert.isEmpty(pw._taskResolvers)
			var promise1 = proxy.asyncHello()
			assert.equal(pw._taskResolvers.size, 1)
			var promise2 = proxy.syncHello()
			var promise3 = proxy.echo('foo')
			assert.equal(pw._taskResolvers.size, 3)
			await Promise.all([promise1, promise2, promise3])
			assert.isEmpty(pw._taskResolvers)
		})

	})


	describe('shared memory & transferables (only available in Web Workers = browser)', () => {

		// TypedArray, ArrayBuffer, SharedArrayBuffer and transferables is only available in browsers.
		// No need to test it in browser.
		if (isNode) return

		// fixture worker
		var pw, proxy
		beforeEach(async () => {
			pw = new ProxyWorker('test-worker.js')
			proxy = pw.proxy
		})
		afterEach(async () => pw.terminate())

		// fixture data
		var string = 'hello world'
		var array = stringToArray(string)

		it(`plain Object isn't transfered. String and Number properties are kept in the main thread's memory`, async () => {
			var input = {
				number: 42,
				string: 'Zenyatta'
			}
			var promise = proxy.echo(input)
			assert.equal(input.number, 42)
			assert.equal(input.string, 'Zenyatta')
			var output = await promise
			assert.equal(input.number, 42)
			assert.equal(input.string, 'Zenyatta')
			assert.equal(input.number, output.number)
			assert.equal(input.string, output.string)
		})

		it(`Uint8Array is transfered from the main thread's memory into worker`, async () => {
			var input = new Uint8Array(array)
			assert.lengthOf(input, 11)
			var promise = proxy.echo(input)
			assert.lengthOf(input, 0)
			await promise
		})

		it(`ArrayBuffer is transfered from the main thread's memory into worker`, async () => {
			var inputUin8Array = new Uint8Array(array)
			var arrayBuffer = inputUin8Array.buffer
			assert.equal(arrayBuffer.byteLength, 11)
			var promise = proxy.echo(arrayBuffer)
			assert.equal(arrayBuffer.byteLength, 0)
			await promise
		})

		it(`ArrayBuffer is transfered to and then back from worker`, async () => {
			var inputView = new Uint8Array(array)
			var input = inputView.buffer
			assert.lengthOf(inputView, 11)
			assert.equal(input.byteLength, 11)
			var output = await proxy.echo(input)
			// Original input view buffer and related view has been transferred to worker
			assert.lengthOf(inputView, 0)
			assert.equal(input.byteLength, 0)
			// Output from worker is not the same buffer/view instance, but has the same size & value
			var outputView = new Uint8Array(output)
			assert.lengthOf(outputView, 11)
			assert.equal(output.byteLength, 11)
			// output from worker has to retain the same type
			assert.equal(output.constructor, ArrayBuffer)
		})

		it(`Uint8Array is transfered to and then back from worker`, async () => {
			var input = new Uint8Array(array)
			assert.lengthOf(input, 11)
			var output = await proxy.echo(input)
			assert.lengthOf(input, 0)
			assert.lengthOf(output, 11)
			// output from worker has to retain the same type
			assert.equal(output.constructor, Uint8Array)
		})

		it(`SharedArrayBuffer is shared with worker and accessible by both threads`, async () => {
			var sab = new SharedArrayBuffer(4)
			var view = new Uint8Array(sab)
			assert.lengthOf(view, 4)
			assert.equal(sab.byteLength, 4)
			var promise = proxy.echo(sab)
			assert.lengthOf(view, 4)
			assert.equal(sab.byteLength, 4)
			var output = await promise
			assert.lengthOf(view, 4)
			assert.equal(sab.byteLength, 4)
			assert.equal(output.constructor, SharedArrayBuffer)
		})

		it(`Uint8Array can be transfered tom modified by and transfered back from worker`, async () => {
			var input = createFixture().uint8array
			// original content
			assert.equal(toString(input), 'hello world')
			var output = await proxy.modifyView(input)
			assert.equal(toString(output), 'hello work!')
		})

		it(`ArrayBuffer can be transfered tom modified by and transfered back from worker`, async () => {
			var input = createFixture().arrayBuffer
			// original content
			assert.equal(toString(input), 'hello world')
			var output = await proxy.modifyView(input)
			assert.equal(toString(output), 'hello work!')
		})

		it(`SharedArrayBuffer can be modified by worker`, async () => {
			var {uint8array} = createFixture()
			var input = sabFromTypedArray(uint8array)
			// original content
			assert.equal(toString(input), 'hello world')
			var output = await proxy.modifyView(input)
			// worker modifier content of sab
			assert.equal(toString(input), 'hello work!')
			// and also returned the same sab
			assert.equal(toString(output), 'hello work!')
		})

	})


	describe('copying data into worker (mainly used in Node)', () => {

		// TODO - add a lot of tests with Node Buffers

		it(`should do something`, async () => {
			assert.equal(true, false)
		})

	})

})


describe('Cluster', () => {

	// TODO

	it(`worker should be removed from .workers if it's closed`, done => {
		var cluster = new Cluster('test-worker.js', 1)
		cluster.ready.then(() => {
			var pw = cluster.workers[0]
			pw.once('exit', () => {
				// note: using equals and not isEmpty because chai would cause problems with proxy
				assert.equal(cluster.workers.length, 0)
				done()
			})
			pw.kill()
		})
	})

	it(`worker should be removed from .idleWorkers if it's closed`, done => {
		var cluster = new Cluster('test-worker.js', 1)
		cluster.ready.then(() => {
			var pw = cluster.workers[0]
			pw.once('exit', () => {
				// note: using equals and not isEmpty because chai would cause problems with proxy
				assert.equal(cluster.idleWorkers.size, 0)
				done()
			})
			pw.kill()
		})
	})

	it(`worker should be removed from .runningWorkers if it's closed`, done => {
		var cluster = new Cluster('test-worker.js', 1)
		cluster.ready.then(() => {
			var pw = cluster.workers[0]
			pw.once('exit', () => {
				// note: using equals and not isEmpty because chai would cause problems with proxy
				assert.equal(cluster.runningWorkers.size, 0)
				done()
			})
			pw.kill()
		})
	})

	it(`.ready promise exists`, async () => {
		var cluster = new Cluster('test-worker.js', 1)
		assert.exists(cluster.ready)
		assert.equal(cluster.ready.constructor, Promise)
	})

	it(`.ready resolves once all worker threads are ready`, done => {
		// TODO
		var cluster = new Cluster('test-worker.js', 1)
		cluster.ready.then(() => {
			cluster.workers.forEach(worker => {
				assert.isTrue(worker.online)
				done()
			})
		})
	})

})


describe('process', () => {

	var workerPath = 'test-worker.js'
	var pw
/*
	before(done => {
		pw = new ProxyWorker(workerPath)
		pw.process.once('exit', code => {
			exitCode = code
			done()
		})
	})
	it('exit code should be zero', () => {
		assert.equal(exitCode, 0)
	})
*/

	function createTypeOfQuery(path) {
		var id = Math.random().toFixed(10).slice(2)
		return {id, typeof: path}
	}
	function getTypeOfBrowser(worker, path) {
		return new Promise(resolve => {
			var query = createTypeOfQuery(path)
			worker.postMessage(query)
			worker.addEventListener('message', ({data}) => {
				if (data.id === query.id)
					resolve(data.result)
			})
		})
	}
	function getTypeOfNode(worker, path) {
		return new Promise(resolve => {
			var query = createTypeOfQuery(path)
			worker.send(query)
			worker.on('message', data => {
				if (data.id === query.id)
					resolve(data.result)
			})
		})
	}

	if (isBrowser) describe('browser Worker', () => {
		var pw
		before(async () => pw = new ProxyWorker(workerPath))
		after(async () => pw.terminate())

		it('native self should be available', async () => {
			var type = await getTypeOfBrowser(pw.worker, 'process')
			assert.equal(type, 'object')
		})
		it('native self.addEventListener() / self.postMessage() should be available', async () => {
			var type1 = await getTypeOfBrowser(pw.worker, 'addEventListener')
			assert.equal(type1, 'function')
			var type2 = await getTypeOfBrowser(pw.worker, 'postMessage')
			assert.equal(type2, 'function')
		})
		it('process should be shimmed', async () => {
			var type = await getTypeOfBrowser(pw.worker, 'process')
			assert.equal(type, 'object')
		})

		//it('process is shimmed', async () => {
		//	var type = await pw.proxy.getType('process')
		//	assert.equals(type, 'object')
		//})

		/*it('require() is alias for importScripts()', async () => {
			assert.isFalse(true)
		})*/
	})

	if (isNode) describe('node ChildProcess', () => {
		var pw
		before(async () => pw = new ProxyWorker(workerPath))
		after(async () => pw.terminate())

		it('self is shimmed', async () => {
			var type = await getTypeOfNode(pw.worker, 'self')
			assert.equal(type, 'object')
		})

		//it('self is shimmed', async () => {
		//	console.log('before')
		//	var type = await pw.proxy.getType('self')
		//	console.log('after')
		//	assert.equals(type, 'object')
		//})
/*
		it('self.addEventListener() is shimmed', async () => {
			assert.isFalse(true)
		})

		it('self.postMessage() is shimmed', async () => {
			assert.isFalse(true)
		})

		it('importScripts() is alias for (multiple) require()', async () => {
			assert.isFalse(true)
		})*/
	})

	it('self.close() should gracefuly close the worker from within', async () => {
		var pw = new ProxyWorker(workerPath)
		// Emit that tells worker to trigge self.close() in 300ms
		pw.emit('kys-close')
		await timeout(400)
		isClosed(pw)
	})

	it('process.kill() should gracefuly close the worker from within', async () => {
		var pw = new ProxyWorker(workerPath)
		// Emit that tells worker to trigge process.kill() in 300ms
		pw.emit('kys-process-kill')
		await timeout(400)
		isClosed(pw)
	})

	// TODO

})


function createFixture() {
	var string = 'hello world'
	var array = stringToArray(string)
	var uint8array = new Uint8Array(array)
	var arrayBuffer = uint8array.buffer
	return {string, array, uint8array, arrayBuffer}
}

function sabFromTypedArray(typedArray) {
	var sab = new SharedArrayBuffer(typedArray.length)
	var view = new Uint8Array(sab)
	for (var i = 0; i < typedArray.length; i++) {
		view[i] = typedArray[i]
	}
	return sab
}

function sharedArrayBufferFromArrayBuffer(arrayBuffer) {
	var arrayBuffer = (new Buffer('hello world')).buffer
	var abView = new Uint8Array(arrayBuffer)
	var sab = new SharedArrayBuffer(arrayBuffer.byteLength)
	var sabView = new Uint8Array(sab)
	for (var i = 0; i < abView.length; i++) {
		sabView[i] = abView[i]
	}
	return sab
}


function stringToArray(string) {
	return string
		.split('')
		.map((char, i) => string.charCodeAt(i))
}

function arrayToString(array) {
	return Array.from(array)
		.map(code => String.fromCharCode(code))
		.join('')
}

function toString(arg) {
	if (!arg) return
	var ctor = arg.constructor
	//console.log(arg)
	if (ctor === ArrayBuffer || ctor === SharedArrayBuffer)
		arg = new Uint8Array(arg)
	//console.log(arg)
	if (Array.isArray(arg) || arg instanceof Uint8Array)
		return arrayToString(arg)
	else
		return arg.toString()
}

/*
assert.typeOf(foo, 'string');
assert.equal(foo, 'bar');
assert.lengthOf(foo, 3)
assert.property(tea, 'flavors');
assert.lengthOf(tea.flavors, 3);
*/

if (isBrowser)
	mocha.run()

