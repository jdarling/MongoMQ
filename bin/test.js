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