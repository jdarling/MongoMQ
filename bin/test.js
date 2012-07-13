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

r.context.logAny = function(){
  queue.onAny(function(err, data, next){
    console.log(data);
    next();
  });
};

r.context.eatTest = function(){
  queue.on('test', function(err, data, next){
    console.log('eat: ', data);
    next();
  });
};

r.context.queue = queue;