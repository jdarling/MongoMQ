MongoMQ - Node.js MongoMQ
=========================

Version 0.2.2 presents what should be the final API and should be feature complete, need to add a lot more test cases, documentation, samples, and etc to the project now.

Installation
============

From GitHub
-----------
  * Download from GitHub and extract.
  * npm install mongodb

Using NPM
---------
  * npm install mongomq

Requirements
============
  * Node.js - v0.8.2 or better (really only for the MongoMQ and Test.js scripts REPL support)
  * MongoDB - v2.0.2 or better (for Tailable Cursors, autoIndexId bug fix, and ReplicaSet fixes)
  
What is MongoMQ?
================

MongoMQ is a messaging queue built on top of Node.js and MongoDB's tailable cursors.  It allows for distributed of messages across workers in both a single reciever and broadcast method.

What MongoMQ is NOT
===================

MongoMQ does NOT (currently) support callback's once a message is processed.  Instead it is recommended that you use a one time listener to pickup responses if this is required.

Supported Methods
=================

new MongoMQ(options)
--------------------
options
  * mqCollectionName - Collection to store queue messages in, defaults to 'queue'
  * mqDB             - Database to store queue in, defaults to 'MongoMQ'
  * username         - Optional value of the username to validate against Mongo with
  * password         - Optional value of the password to validate against Mongo with
  * server           - If not running against a ReplicaSet this is the server to connect to
  * port             - If not running against a ReplicaSet this is the server port to connect with
  * servers[]        - If connecting to a ReplicaSet then this is a collection of {host: 'hostname', port: 1234} objects defining the root entry for the ReplicaSet
  * collectionSize   - The size in bytes to cap the collection at, defaults to 100000000
  * serverOptions    - An optional options object that will be passed to Mongo-Native when the Mongo connection is created
  * nativeParser     - Boolean (defaults false) to enable usage of Mongo-Native's native parser.  Only use this if you install mongodb with native support
  * autoStart        - Boolean (defaults true) if the MongoMQ instance should start itself up when created, if set to false you need to call MongoMQ.start()

MongoMQ.start([callback])
-------------------------

Starts the queue listener and sets up the emitter.

Params:
* callback - will be called once the queue is opened and all registered listeners are setup

MongoMQ.stop([callback])
------------------------

Stops listening for messages and closes the emitter.

Params:
* callback - will be called once the queue is completely close and all registered listeners have been shut down

MongoMQ.emit(msgType, data, [partialCallback], [completeCallback])
------------------------------------------------------------------

Places the a message of msgTye on the queue with the provided data for handlers to consume.

Params:
* msgType - The message type to emit.
* data - a JSON serializeable collection of data to be sent.
* partialCallback - Will be called for large or long running result sets to return partial data back.  Optional and if not present then completeCallback will be called with buffered results once all operations have completed.
* completeCallback - Will be called once all remote processing has been completed.  If partialCallback is not provided and completeCallback is provided a temporary buffer will be setup and the final result set will be sent to completeCallback.

MongoMQ.on(msgType, [passive||options], handler)
---------------------------------------

Sets up a listener for a specific message type.

Params:
* msgType - The message type to listen for
* passive - If true will not mark the message as handled when a message is consumed from the queue
* options - additional options that can be passed
* handler(err, messageContents, next) - Use next() to look for another message in the queue, don't call next() if you only want a one time listener
    * If you want to send back data or partial data use next(data, complete) where complete should be true if you have sent all of your responses, see test.js r.context.tmp for a simple example.

options -
  * passive - If true will not mark the message as handled when a message is consumed from the queue
  * hereOnOut - Boolean (defaults false) will only recieve messages from the time the listener was registered instead of all unconsumed messages if set to true


MongoMQ.onAny(handler)
----------------------

Sets up a passive listener for all messages that are placed on the queue.

Params:
* callback(err, messageContents, next) - Use next() to look for another message in the queue, don't call next() if you only want a one time listener

MongoMQ.indexOfListener([event], [handler])
-------------------------------------------

Provides back the index of the first listener that matches the supplied event and/or handler.  One or both of event and handler must be supplied.  Returns BOOLEAN false if no handler is found.

Params:
* event - The name of the event to look for.
* handler - The specific handler function to look for.

MongoMQ.getListenerFor([event], [handler])
------------------------------------------

Provides back the first listener that matches the supplied event and/or handler.  One or both of event and handler must be supplied.  Returns BOOLEAN false if no handler is found.

Params:
* event - The name of the event to look for.
* handler - The specific handler function to look for.

MongoMQ.removeListener([event], [handler])
------------------------------------------

Shuts down the first listener that matches the supplied event and/or handler and removes it from the listeners list.

Params:
* event - The name of the event to look for.
* handler - The specific handler function to look for.

MongoMQ.removeListeners(event)
------------------------------

Shuts down ALL listeners for the specified event and removes it from the listeners list.

Params:
* event - The name of the event to look for.

MongoMQ.removeAllListeners()
----------------------------

Shuts down ALL listeners and clears the listeners list.

How does MongoMQ work?
======================

MongoMQ sets up a tailable collection and then starts listeners using find in conjunction with findAndModify to pickup messages out of this collection.

Since MongoMQ is basically a wrapper around MongoDB's built in support for tailable cursors it is possible to place listeners built in other langauges on the "queue".

Sample Usage
============

  * Ensure MongoDB is up and running locally (or modify the config options to collect to your Mongo instance)
  * Start 3 copies of the bin/test.js script.
  * In two copies type listen() to setup a "test" message listener
  * In the 3rd copy type load() to send 100 test messages to the queue
  
You should see the two listeners pickup messages one at a time with whoever has resources to process picking up the message first.

bin/test.js
===========

```javascript
var MongoMQ = require('../lib/MongoMQ').MongoMQ;
var repl = require('repl');

var queue = new MongoMQ({
  autoStart: false
});

var r = repl.start({
      prompt: "testbed>"
    });
r.on('exit', function(){
  queue.stop();
});

var msgidx = 0;
r.context.send = function(){
  queue.emit('test', msgidx);
  msgidx++;
};

r.context.load = function(){
  for(var i = 0; i<100; i++){
    queue.emit('test', msgidx);
    msgidx++;
  }
};

var logMsg = function(err, data, next){
      console.log('LOG: ', data);
      next();
    };
var eatTest = function(err, data, next){
      console.log('eat: ', data);
      next();
    };

r.context.logAny = function(){
  queue.onAny(logMsg);
};

r.context.eatTest = function(){
  queue.on('test', eatTest);
};

r.context.start = function(cb){
  queue.start(cb);
};

r.context.stop = function(){
  queue.stop();
};

r.context.help = function(){
  console.log('Built in test methods:\r\n'+
      '  help()    - shows this message\r\n'+
      '  logAny()  - logs any message to the console\r\n'+
      '  eatTest() - consumes next available "test" message from the queue\r\n'+
      '  send()    - places a "test" message on the queue\r\n'+
      '  load()    - places 100 "test" messages on the queue\r\n'+
      '  start()   - start the queue listener\r\n'+
      '  stop()    - stop the queue listener\r\n'+
      '\r\nInstance Data\r\n'+
      '  queue - the global MongoMQ instance\r\n'
      );
  return '';
};

/*
queue.start(function(){
  r.context.eatTest();
});
*/

r.context.queue = queue;

r.context.help();
```
Planned Improvements
====================

  * Update the emit method and handler callbacks to allow placing an event on to the queue collection and receiving a response or responses from it.

Update History
==============

v0.2.2
  * Completed code to allow for callbacks and partial callbacks to be issued back to emit statements
  * Complteed refactoring of code to properly seperate functionality into objects

v0.2.1
  * Majorly refactored code
  * Added autoIndexId: true to queue collection creation
  * Better MongoMQ application with help()
  * Updated test application
  * Added an exception to emit() when you try to emit before start() has been called
  * fix to onAny so it will restart listeners after a close() and start() re-issue
  * Added remove*() methods
  * Changed close() to stop()
  * hereOnOut options - allows listeners to only pay attention to messages posted after they have been started up
  * Added ability to register listeners (via on and onAny) when queue is not started

v0.1.1
  * Bug fixes to on event
  * Added in new onAny register
  * Migrated code to retain cursor
  
v0.1.0
  * Initial release
  * More of a proof of concept
