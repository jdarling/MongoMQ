MongoMQ - Node.js MongoMQ
=========================
Installation
============

From GitHub
-----------
  * Download from GitHub and extract.
  * npm install mongodb

Using NPM
---------
  * npm install mongomq
    
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

MongoMQ.on(msgType, passive, callback);
---------------------------------------
msgType
  * The message type to listen for
  
passive
  * If true will not mark the message as handled and will
  
callback(err, messageContents, next)
  * Use next() to look for another message in the queue, don't call next() if you only want a one time listener

MongoMQ.onAny(callback);
------------------------
NOTE: Passive by default and only reacts to events after handler is registered

callback(err, messageContents, next)
  * Use next() to look for another message in the queue, don't call next() if you only want a one time listener

MongoMQ.emit(msgType, messageContents);
---------------------------------------
msgType
  * The message type to send
  
messageContents
  * What to send

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

    var MongoMQ = require('../lib/MongoMQ').MongoMQ;
    var repl = require('repl');

    var queue = new MongoMQ();

    var r = repl.start({
          prompt: ">"
        });

    r.on('exit', function(){
      queue.close();
    });

    r.context.listen = function(){
      queue.on('test', function(err, data, next){
        console.log('got: ', data);
        next();
      });
    };

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

    r.context.queue = queue;