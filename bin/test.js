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

r.context.send2 = function(){
  queue.emit('test2', msgidx);
  msgidx++;
};

r.context.load = function(){
  for(var i = 0; i<100; i++){
    queue.emit('test', msgidx);
    msgidx++;
  }
};

r.context.load2 = function(){
  for(var i = 0; i<100; i++){
    queue.emit('test2', msgidx);
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
var eatTest2 = function(err, data, next){
      console.log('eat2: ', data);
      next();
    };

r.context.logAny = function(){
  queue.onAny(logMsg);
};

r.context.eatTest = function(){
  queue.on('test', eatTest);
};

r.context.eatTest2 = function(){
  queue.on('test2', eatTest2);
};

r.context.start = function(cb){
  queue.start(cb);
};

r.context.stop = function(){
  queue.stop();
};

r.context.testOnce = function(){
  var handlers = queue.once('once', function(err, data, next){
      console.log('testOnce: ', data);
      next();
    });
  queue.emit('once', {foo: 'bar3'});
};

r.context.testAll = function(){
  r.context.logAny();
  r.context.eatTest();
  r.context.eatTest2();
  r.context.testOnce();
  r.context.send();
  r.context.send2();
  r.context.load();
  r.context.load2();
  r.context.testOnce();
  r.context.testOnce();
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

r.context.tmp = function(){
  queue.on('foo', function(err, data, next){
      console.log('foo got: ', err||data); 
      next({some: 'data', bar: data.bar});
      next({more: 'data', bar: data.bar});
      next({done: 'data', bar: data.bar}, true);
    });
  queue.emit('foo', {bar: 'none'}, function(err, data, next){console.log('test: ', data); next();});
  queue.emit('foo', {bar: 'some'}, function(err, data, next){console.log('partial: ', data); next();}, function(err, data, next){console.log('complete: ', data); next();});
};

//*
queue.start(function(){
});
//*/

r.context.queue = queue;
//process.stdout.write('\u001B[2J\u001B[0;0f');
r.context.help();