mocha.setup('bdd')

var assert = chai.assert

var {Cluster, ProxyWorker, EventEmitter, Worker} = fachman

// Utility wrapper for promisified setTimeout
var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve), millis)



describe('library', () => {
	it('should export Cluster',           () => assert.exists(Cluster))
	it('should export ProxyWorker',       () => assert.exists(ProxyWorker))
	it('should export EventEmitter shim', () => assert.exists(EventEmitter))
	it('should export Worker shim',       () => assert.exists(Worker))
})

describe('ProxyWorker', () => {


	it('should create worker thread', () => {
		var {worker} = new ProxyWorker('test-worker.js')
		assert.exists(worker)
	})

	it('#terminate() should kill worker thread', () => {
		var pw = new ProxyWorker('test-worker.js')
		pw.terminate()
		// TODO
	})

	it('#close() should kill worker thread', () => {
		var pw = new ProxyWorker('test-worker.js')
		pw.close()
		// TODO
	})

	describe('master-worker communication', () => {
		var pw = new ProxyWorker('test-worker.js')
		var {worker} = pw
		it(`raw .postMessage() / .addEventListener('message')`, done => {
			worker.postMessage('echo')
			worker.addEventListener('message', e => {
				if (e.data === 'hello from worker') done()
			})
		})
		it(`EventEmitter .emit() / .on()`, done => {
			pw.emit('custom-event', ['hello', 'worker'])
			pw.on('custom-reply', data => {
				if (data === 'hello master') done()
			})
		})
	})


	describe('proxy', () => {

		var pw = new ProxyWorker('test-worker.js')
		var {proxy} = pw

		it('should handle simple sync methods', async () => {
			var result = await proxy.syncHello()
			assert.equal(result, 'hello world')
		})

		it('should handle simple async methods', async () => {
			var result = await proxy.asyncHello()
			assert.equal(result, 'hello world')
		})

		it('should handle simple sync methods', async () => {
			var result = await proxy.deeply.nested.syncHello()
			assert.equal(result, 'hello world')
		})

		it('should handle simple async methods', async () => {
			var result = await proxy.deeply.nested.asyncHello()
			assert.equal(result, 'hello world')
		})

		it('calls should handle arguments and return result', async () => {
			// returns 2+3 * 2+3
			var result = await proxy.compute(2, 3)
			assert.equal(result, 25)
		})

	})


	describe('shared memory & transferables', () => {

		// fixture worker
		var pw
		var proxy

		beforeEach(async () => {
			pw = new ProxyWorker('test-worker.js')
			proxy = pw.proxy
			//await timeout(500)
		})

		afterEach(async () => {
			pw.terminate()
			//await timeout(500)
		})

		// fixture data
		var string = 'hello world'
		var array = stringToArray(string)
/*
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
*/

		it(`ArrayBuffer is transfered from the main thread's memory into worker`, async () => {
			var inputUin8Array = new Uint8Array(array)
			var arrayBuffer = inputUin8Array.buffer
			assert.equal(arrayBuffer.byteLength, 11)
			proxy.echo(arrayBuffer)
			assert.equal(arrayBuffer.byteLength, 0)
		})

		it(`Uint8Array is transfered from the main thread's memory into worker`, async () => {
			var input = new Uint8Array(array)
			assert.lengthOf(input, 11)
			proxy.echo(input)
			assert.lengthOf(input, 0)
		})

		it(`ArrayBuffer is transfered to and returned from worker`, async () => {
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

		it(`Uint8Array is transfered to and returned from worker`, async () => {
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

})


describe('self Worker', () => {

	it('#close() should gracefuly close the worker from within', async () => {
		var pw = new ProxyWorker('test-worker.js')
		// Emit that tells worker to trigget self.close() in 300ms
		pw.emit('kys')
		await timeout(400)
		assert.isFalse(pw.running)
		assert.isFalse(pw.idle)
		assert.isTrue(pw.closed)
	})

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

mocha.run()

