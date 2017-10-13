# Work in progress

This readme, just like the repo itself, is still very much a work in progress.

# Fachman

Writing multithreaded code has never been easier.

*Fachman means hard working expert in Czech language. And it sounds kinda cool.*

# Wat?

offers Promise based solution for calling code in, and retrieving data from separate worker thread.
Works across many platforms and can be used in both the browsers with native  and Nodejs. Thanks to Proxy the API mimics shape of your worker script and let's you call all the worker functions from main thread as if they were defined in main thread.

Spawns child processes in Node.js and creates Worker threads in browsers.

# Installation

```
coming soon to package manager near you
```

# Usage

`index.mjs` Imports tree of Node flavored `*.mjs` files written with ES Modules. Ideal for use in Node 8.5 (with flag).

`index.js` UMD bundle for simple drop-in use in browsers and older Node versions.

TODO - importing scripts in browser using `<script>` or `require()` in the main thread and with `importScripts()` or `require()` inside worker.
``` js
TODO
```
``` js
TODO
```

# Features

## Promise based tasks

Each function call returns Promise because of the asynchronous nature of working with separate threads. Doesn't matter wheter your worker functions are synchronous (return actual result) or asynchronous (return Promise object which will then resolve the value), main thread will always receive Promise resolving the result.

That being said. async/await is now natively widely availabe so you can hop onto the unicorn and ride into the sunset.

``` js
var pw = new ProxyWorker('worker.js')

// classic promise.then()
pw.proxy.cpuIntenseFunction(...)
    .then(result => console.log(result)

// async/await variation
var result = await pw.proxy.cpuIntenseFunction(...)
```

Note: Don't forget to wrap `await` calls in `async function() {...}`

## EventEmitter style `.on()` and `.emit()` on both ends

Fachman sets up EventEmitter interface on the outside (instance of `ProxyWorker` or `Cluster`) and inside of the worker (`self` object) and links them together. Emitting events on one of these sides replicates it on the end as well.

``` js
// master.js
var pw = new ProxyWorker('worker.js')
// notify worker about changed size of the window
window.addEventListener('resize', e => pw.emit('window-resized', innerWidth, innerHeight))
// listen for greetings from worker
pw.on('greeting', () => console.log('worker says hi'))
```
``` js
// worker.js
var windowWidth
var windowHeight
// list on any change in size of the window and adjust local variables
self.on('window-resized', (innerWidth, innerHeight) => {
    windowWidth = innerWidth
    windowHeight = innerHeight
})
// say hi to the master thread
self.emit('greeting')

```

Better yet. Emitting event on cluster trickles it down to all workers within the cluster.
``` js
// master.js
var cluster = new Cluster('worker.js')
// send 'window-resized' to all workers within cluster
window.addEventListener('resize', e => cluster.emit('window-resized', innerWidth, innerHeight))
```

## Packed with tons of sugar.
Proxies are being dynamically generated as you type so that `worker.proxy.deeply.nested.method(...)` does not throw error, but resolves into call of `deeply.nested.method(...)` in your worker script and propagates result back to your main thread call.

``` js
// master.js
var pw = new ProxyWorker('worker.js')
pw.proxy.deeply.nested.method([1,10,100])
    .then(result => console.log(result === 11))
```

``` js
// worker.js
var deeply = {
    nested: {
        method: arg => arg[0] + arg[1]
    }
}
```

Note: You can avoid using proxies and instead call `worker.invokeTask(...)`
``` js
var promise = worker.invokeTask({
    path: 'deeply.nested.method',
    args: [1,10,100]
})
```


## Batteries included.

### Autotransfer of memory between Workers.

WebWorkers in the browsers allow one-time unidirectional sharing of chunks of memory from master to worker or from worker to master. That prevents costly cloning of the memory. But the developers have to explicitly define which objects to transfer through second parameter `transferables` in `webworker.postMessage({img: imgBuffer}, [imgBuffer])`. Since we're building on top of this API and hiding it away from you, fachman automatically tries to find transferables in your data and tells browser to transfer them over to worker.

We believe this fits majority of usecases, but you can always opt out of this by setting `autoTransferArgs` option to `false`

More about transferables on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#Passing_data_by_transferring_ownership_(transferable_objects))

In the following example, you can see main thread fetching an image and then transfering in back and forth between worker which does some CPU intensive operations with the 

``` js
var response = await fetch('myImage.jpg')
// Fetches an image as a #1 buffer 
var arrayBuffer = await response.arrayBuffer()
// Transfers original #1 buffer to worker and receives a new #2 buffer that was created inside worker and transfered from worker to the main thread.
arrayBuffer = await worker.proxy.grayscale(arrayBuffer)
// Transfers #2 buffer to worker and receives #3 buffer.
arrayBuffer = await worker.proxy.sharpen(arrayBuffer, 1.8)
// Transfers #3 buffer to worker and receives #4 buffer.
if (resize)
    arrayBuffer = await worker.proxy.resizeImage(arrayBuffer, 300, 200)
// Transfers #2 buffer to worker and receives #5 buffer.
if (rotate)
    arrayBuffer = await worker.proxy.rotateImage(arrayBuffer, 'right')
await fetch({
    method: 'POST',
    body: arrayBuffer
})
console.log('image has been successfully downloaded, modified and reuploaded')
```

To take this example even further, the ArrayBufer could be transformed into SharedArrayBuffer and operations that do not change the length of the buffer (grayscale and sharpen in this example) could edit the data directly inside the very same buffer (the same place in memory) they receive.

``` js
...
var arrayBuffer = await response.arrayBuffer()
// Copy #1 ArrayBuffer's data into new #2 SharedArrayBuffer that can reside in both threads.
var sharedArrayBuffer = sharedArrayBufferFromArrayBuffer(arrayBuffer)
// Pass refference to #2 SAB buffer to the worker and let it modify the memory of the SAB
await worker.proxy.grayscale(sharedArrayBuffer)
// Pass refference to #2 SAB buffer to the worker and let it modify the memory of the SAB
await worker.proxy.sharpen(sharedArrayBuffer, 1.8)
// sharedArrayBuffer is still the same object pointing to the same space in memory that has been changed twice.
...
```

### worker scope

``` js
self.on()
self.emit()
```

*TO BE ELABORATED*

### WebWorker shim for Node.js

Node does not support WebWorker API and up until recently it was difficult to write multi threaded code (now you can at least use the new `cluster` module, but that's not perfect either).

*TO BE ELABORATED*

``` js
// ES modules style
import {Worker} from 'fachman'
// CJS style
var Worker = require('fachman').Worker
```

### EventEmitter shim

Like any good Node or Node-like API, fachman's classes inherit from EventEmitter class. But EventEmitter is not available in browser and bundling the original would add another 8kb (minimized).

## Familiar API

Fachman mimics APIs, events and general shape of both Worker class from WebWorkers spec available in browser, as well as Node's cluster module.

*TO BE ELABORATED*

# API

## `ProxyWorker` class

*TO BE ELABORATED*

### Constructor

`new ProxyWorker(workerPath, [workerOptions])` creates worker object, 

### Properties

`proxy` *Proxy*

`ready` *Promise*

`worker` *Worker*

`online`

`running`

`idle`

### Methods

`invokeTask`

`terminate`

`close`

`destroy`

### Events

`online`
Worker successfuly started and is now fully operational.

`exit(code)`
Thread was closed. Argument `code` describes how. 0 means it was closed gracefully by user. Any other code means error.

`idle`
No task is currently running on this thread.

`running`
Task is being executed on this thread.

`task-start(task)`
Internal event signalling that task has been sent to worker to execute it.

`task-end(task)`
Worker has finished processing task and has returned result or error.


## `Cluster` class

*TO BE ELABORATED*

### Constructor

`new Cluster([workerPath], workerOptions)`

`new Cluster(workerPath, [threads])`

### Properties

`proxy` *Proxy*

`ready` *Promise*

`running`

### Methods

### Events

## `workerOptions` object

`workerPath` *optional if workerPath is specified other way.*

Path to worker file to be created.

`threads` *optional* Number of threads to be created by `Cluster`.

Defaults to number of CPU cores (or threads in case of Intel CPU's with hyperthreading).

`canEnqueueTasks` *optional*

`startupDelay` *optional*

`workerStartupDelay` *optional*

`autoTransferArgs` *optional*

# Caveats

## Dependencies

While Fachman has no direct 3rd party dependency, it uses `EventEmitter` class from Node `events` module (aside from other core Node modules in Node portion of the code to shim/polyfill WebWorkers). To keep the filesize as little as possible it is not bundled with Fachmann. Instead, tiny shim of `EventEmitter` is. But `events` module will always be preffered and used if it's available.

UMD bundles, where U stands for Universal, can be used in any environments and module loaders. In node, dependencies will be `require()`'d, but in browsers they will be looked up in `window` or `self` object. It is generally a good idea to not have these global objects polluted with properties of names of Node modules like the afore mentioned `events` while containing something entirely else.

e.g. don't do `var events = ['something', 'my', 'app', 'does']` because it will end up as a `window.events` and might cause problems. However having custom (UMD) bundle of `events` module, that creates `window.events.EventEmitter` is nice (but you don't have to).

Other Node core modules used (but not required in browser) `events`, `child_process`, `net`, `os`.

## Using the same event names

Fachman internally uses a few events on the `ProxyWorker` and `Cluster` instances to pass information down to worker's `self` object and to overall control the lifecycle of a worker. For example `exit`, `online` and few others that can be seen in APIs.

These `EventEmitter`s are available to you for your app's needs, but please avoid using the same event names that fachman uses.

## Accessing global properties in worker

Variables and functions defined outside of any block are automatically assigned to `window` or `self` objects. That makes it easy for fachman to locate and call these functions.

ES class declaractions don't create properties on the global object and are thus inaccessible without explicitly exposing them.

``` js
// master.js
var pw = new ProxyWorker('worker.js')

pw.proxy.hello(42, 'fish') // works and calls hello() inside worker
pw.proxy.Encoder.myEncoder(...) // works and calls Encoder.myEncoder() inside worker
pw.proxy.Decoder.myDecoder(...) // error
```
``` js
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

# Future plans

## Streams

Support for Node's Streams and upcoming browser's [WHATWG Streams spec](https://streams.spec.whatwg.org/) is planned. 

If everything works out correctly, support will include [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream), [WritableStream](https://developer.mozilla.org/en-US/docs/Web/API/WritableStream), `.pipeTo()`, `.pipeThrough()` as well as Node's equvalent [Readable](https://nodejs.org/api/stream.html#stream_class_stream_readable), [Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable), `.pipe()`

# TODOs

* Registriy for publishing objects acessible in worker.
* support for streams. Both Node and the new browers ones.
* Durability - restart worker if it crashes/stops and restart ongoing tasks or offload them to another worker.
* More tests.