# Work in progress

This readme, just like the repo itself, is still very much a work in progress.

# Fachman

Writing multithreaded code has never been easier.

*Fachman means hard working expert in Czech language. And it sounds kinda cool.*

## Wat?

offers Promise based solution for calling code in, and retrieving data from separate worker thread.
Works across many platforms and can be used in both the browsers with native  and Nodejs. Thanks to Proxy the API mimics shape of your worker script and let's you call all the worker functions from main thread as if they were defined in main thread.

Spawns child processes in Node.js and creates Worker threads in browsers.

## Installation

```
coming soon to package manager near you
```

## Usage

`index.mjs` Imports tree of Node flavored `*.mjs` files written with ES Modules. Ideal for use in Node 8.5 (with flag).

`index.js` UMD bundle for simple drop-in use in browsers and older Node versions.

### Caveats

#### Dependencies

While Fachman has no direct 3rd party dependency, it uses `EventEmitter` class from Node `events` module (aside from other core Node modules in Node portion of the code to shim/polyfill WebWorkers). To keep the filesize as little as possible it is not bundled with Fachmann. Instead, tiny shim of `EventEmitter` is. But `events` module will always be preffered and used if it's available.

UMD bundles, where U stands for Universal, can be used in any environments and module loaders. In node, dependencies will be `require()`'d, but in browsers they will be looked up in `window` or `self` object. It is generally a good idea to not have these global objects polluted with properties of names of Node modules like the afore mentioned `events` while containing something entirely else.

e.g. don't do `var events = ['something', 'my', 'app', 'does']` because it will end up as a `window.events` and might cause problems. However having custom (UMD) bundle of `events` module, that creates `window.events.EventEmitter` is nice (but you don't have to).

Other Node core modules used (but not required in browser) `events`, `child_process`, `net`, `os`.


## Features

### Promise based

Each function call returns Promise because of the asynchronous nature of working with separate threads. Doesn't matter wheter your worker functions are synchronous (return actual result) or asynchronous (return Promise object which will then resolve the value), main thread will always receive Promise resolving the result.



That being said. async/await is now natively widely availabe so you can hop onto the unicorn and ride into the sunset.

``` js
// main.js
var worker = new ProxyWorker('worker.js')

// classic promise.then()
worker.proxy.cpuIntenseFunction(...)
	.then(result => console.log(result)

// async/await variation
var result = await worker.proxy.cpuIntenseFunction(...)
console.log(result)
```

Note: Don't forget to wrap `await` calls in `async function() {...}`

``` js
var response = await  fetch('myImage.jpg')
var imageArrayBuffer = await response.arrayBuffer()
imageArrayBuffer = await worker.proxy.grayscale(imageArrayBuffer)
imageArrayBuffer = await worker.proxy.sharpen(imageArrayBuffer, 2)
if (resize)
	imageArrayBuffer = await worker.proxy.resizeImage(imageArrayBuffer, 300, 200)
if (rotate)
	imageArrayBuffer = await worker.proxy.rotateImage(imageArrayBuffer, 'right')
await fetch({
	method: 'POST',
    body: imageArrayBuffer
})
console.log('image has been successfully downloaded, modified and reuploaded')
```

### Packed with tons of sugar.
Proxies are being dynamically generated as you type so that `worker.proxy.deeply.nested.method(...)` does not throw error, but resolves into call of `deeply.nested.method(...)` in your worker script and propagates result back to your main thread call.

``` js
// main.js
var worker = new ProxyWorker('worker.js')

worker.proxy.deeply.nested.method([1,10,100])
	.then(result => console.log(result === 11))
```

``` js
// worker.js

var deeply = {
	nested: {
    	method(arg) {
        	return arg[0] + arg[1]
        }
    }
}
```

Note: You can avoid using proxies and instead use `worker.invokeTask(...)`
```
var promise = worker.invokeTask({
	path: 'deeply.nested.method',
	args: [1,10,100]
})
```


### Batteries included.

#### WebWorker shim for Node.js
Node does not support WebWorker API and up until recently it was difficult to write multi threaded code (now you can at least.

#### Autotransfer of memory between Workers.
WebWorkers in the browsers allow one-time uni-directional sharing of chunks of memory from master to worker or from worker to master. That prevents costly cloning of memory. But developer has to explicitly define which objects to transfer through second parameter `transferables` in `webworker.postMessage({img: imgBuffer}, [imgBuffer])`. Since we're building on top of this API and hiding it away from you, fachman automatically tries to find transferables in your data and tells browser to transfer them over to worker.

We believe this fits majority of usecases, but you can always opt out of this by setting `autoTransferArgs` option to `false`

More about transferables on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#Passing_data_by_transferring_ownership_(transferable_objects))

#### EventEmitter shim

*TO BE ELABORATED*

### Familiar API

Fachman mimics APIs, events and general shape of both Worker class from WebWorkers spec available in browser, as well as Node's cluster module.

*TO BE ELABORATED*

## API

### ProxyWorker

*TO BE ELABORATED*

#### Constructor

`new ProxyWorker(workerPath, [options])` creates worker object, 

#### Properties

##### proxy
##### online
##### idle

#### Methods

##### invokeTask
##### terminate
##### close
##### destroy

#### Events

##### online

Worker successfuly started and is now fully operational.

##### exit(code)

The worker thread was closed.

Returns `code` argument where 0 means it was closed gracefully by user. Any other code means error.

##### idle

No task is currently running on this thread.

##### running

Task is being executed on this thread.

##### task-start(task)

Internal event signalling that task has been sent to worker to execute it.

##### task-end(task)

Worker has finished processing task and has returned result or error.


### Cluster

*TO BE ELABORATED*

`new Cluster([workerPath], options)`

`new Cluster(workerPath, [threads])`

### options object

#### [workerPath]
#### [threads]
#### canEnqueueTasks
#### startupDelay
#### workerStartupDelay
#### autoTransferArgs

## Caveats

Variables and functions defined outside of any block are automatically assigned to `window` or `self` objects. That makes it easy for fachman to locate and call these functions.

ES class declaractions don't create properties on the global object and are thus inaccessible without explicitly exposing them.

```
// master.js
var pw = new ProxyWorker('worker.js')

pw.proxy.hello(42, 'fish') // works and calls hello() inside worker
pw.proxy.Encoder.myEncoder(...) // works and calls Encoder.myEncoder() inside worker
pw.proxy.Decoder.myDecoder(...) // error
```
```
// worker.js
function hello(number, string) {
	return `this is the result. Number: ${number}, String: ${string}`
}

var Encoder = {
	myEncoder(...) {...}
}

class Decoder {
	static myDecoder(...) {...}
}

// typeof hello === 'function'
// typeof self.hello === 'function'

// typeof Encoder === 'object'
// typeof self.Encoder === 'object'
// typeof self.Encoder.myEncoder === 'function'

// typeof Decoder === 'function'
// typeof self.Decoder === 'undefined'
```

Apis for exposing such objects is planned.
*Shhh*... in the meantime, dirty trick always get the job done `self.Decoder = Decoder`. But you didn't hear it from me.

## TODOs

* Registriy for publishing objects acessible in worker.
* support for streams. Both Node and the new browers ones.
* Durability - restart worker if it crashes/stops and restart ongoing tasks or offload them to another worker.
* More tests.