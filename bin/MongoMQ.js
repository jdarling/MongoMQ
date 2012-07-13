var MongoMQ = require('../lib/MongoMQ').MongoMQ;
var repl = require('repl');

var l = process.argv.length, tmp, names, reCmdLineStrip=/^(\-|\\|\/)*/i, opts = {};
for(var i = 2; i < l; i++){
  tmp = process.argv[i].replace(reCmdLineStrip, '').split('=');
  name = tmp.shift();
  if(tmp.length>0) val = tmp.join('=');
  else val = true;
  tmp = opts;
  names = name.split('.');
  while(names.length>1){
    name = names.shift();
    tmp = tmp[name]=tmp[name]||{};
  }
  tmp[names.shift()]=val;
}

var queue = new MongoMQ(opts);

var r = repl.start({
      prompt: "MongoMQ>"
    });

r.on('exit', function(){
  queue.close();
});

var funcName, value;
for(funcName in queue){
  value = queue[funcName];
  if(typeof(value)=='function'){
    r.context[funcName] = (function(f){
      return function(){
        f.apply(queue, arguments);
      };
    })(value);
  }
}

r.context.logAny = function(){
  queue.onAny(function(err, data, next){
    console.log(data);
    next();
  });
};

r.context.queue = queue;