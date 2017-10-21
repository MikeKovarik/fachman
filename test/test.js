var isBrowser = typeof window === 'object'

if (isBrowser) {
	mocha.setup('bdd')
} else {
	var chai = require('chai')
	var fachman = require('../index.js')
}

var assert = chai.assert

var {Cluster, ProxyWorker, MultiPlatformWorker, EventEmitter, isNode, isBrowser} = fachman

// Utility wrapper for promisified setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve), millis)



describe('library', () => {
	it('should export Cluster',             () => assert.exists(Cluster))
	it('should export ProxyWorker',         () => assert.exists(ProxyWorker))
	it('should export EventEmitter shim',   () => assert.exists(EventEmitter))
	it('should export MultiPlatformWorker', () => assert.exists(MultiPlatformWorker))
})

function isClosed(worker) {
	assert.isFalse(worker.running)
	//assert.isFalse(worker.idle)
	assert.isFalse(worker.online)
}

var workerPath = 'test-worker.js'

describe('ProxyWorker', () => {
/*
	it('module', async () => {
		var worker = new ProxyWorker('test-module.mjs')
		await timeout(1000)
		worker.terminate()
	})
*/
	describe('lifecycle', () => {

		it('should create worker thread', () => {
			var worker = new ProxyWorker(workerPath)
			assert.exists(worker.postMessage)
			assert.exists(worker.addEventListener)
			worker.terminate()
		})

		it('.terminate() should kill worker thread', async () => {
			var worker = new ProxyWorker(workerPath)
			await timeout(100)
			worker.terminate()
			await timeout(20)
			isClosed(worker)
			// TODO
		})

		it('.kill() should kill worker thread', async () => {
			var worker = new ProxyWorker(workerPath)
			await timeout(100)
			worker.kill()
			await timeout(20)
			isClosed(worker)
			// TODO
		})

		it(`.online property starts as 'false', turns 'true' when worker is ready, and 'false' when it's terminated`, done => {
			var worker = new ProxyWorker(workerPath)
			assert.isFalse(worker.online, '.online should be false at the beggining')
			worker.once('online', () => {
				assert.isTrue(worker.online, `.online should be true before after 'online' event is fired from worker`)
				worker.kill()
			})
			worker.once('exit', () => {
				assert.isFalse(worker.online, '.online should be false after closing the thread')
				done()
			})
		})

	})


	describe('lifecycle events', () => {

		it(`created thread should fire 'online' event`, done => {
			var worker = new ProxyWorker(workerPath)
			worker.on('online', () => {
				worker.terminate()
				done()
			})
		})

		it(`closing thread should fire 'exit' event`, done => {
			var worker = new ProxyWorker(workerPath)
			worker.once('exit', done)
			worker.once('online', () => worker.terminate())
		})

		it(`terminating thread should fire 'exit' event with null and SIGTERM arguments`, done => {
			var worker = new ProxyWorker(workerPath)
			worker.on('exit', (exitCode, statusCode) => {
				assert.isNull(exitCode)
				assert.equal(statusCode, 'SIGTERM')
				done()
			})
			worker.once('online', () => worker.terminate())
		})

		it(`close()/process.exit() inside the worker should fire 'exit' event with code 0`, done => {
			var worker = new ProxyWorker(workerPath)
			worker.on('exit', code => {
				assert.equal(code, 0)
				done()
			})
			worker.once('online', () => {
				if (isBrowser) worker.postMessage({event: 'kys-close', args: []})
				if (isNode) worker.send({event: 'kys-process-exit', args: []})
			})
		})

		it(`close(1)/process.exit(1) inside the worker should fire 'exit' event with code 1`, done => {
			var targetCode = 1
			var worker = new ProxyWorker(workerPath)
			worker.on('exit', code => {
				assert.equal(code, targetCode)
				done()
			})
			worker.once('online', () => {
				if (isBrowser) worker.postMessage({event: 'kys-close', args: [targetCode]})
				if (isNode) worker.send({event: 'kys-process-exit', args: [targetCode]})
			})
		})

		/*it(`process.kill() inside the worker should ...`, done => {
			var targetSignal = 'SIGHUP'
			var worker = new ProxyWorker(workerPath)
			worker.on('exit', (code, signal) => {
				assert.equal(signal, targetSignal)
				done()
			})
			worker.once('online', () => {
				worker.send({event: 'kys-process-kill', args: [targetSignal]})
			})
		})*/

		it(`.ready promise exists`, async () => {
			// TODO
			var worker = new ProxyWorker(workerPath)
			assert.exists(worker.ready)
			assert.equal(worker.ready.constructor, Promise)
			worker.terminate()
		})

		it(`.ready should resolve after 'online' event`, async () => {
			// TODO
			var worker = new ProxyWorker(workerPath)
			await worker.ready
			assert.isTrue(worker.online)
			worker.terminate()
		})

/*
		if (isNode) {
			// TODO: figure out a way to forcibly kill thread so that it returns 1
			it(`closing/killing thread should fire 'exit' event with code 1`, done => {
				var worker = new ProxyWorker(workerPath)
				await timeout(100)
				worker.on('exit', code => {
					assert.equal(code, 0)
					done()
				})
				worker.kill()
			})
		}
*/


	})

	describe('master-worker communication', () => {

		// fixture worker
		var worker
		before(async () => {
			worker = new ProxyWorker(workerPath)
		})
		after(async () => worker.terminate())

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

		it(`worker.emit(...) should be available native or polyfilled`, () => {
			assert.isFunction(worker.emit)
		})

		it(`worker.on(...) should be available native or polyfilled`, () => {
			assert.isFunction(worker.on)
		})

		it(`should send raw .postMessage() and receive .addEventListener('message') response`, done => {
			worker.postMessage('hello-self')
			worker.addEventListener('message', ({data}) => {
				if (data === 'hello from self') done()
			})
		})

		it(`should send raw .send() and receive .on('message') response`, done => {
			worker.send('hello-process')
			worker.on('message', data => {
				if (data === 'hello from process') done()
			})
		})

		it(`EventEmitter styled .emit() / .on() with custom events`, done => {
			worker.emit('custom-event', ['hello', 'worker'])
			worker.on('custom-reply', data => {
				if (data === 'hello master') done()
			})
		})

	})


	describe('context, autowrap', () => {

		describe('resolvePath()', () => {

			it(`simple`, async () => {
				var myCtx = fachman.setContext({foobar: 42})
				assert.include(fachman.contexts, myCtx)
				var result = fachman.resolvePath('foobar')
				assert.equal(result, 42)
				removeFromArray(fachman.contexts, myCtx)
			})

			it(`nested`, async () => {
				var myCtx = fachman.setContext({deeply: {nested: {foobar: 41}}})
				assert.include(fachman.contexts, myCtx)
				var result = fachman.resolvePath('deeply.nested.foobar')
				assert.equal(result, 41)
				removeFromArray(fachman.contexts, myCtx)
			})

			it(`simple in secondary context`, async () => {
				var mainCtx = fachman.setContext({foobar: 42})
				var dummyCtx = fachman.setContext({})
				var result = fachman.resolvePath('foobar')
				assert.equal(result, 42)
				removeFromArray(fachman.contexts, mainCtx)
				removeFromArray(fachman.contexts, dummyCtx)
			})

			it(`nested in secondary context`, async () => {
				var mainCtx = fachman.setContext({deeply: {nested: {foobar: 41}}})
				var dummyCtx = fachman.setContext({})
				var result = fachman.resolvePath('deeply.nested.foobar')
				assert.equal(result, 41)
				removeFromArray(fachman.contexts, mainCtx)
				removeFromArray(fachman.contexts, dummyCtx)
			})

		})

		/*it('autowrap', async () => {
			assert.equal(true, false)
		})
		it('autowrap false', async () => {
			assert.equal(true, false)
		})*/

		describe('manual setContext()', () => {

			var worker
			before(async () => {
				worker = new ProxyWorker('worker-module-setcontext.js', {
					autoWrapWorker: false
				})
				await worker.ready
			})
			after(async () => worker.terminate())

			it('should locate simple methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'echo'))
			})

			it('should locate nested methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'deeply.nested.echo'))
			})

		})

		describe('manual register()', () => {

			var worker
			before(async () => {
				worker = new ProxyWorker('worker-module-register.js', {
					autoWrapWorker: false
				})
				await worker.ready
			})
			after(async () => worker.terminate())

			it('should locate simple methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'echo'))
			})

			it('should locate nested methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'deeply.nested.echo'))
			})

		})

		describe('autocontext cjs', () => {

			var worker
			before(async () => {
				worker = new ProxyWorker('worker-module-cjs.js', {
					autoWrapWorker: false
				})
				await worker.ready
			})
			after(async () => worker.terminate())

			it('should locate simple methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'echo'))
			})

			it('should locate nested methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'deeply.nested.echo'))
			})

		})

		describe('autocontext esm', () => {

			var worker
			before(async () => {
				worker = new ProxyWorker('worker-module-esm.js', {
					autoWrapWorker: false
				})
				await worker.ready
			})
			after(async () => worker.terminate())

			it('should locate simple methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'echo'))
			})

			it('should locate nested methods', async () => {
				assert.equal('function', await getTypeOf(worker, 'deeply.nested.echo'))
			})

		})

	})

	describe('task invocation', () => {

		// fixture worker
		var worker, proxy
		before(async () => {
			worker = new ProxyWorker(workerPath)
			proxy = worker.proxy
		})
		after(async () => worker.terminate())

		it(`invokeTask()`, async () => {
			//await onPromise(worker, 'online')
			var startTime = Date.now()
			var input = 'this will get returned in 100ms'
			var output = await worker.invokeTask({
				path: 'asyncEcho',
				args: [input, 100]
			})
			assert.equal(input, output)
			// There's 100ms delay inside the function, the rest (messaging in and out)
			// should take another 100ms at most
			assert.isBelow(Date.now() - startTime, 200)
		})


		it('proxy should execute simple sync methods', async () => {
			var result = await proxy.syncHello()
			assert.equal(result, 'hello world')
		})

		it('proxy should execute simple async methods', async () => {
			var result = await proxy.asyncHello()
			assert.equal(result, 'hello world')
		})

		it('proxy should execute arguments and return result', async () => {
			// returns 2+3 * 2+3
			var result = await proxy.compute(2, 3)
			assert.equal(result, 25)
		})

		it('proxy should execute nested methods', async () => {
			var result = await proxy.deeply.nested.syncHello()
			assert.equal(result, 'hello world')
		})

		it(`tasks should be removed from _taskResolvers after finishing`, async () => {
			assert.isEmpty(worker._taskResolvers)
			var promise1 = proxy.asyncHello()
			assert.equal(worker._taskResolvers.size, 1)
			var promise2 = proxy.syncHello()
			var promise3 = proxy.echo('foo')
			assert.equal(worker._taskResolvers.size, 3)
			await Promise.all([promise1, promise2, promise3])
			assert.isEmpty(worker._taskResolvers)
		})

	})


	describe('shared memory & transferables (only available in Web Workers = browser)', () => {

		// TypedArray, ArrayBuffer, SharedArrayBuffer and transferables is only available in browsers.
		// No need to test it in browser.
		if (isNode) return

		// fixture worker
		var worker, proxy
		beforeEach(async () => {
			worker = new ProxyWorker(workerPath)
			proxy = worker.proxy
		})
		afterEach(async () => worker.terminate())

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
			var worker = cluster.workers[0]
			worker.once('exit', () => {
				// note: using equals and not isEmpty because chai would cause problems with proxy
				assert.equal(cluster.workers.length, 0)
				done()
			})
			worker.kill()
		})
	})

	it(`worker should be removed from .idleWorkers if it's closed`, done => {
		var cluster = new Cluster('test-worker.js', 1)
		cluster.ready.then(() => {
			var worker = cluster.workers[0]
			worker.once('exit', () => {
				// note: using equals and not isEmpty because chai would cause problems with proxy
				assert.equal(cluster.idleWorkers.size, 0)
				done()
			})
			worker.kill()
		})
	})

	it(`worker should be removed from .runningWorkers if it's closed`, done => {
		var cluster = new Cluster('test-worker.js', 1)
		cluster.ready.then(() => {
			var worker = cluster.workers[0]
			worker.once('exit', () => {
				// note: using equals and not isEmpty because chai would cause problems with proxy
				assert.equal(cluster.runningWorkers.size, 0)
				done()
			})
			worker.kill()
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

	var worker
/*
	before(done => {
		worker = new ProxyWorker(workerPath)
		worker.process.once('exit', code => {
			exitCode = code
			done()
		})
	})
	it('exit code should be zero', () => {
		assert.equal(exitCode, 0)
	})
*/

	if (isBrowser) describe('browser Worker', () => {
		var worker
		before(async () => worker = new ProxyWorker(workerPath))
		after(async () => worker.terminate())

		it('native self should be available', async () => {
			var type = await getTypeOfBrowser(worker, 'process')
			assert.equal(type, 'object')
		})
		it('native self.addEventListener() / self.postMessage() should be available', async () => {
			var type1 = await getTypeOfBrowser(worker, 'addEventListener')
			assert.equal(type1, 'function')
			var type2 = await getTypeOfBrowser(worker, 'postMessage')
			assert.equal(type2, 'function')
		})
		it('process should be shimmed', async () => {
			var type = await getTypeOfBrowser(worker, 'process')
			assert.equal(type, 'object')
		})

		//it('process is shimmed', async () => {
		//	var type = await worker.proxy.getType('process')
		//	assert.equals(type, 'object')
		//})

		/*it('require() is alias for importScripts()', async () => {
			assert.isFalse(true)
		})*/
	})

	if (isNode) describe('node ChildProcess', () => {
		var worker
		before(async () => worker = new ProxyWorker(workerPath))
		after(async () => worker.terminate())

		it(`should shim 'self'`, async () => {
			var type = await getTypeOfNode(worker, 'self')
			assert.equal(type, 'object')
		})

		it('should shim self.addEventListener()', async () => {
			var type = await getTypeOfNode(worker, 'self.addEventListener')
			assert.equal(type, 'function')
		})

		it('should shim self.postMessage()', async () => {
			var type = await getTypeOfNode(worker, 'self.postMessage')
			assert.equal(type, 'function')
		})

		it('importScripts() is alias for (multiple) require()', async () => {
			var type = await getTypeOfNode(worker, 'importScripts')
			assert.equal(type, 'function')
		})
	})

	it('self.close() should close the worker with', async () => {
		var worker = new ProxyWorker(workerPath)
		assert.isFalse(worker.online)
		await onPromise(worker, 'online')
		assert.isTrue(worker.online)
		worker.emit('kys-close')
		await onPromise(worker, 'exit')
		assert.isFalse(worker.running)
		assert.isFalse(worker.online)
	})

	it('process.exit() should close the worker with', async () => {
		var worker = new ProxyWorker(workerPath)
		assert.isFalse(worker.online)
		await onPromise(worker, 'online')
		assert.isTrue(worker.online)
		worker.emit('kys-process-exit')
		await onPromise(worker, 'exit')
		assert.isFalse(worker.running)
		assert.isFalse(worker.online)
	})

	it('self.close() should close the worker with code 0', done => {
		var worker = new ProxyWorker(workerPath)
		worker.on('online', () => worker.emit('kys-close'))
		worker.on('exit', code => {
			assert.equal(code, 0)
			done()
		})
	})

	it('process.exit() should close the worker with code 0', done => {
		var worker = new ProxyWorker(workerPath)
		worker.on('online', () => worker.emit('kys-process-exit'))
		worker.on('exit', code => {
			assert.equal(code, 0)
			done()
		})
	})

	it('self.close(1) should close the worker with code 1', done => {
		var worker = new ProxyWorker(workerPath)
		worker.on('online', () => worker.emit('kys-close', 1))
		worker.on('exit', code => {
			assert.equal(code, 1)
			done()
		})
	})

	it('process.exit(1) should close the worker with code 1', done => {
		var worker = new ProxyWorker(workerPath)
		worker.on('online', () => worker.emit('kys-process-exit', 1))
		worker.on('exit', code => {
			assert.equal(code, 1)
			done()
		})
	})

	/*it('process.kill() should kill the process', done => {
		var worker = new ProxyWorker(workerPath)
		worker.on('online', async () => {
			worker.emit('kys-process-kill')
			await timeout(400)
			isClosed(worker)
			done()
		})
	})*/

	// TODO

})

describe('inline worker creation', () => {

	var bloburl = 'blob:http://localhost/0154daf6-2bbb-40bf-a5dd-ff3b02a83f09'

	

})

/*
// NOTE: for now keps only as a concept because this would only work in browser and not in node
describe('inline worker creation', () => {

	it('closing thread should clean up listeners and cancel tasks', done => {
		var worker = new ProxyWorker(workerPath)
		worker.on('exit', () => {
			assert.isEmpty(worker._taskResolvers)
			done()
		})
		setTimeout(() => worker.terminate(), 100)
	})

	it('should create worker from a string of code', done => {
		var text = 'worker created from a string'
		var code = `self.postMessage('${text}')`
		var worker = new ProxyWorker(code)
		worker.addEventListener('message', e => {
			assert.equal(e.data, text)
			done()
		})
		setTimeout(() => worker.terminate(), 100)
	})

	it('should create worker from a function', async () => {
		function bark() {
			return 'woof'
		}
		var worker = new ProxyWorker(bark)
		var result = await worker.proxy.bark()
		assert.equal(true, false) // TODO
		setTimeout(() => worker.terminate(), 100)
	})

	it('should create worker from a class', async () => {
		class Foo {
			constructor(name) {
				this.name = name
			}
			bark() {
				return `woof ${this.name}!`
			}
		}
		var worker = new ProxyWorker(Foo)
		var remoteFoo = new worker.proxy.Foo('Zenyatta')
		var result = await remoteFoo.bark()
		assert.equal(true, false) // TODO
		setTimeout(() => worker.terminate(), 100)
	})

})
*/

function removeFromArray(array, item) {
	var index = array.indexOf(item)
	if (index !== -1)
		array.splice(index, 1)
}

function onPromise(scope, event) {
	return new Promise(resolve => scope.on(event, resolve))
}

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

function getTypeOf(worker, path) {
	worker.emit('typeof', path)
	return onPromise(worker, 'typeis')
}

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
	if (ctor === ArrayBuffer || ctor === SharedArrayBuffer)
		arg = new Uint8Array(arg)
	if (Array.isArray(arg) || arg instanceof Uint8Array)
		return arrayToString(arg)
	else
		return arg.toString()
}

if (isBrowser)
	mocha.run()

