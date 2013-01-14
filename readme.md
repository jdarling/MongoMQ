MongoMQ v0.3.x
==============

Version 0.3.x introduces new functionality and many bug fixes over v0.2.x.  It also introduces some minor changes to packet format and thus is not backwards compatable with v0.2.x

Biggest differences from 0.2.x to 0.3.x
=======================================

  * Partial callbacks were removed.  They didn't serve any purpose.
  * Large messages are pushed to GridFS (planned feature)
  * Message format changed, backward compatible for the most part, must turn on the options.support_v2 flag
  * OnAny has been temporarily removed, *BREAKING CHANGE*
  * Logging support (started, but not complete/tested)

Installation
============

From GitHub
-----------
  * Download from GitHub and extract.
  * change to extracted directory
  * execute "npm install"

Using NPM
---------
  * npm install mongomq

Requirements
============
  * Node.js - v0.8.2 or better (really only for the MongoMQ and Test.js scripts REPL support)
  * MongoDB - v2.1.2 or better (for Tailable Cursors, autoIndexId bug fix, and ReplicaSet fixes)

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

MongoMQ.emit(msgType, data, [completeCallback])
------------------------------------------------------------------

Places the a message of msgTye on the queue with the provided data for handlers to consume.

Params:

  * msgType - The message type to emit.
  * data - a JSON serializeable collection of data to be sent.
  * completeCallback - Will be called once all remote processing has been completed.

MongoMQ.on(msgType, [options], handler)
---------------------------------------

Sets up a listener for a specific message type.

Params:

* msgType - The message type to listen for can be a string or a regular expression
* options - additional options that can be passed
* handler(err, messageContents, next) - Use next() to look for another message in the queue, don't call next() if you only want a one time listener
    * If you want to send back data or partial data use next(data, complete) where complete should be true if you have sent all of your responses, see test.js r.context.tmp for a simple example.

options -

MongoMQ.listeners(event)
------------------------------------------

Provides back an array of listeners that matche the supplied event.  Returns an empty array if no listeners are subscribed to the event.

Params:
* event - The name of the event to look for.

MongoMQ.removeListener(event, handler)
------------------------------------------

Shuts down the first listener that matches the supplied event and handler and removes it from the listeners list.

Params:
* event - The name of the event to look for.
* handler - The specific handler function to look for.

MongoMQ.removeAllListeners(event)
------------------------------

Shuts down ALL listeners for the specified event and removes them from the listeners list.

Params:
* event - The name of the event to look for.

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
  autoStart: true
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

r.context.listen = function(){
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

How Events are stored
=====================

```javascript
{
  _id: ObjectId(), // for internal use only
  pkt_ver: 3, // Packet version that this message is being sent in
  event: event, // string that represents what type of event this is
  data: message, // Contains the actual message contents
  handled: false, // states if the message has been handled or not
  localTime: dt, // Local Date Time of when the message was put on the queue
  globalTime: new Date(dt-self.serverTimeOffset), // Date Time offset to server time of when the message was put on the queue
  pickedTime: new Date(dt-self.serverTimeOffset), // Date Time offset to server time of when the message was picked up from the queue
  host: string, // Contains the host name of the machine that initiated the event
  [response_id: string] // optional if the event expects response(s) this will be the conversation identifier used to track those responses
}
```

Update History
==============

v0.3 Update History
-------------------

v0.3.1
  * Added setTimeout to nextTick on startup to give Mongo a chance to get connceted to
  * Minor bug fix due to EventEmitter treating 'error' events specially
  * Tweak to once listeners to call next if it exists.  Shouldn't change anything but it is good practice.

v0.3.0
  * Initial release of v0.3.x, includes many new features and functionality along with many bug fixes.

v0.2 Update History
-------------------

v0.2.10&v0.2.11
  * Workaround for Mongo Native Driver not supporting tailed cursor auto-reconnects when Mongo server goes away.

v0.2.9
  * Change SafeDBDriver default value from false to true, this fixes the issue with multiple listeners picking up the same message since Mongo doesn't perform record locking on updates if this isn't true.
  * Fix autoStart
  * Resolves #9 and #10
  
v0.2.8
  * Upgraded code for new MongoDB Native Drivers (thanks mfrobben for starting points)
  * Readme cleanup (thanks ttezel for pointing this out and fixing it)
  * Resolves #7 and #6

v0.2.7
  * Fixed a cursor leak when using passive callbacks

v0.2.6
  * Bug fix related to relplica set configuration loading from config.json files

v0.2.5
  * General code cleanup and optimizations
  * Examples cleanup and fixes

v0.2.4
  * Examples added

v0.2.3
  * Minor bug fix related to passive listeners where a fromDT was not passed in the options
  * Added hostName to messages for better tracking/logging
  * Modified passive callback to pass the actual message as the "this" argument, you can now use this.event to get the actual event that was responded to
  * Updated the on() method to accept strings or regular expressions to filter events on

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