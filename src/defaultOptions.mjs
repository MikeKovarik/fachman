// Default setting is optimized for high intensity tasks and load ballancing
export var defaultOptions = {
	// By default each worker is executing only one task at a time. If more tasks are invoked
	// than there are available worker threads, the new tasks will be queued and waiting for
	// some preceeding task to finish, resulting in maximum utilization (load ballancing), because
	// the task will be executed on the next free worker. It's ideal for cpu intensive tasks,
	// but won't work well with not so intensive tasks that maybe incorporate timers, or wait
	// for something. In such cache the worker is waiting for task that isn't doing much, while blocking
	// queued tasks which could be running in parallel.
	canEnqueueTasks: false,
	// Workers are being loaded synchronously with the UI thread. This leads to noticeable
	// slowdown if large ammount of workers are started immediately alongside the main UI thread.
	// Test: 4 core i7 with hyperthreding, resulting in 8 workers, causes about 2 second slowdown.
	startupDelay: 100,
	// Spacing between creation of each worker.
	workerStartupDelay: 0,
	// Browser only
	// Each postMessage (both raw or through any other higher level API) data is crawled and searched for
	// arrays, buffers and arraybuffers that can be have their memory transfered from one thread to another.
	autoTransferArgs: true,
	// TODO - wrapping script in node by executing fachman and requiring it from there
	// TODO - constructing custom blobl url in browser (es modules only, not available yet)
	autoWrapWorker: true,
	// Can be one of:
	// - 'script' launches as bare script with 'importScripts' and 'require' functions.
	// - 'module' launches as ES Module with 'import' syntax enabled.
	// - undefined by default results in autodetection based on '.mjs' file extension.
	type: undefined
}